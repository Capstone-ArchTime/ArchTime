import type { Request, Response, NextFunction } from "express";
import type { GetAdminOrganizationsUseCase } from "../../application/use-cases/admin/GetAdminOrganizationsUseCase.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

/** Organizations for System Administrators: metadata only (see GetAdminOrganizationsUseCase). */
export class AdminOrganizationController {
  constructor(private readonly organizations: GetAdminOrganizationsUseCase) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizations, meta } = await this.organizations.list({ page: req.query.page, limit: req.query.limit, search: req.query.search });
      sendSuccess(res, { organizations }, { meta });
    } catch (error) { next(error); }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organization = await this.organizations.get(req.params.id);
      sendSuccess(res, { organization });
    } catch (error) { next(error); }
  };
}
