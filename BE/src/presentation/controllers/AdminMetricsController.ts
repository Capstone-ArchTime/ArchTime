import type { Request, Response, NextFunction } from "express";
import type { GetAdminMetricsUseCase } from "../../application/use-cases/admin/GetAdminMetricsUseCase.js";
import type { GetAdminServicesStatusUseCase } from "../../application/use-cases/admin/GetAdminServicesStatusUseCase.js";
import type { GetAdminLogsUseCase } from "../../application/use-cases/admin/GetAdminLogsUseCase.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class AdminMetricsController {
  constructor(
    private readonly getAdminMetricsUseCase: GetAdminMetricsUseCase,
    private readonly getAdminServicesStatusUseCase: GetAdminServicesStatusUseCase,
    private readonly getAdminLogsUseCase: GetAdminLogsUseCase,
  ) {}

  public getMetrics = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const metrics = await this.getAdminMetricsUseCase.execute();
      sendSuccess(res, metrics);
    } catch (error) {
      next(error);
    }
  };

  public getServicesStatus = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = await this.getAdminServicesStatusUseCase.execute();
      sendSuccess(res, status);
    } catch (error) {
      next(error);
    }
  };

  public getLogs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const level = typeof req.query.level === "string" ? (req.query.level as any) : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;

      const result = await this.getAdminLogsUseCase.execute({
        page,
        limit,
        level,
        search,
      });

      sendSuccess(res, { logs: result.logs }, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  };
}
