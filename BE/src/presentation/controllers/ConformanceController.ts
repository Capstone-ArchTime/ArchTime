import type { NextFunction, Request, Response } from "express";
import type {
  CheckConformanceUseCase, DecideFindingUseCase, ExplainFindingUseCase, ListConformanceUseCase, UnreadFindingsUseCase,
} from "../../application/use-cases/conformance/ConformanceUseCases.js";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export class ConformanceController {
  constructor(
    private readonly check: CheckConformanceUseCase,
    private readonly list: ListConformanceUseCase,
    private readonly decide: DecideFindingUseCase,
    private readonly explain: ExplainFindingUseCase,
    private readonly unreadFindings?: UnreadFindingsUseCase,
  ) {}

  /** GET /api/conformance/unread — MSG26: open findings each maintainer has not looked at, per project. */
  unread = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.user(req);
      if (!this.unreadFindings) { sendSuccess(res, { total: 0, projects: [] }); return; }
      sendSuccess(res, await this.unreadFindings.unread({ userId, role: req.user?.role ?? "user" }));
    } catch (error) { next(error); }
  };

  /** POST /api/projects/:id/conformance/seen — the person has looked at this project's findings. */
  seen = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.user(req);
      await this.unreadFindings?.markSeen(req.params.id, userId);
      sendSuccess(res, { seen: true });
    } catch (error) { next(error); }
  };

  private user(req: Request): string {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedError();
    return userId;
  }

  overview = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await this.list.overview(req.params.id)); } catch (error) { next(error); }
  };

  findings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = text(req.query.status);
      const findings = await this.list.findings(req.params.id, {
        snapshotId: text(req.query.snapshotId), type: text(req.query.type),
        status: status as "open" | "decided" | undefined,
        limit: req.query.limit ? Number(req.query.limit) || undefined : undefined,
      });
      sendSuccess(res, { findings });
    } catch (error) { next(error); }
  };

  run = async (req: Request, res: Response, next: NextFunction) => {
    try {
      this.user(req);
      sendSuccess(res, await this.check.execute(req.params.id, { force: req.body?.force === true }), { message: "Conformance check finished." });
    } catch (error) { next(error); }
  };

  decision = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const finding = await this.decide.execute({
        projectId: req.params.id, findingId: req.params.findingId, decision: req.body?.decision, note: req.body?.note, userId: this.user(req),
      });
      sendSuccess(res, { finding });
    } catch (error) { next(error); }
  };

  explanation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refresh = req.body?.refresh === true;
      // Asking the model again costs money: only people who can change the project may do it. The first answer is shared.
      if (refresh && !req.projectAccess?.actions.has("write")) throw new ForbiddenError("Only maintainers can ask for a new explanation.");
      const finding = await this.explain.execute({ projectId: req.params.id, findingId: req.params.findingId, userId: this.user(req), refresh });
      sendSuccess(res, { finding });
    } catch (error) { next(error); }
  };
}
