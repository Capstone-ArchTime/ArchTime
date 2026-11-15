import type { Request, Response, NextFunction } from "express";
import type { GetAdminOrganizationsUseCase, SuspendOrganizationUseCase } from "../../application/use-cases/admin/GetAdminOrganizationsUseCase.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

/** Organizations for System Administrators: metadata only (see GetAdminOrganizationsUseCase), and suspension (RF-14). */
export class AdminOrganizationController {
  constructor(private readonly organizations: GetAdminOrganizationsUseCase, private readonly suspension?: SuspendOrganizationUseCase) {}

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

  suspend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organization = await this.required().suspend({ organizationId: req.params.id, adminId: this.admin(req), reason: req.body?.reason, ipAddress: req.ip });
      sendSuccess(res, { organization }, { message: "Organization suspended." });
    } catch (error) { next(error); }
  };

  reactivate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organization = await this.required().reactivate({ organizationId: req.params.id, adminId: this.admin(req), ipAddress: req.ip });
      sendSuccess(res, { organization }, { message: "Organization reactivated." });
    } catch (error) { next(error); }
  };

  private required(): SuspendOrganizationUseCase {
    if (!this.suspension) throw new Error("Organization suspension is not configured.");
    return this.suspension;
  }

  private admin(req: Request): string {
    const id = req.user?.userId;
    if (!id) throw new UnauthorizedError("Authentication required.");
    return id;
  }
}
