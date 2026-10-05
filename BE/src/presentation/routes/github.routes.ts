import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import type { GitHubIdentityService } from '../../infrastructure/services/GitHubIdentityService.js';
import type { GitHubLoginUseCase } from '../../application/use-cases/GitHubLoginUseCase.js';
import type { JwtTokenService } from '../../infrastructure/services/JwtTokenService.js';
import type { IUserRepository } from '../../domain/interfaces/IUserRepository.js';
import { ConflictError } from '../../shared/errors/AppError.js';

type Config = { githubClientId: string; githubClientSecret: string; githubCallbackUrl: string; corsOrigin: string };
export function createGitHubRouter(config: Config, identity: GitHubIdentityService,
  login: GitHubLoginUseCase, users: IUserRepository, jwt: JwtTokenService) {
  const router = Router();
  const pending = new Map<string, { binding: string; verifier: string; expires: number }>();
  const tickets = new Map<string, { binding: string; userId: string; expires: number }>();
  const cookieName = 'archtime_github';
  const cookie = { httpOnly: true, sameSite: 'lax' as const, secure: config.githubCallbackUrl.startsWith('https:'), path: '/api/auth/github' };
  const binding = (req: Request) => req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const sweep = () => { for (const map of [pending, tickets]) for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key); };
  const failUrl = (reason: string) => `${config.corsOrigin}/auth/github/callback#error=${reason}`;
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); sweep(); next(); });

  /**
   * @swagger
   * /api/auth/github:
   *   get:
   *     tags: [GitHub OAuth]
   *     summary: Bắt đầu luồng đăng nhập GitHub
   *     description: |
   *       Redirect người dùng sang GitHub để cấp quyền. Sử dụng PKCE (S256) và state parameter
   *       để chống CSRF. Đặt HTTP-only cookie để bind phiên OAuth.
   *       Sau khi người dùng cấp quyền, GitHub redirect về `/api/auth/github/callback`.
   *     responses:
   *       302:
   *         description: Redirect sang trang xác thực GitHub
   *         headers:
   *           Location:
   *             schema: { type: string }
   *             description: URL xác thực GitHub (https://github.com/login/oauth/authorize?...)
   *           Set-Cookie:
   *             schema: { type: string }
   *             description: HTTP-only cookie để bind phiên OAuth (archtime_github)
   */
  router.get('/', (_req, res) => {
    if (!config.githubClientId || !config.githubClientSecret) { res.redirect(failUrl('unavailable')); return; }
    if (pending.size >= 5000) { res.redirect(failUrl('unavailable')); return; }
    const state = randomBytes(32).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    pending.set(state, { binding: secret, verifier, expires: Date.now() + 600_000 });
    res.cookie(cookieName, secret, { ...cookie, maxAge: 600_000 });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({ client_id: config.githubClientId, redirect_uri: config.githubCallbackUrl,
      scope: 'read:user user:email', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    res.redirect(url.toString());
  });

  /**
   * @swagger
   * /api/auth/github/callback:
   *   get:
   *     tags: [GitHub OAuth]
   *     summary: GitHub OAuth callback (server-to-server)
   *     description: |
   *       GitHub redirect về endpoint này sau khi người dùng cấp quyền.
   *       Server xác minh state + PKCE, đổi authorization code lấy GitHub access token,
   *       tạo/tìm tài khoản ArchTime, sau đó redirect FE kèm ticket code dùng một lần.
   *
   *       **Không gọi trực tiếp** — endpoint này chỉ nhận redirect từ GitHub.
   *     parameters:
   *       - in: query
   *         name: code
   *         schema: { type: string }
   *         description: Authorization code từ GitHub
   *       - in: query
   *         name: state
   *         schema: { type: string }
   *         description: State parameter để xác minh CSRF
   *       - in: query
   *         name: error
   *         schema: { type: string }
   *         description: Mã lỗi nếu người dùng từ chối cấp quyền
   *     responses:
   *       302:
   *         description: |
   *           Redirect về FE:
   *           - Thành công: `{corsOrigin}/auth/github/callback#code={ticket}`
   *           - Lỗi: `{corsOrigin}/auth/github/callback#error={reason}`
   *
   *           Các lý do lỗi: `invalid_state`, `cancelled`, `email_exists`, `failed`
   */
  router.get('/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const flow = pending.get(state);
    if (!flow || binding(req) !== flow.binding) { res.redirect(failUrl('invalid_state')); return; }
    pending.delete(state);
    if (req.query.error || typeof req.query.code !== 'string') { res.clearCookie(cookieName, cookie); res.redirect(failUrl('cancelled')); return; }
    try {
      const userId = await login.execute(await identity.identify(req.query.code, flow.verifier));
      const ticket = randomBytes(32).toString('base64url');
      tickets.set(ticket, { userId, binding: flow.binding, expires: Date.now() + 60_000 });
      res.redirect(`${config.corsOrigin}/auth/github/callback#code=${ticket}`);
    } catch (error) {
      res.clearCookie(cookieName, cookie);
      res.redirect(failUrl(error instanceof ConflictError ? 'email_exists' : 'failed'));
    }
  });

  /**
   * @swagger
   * /api/auth/github/exchange:
   *   post:
   *     tags: [GitHub OAuth]
   *     summary: Đổi ticket code lấy JWT tokens
   *     description: |
   *       FE gửi ticket code (nhận từ redirect callback) để lấy access/refresh tokens.
   *       Ticket chỉ dùng được một lần và hết hạn sau 60 giây.
   *       Yêu cầu cookie `archtime_github` và header `Origin` khớp với `CORS_ORIGIN`.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code:
   *                 type: string
   *                 description: Ticket code nhận từ GitHub callback redirect
   *                 example: "aB3dE5fG7hI9jK1..."
   *     responses:
   *       200:
   *         description: Đổi ticket thành công, trả về JWT tokens
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data:
   *                 accessToken: "eyJhbGci..."
   *                 refreshToken: "eyJhbGci..."
   *       401:
   *         description: Ticket không hợp lệ, hết hạn, hoặc cookie không khớp
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error:
   *                 code: "TOKEN_INVALID"
   *                 message: "Sign-in expired. Please try again."
   *       403:
   *         description: Origin header không khớp với CORS_ORIGIN
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error:
   *                 code: "FORBIDDEN"
   *                 message: "Invalid origin."
   */
  router.post('/exchange', async (req, res, next) => {
    if (req.headers.origin !== config.corsOrigin) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid origin.' } });
      return;
    }
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const ticket = tickets.get(code);
    if (!ticket || binding(req) !== ticket.binding) {
      res.status(401).json({ success: false, error: { code: 'TOKEN_INVALID', message: 'Sign-in expired. Please try again.' } });
      return;
    }
    tickets.delete(code);
    res.clearCookie(cookieName, cookie);
    try {
      const user = await users.findById(ticket.userId);
      if (!user?.isVerified) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Account is unavailable.' } });
        return;
      }
      const tokens = jwt.generateTokens(user.id, user.role, user.tokenVersion ?? 0);
      res.json({ success: true, data: tokens });
    } catch (error) { next(error); }
  });
  return router;
}
