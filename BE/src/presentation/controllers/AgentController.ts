import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AgentContextUseCases, AgentTokenUseCases } from "../../application/use-cases/agent/AgentUseCases.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by agentAuth: the project token the request came with. */
    agent?: { tokenId: string; projectId: string };
  }
}

export class AgentController {
  constructor(private readonly tokens: AgentTokenUseCases, private readonly contexts: AgentContextUseCases) {}

  private user(req: Request): string {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedError();
    return userId;
  }

  /** agentAuth: a project token, not a person's session (BR-30). The token decides the project. */
  agentAuth: RequestHandler = async (req, _res, next) => {
    try {
      req.agent = await this.tokens.authenticate(req.headers.authorization);
      next();
    } catch (error) { next(error); }
  };

  // ── For people (maintainers) ──
  listTokens = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, { tokens: await this.tokens.list(req.params.id) }); } catch (error) { next(error); }
  };

  createToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const created = await this.tokens.create({ projectId: req.params.id, userId: this.user(req), name: req.body?.name, expiresInDays: req.body?.expiresInDays });
      sendSuccess(res, created, { message: "Copy the token now: it is not shown again." });
    } catch (error) { next(error); }
  };

  revokeToken = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, { token: await this.tokens.revoke(req.params.id, req.params.tokenId, this.user(req)) }); } catch (error) { next(error); }
  };

  downloadAgentsMd = async (req: Request, res: Response, next: NextFunction) => {
    try { this.sendMarkdown(res, await this.contexts.agentsMd(req.params.id)); } catch (error) { next(error); }
  };

  // ── For agents ──
  context = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await this.contexts.context(req.agent!.projectId, req.query.file)); } catch (error) { next(error); }
  };

  agentsMd = async (req: Request, res: Response, next: NextFunction) => {
    try { this.sendMarkdown(res, await this.contexts.agentsMd(req.agent!.projectId)); } catch (error) { next(error); }
  };

  private sendMarkdown(res: Response, file: { filename: string; content: string }) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(file.content);
  }
}
