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
  router.post('/exchange', async (req, res, next) => {
    if (req.headers.origin !== config.corsOrigin) { res.status(403).json({ message: 'Invalid origin.' }); return; }
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const ticket = tickets.get(code);
    if (!ticket || binding(req) !== ticket.binding) { res.status(401).json({ message: 'Sign-in expired. Please try again.' }); return; }
    tickets.delete(code);
    res.clearCookie(cookieName, cookie);
    try {
      const user = await users.findById(ticket.userId);
      if (!user?.isVerified) { res.status(401).json({ message: 'Account is unavailable.' }); return; }
      res.json(jwt.generateTokens(user.id, user.role, user.tokenVersion ?? 0));
    } catch (error) { next(error); }
  });
  return router;
}
