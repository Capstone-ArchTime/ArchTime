import type { Request, Response, NextFunction } from "express";
import type { GetAdminAuditLogsUseCase } from "../../application/use-cases/admin/GetAdminAuditLogsUseCase.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class AdminAuditController {
  constructor(private readonly getAdminAuditLogsUseCase: GetAdminAuditLogsUseCase) {}

  public getAuditLogs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const action = typeof req.query.action === "string" ? req.query.action : undefined;
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const targetType = typeof req.query.targetType === "string" ? req.query.targetType : undefined;
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;

      const result = await this.getAdminAuditLogsUseCase.execute({
        page,
        limit,
        action,
        userId,
        targetType,
        from,
        to,
      });

      sendSuccess(res, { logs: result.logs }, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  };
}
