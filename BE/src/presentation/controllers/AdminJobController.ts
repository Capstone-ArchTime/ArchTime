import type { Request, Response, NextFunction } from "express";
import type { GetAdminJobsUseCase } from "../../application/use-cases/admin/GetAdminJobsUseCase.js";
import type { CancelAdminJobUseCase } from "../../application/use-cases/admin/CancelAdminJobUseCase.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class AdminJobController {
  constructor(
    private readonly getAdminJobsUseCase: GetAdminJobsUseCase,
    private readonly cancelAdminJobUseCase: CancelAdminJobUseCase,
  ) {}

  public getJobs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;

      const result = await this.getAdminJobsUseCase.execute({
        page,
        limit,
        status,
        kind,
        projectId,
        search,
      });

      sendSuccess(res, { jobs: result.jobs }, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  public cancelJob = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: jobId } = req.params;
      const adminUserId = req.user?.userId;

      if (!adminUserId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const job = await this.cancelAdminJobUseCase.execute({
        jobId,
        adminUserId,
      });

      sendSuccess(res, { job }, { message: "Job cancelled successfully." });
    } catch (error) {
      next(error);
    }
  };
}
