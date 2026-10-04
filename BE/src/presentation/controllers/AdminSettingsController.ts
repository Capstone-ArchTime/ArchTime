import type { Request, Response, NextFunction } from "express";
import type { GetAdminSettingsUseCase } from "../../application/use-cases/admin/GetAdminSettingsUseCase.js";
import type { UpdateAdminSettingsUseCase } from "../../application/use-cases/admin/UpdateAdminSettingsUseCase.js";
import type { CreateAdminApiKeyUseCase } from "../../application/use-cases/admin/CreateAdminApiKeyUseCase.js";
import type { RevokeAdminApiKeyUseCase } from "../../application/use-cases/admin/RevokeAdminApiKeyUseCase.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class AdminSettingsController {
  constructor(
    private readonly getAdminSettingsUseCase: GetAdminSettingsUseCase,
    private readonly updateAdminSettingsUseCase: UpdateAdminSettingsUseCase,
    private readonly createAdminApiKeyUseCase: CreateAdminApiKeyUseCase,
    private readonly revokeAdminApiKeyUseCase: RevokeAdminApiKeyUseCase,
  ) {}

  public getSettings = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const settings = await this.getAdminSettingsUseCase.execute();
      sendSuccess(res, { settings });
    } catch (error) {
      next(error);
    }
  };

  public updateSettings = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const adminUserId = req.user?.userId;
      if (!adminUserId) throw new UnauthorizedError("Authentication required.");

      const {
        maxConcurrentJobs,
        maxRepoSizeMb,
        miningTimeoutMinutes,
        defaultLlmProvider,
        maintenanceMode,
        allowPublicRegistration,
      } = req.body;

      const settings = await this.updateAdminSettingsUseCase.execute({
        maxConcurrentJobs,
        maxRepoSizeMb,
        miningTimeoutMinutes,
        defaultLlmProvider,
        maintenanceMode,
        allowPublicRegistration,
        adminUserId,
      });

      sendSuccess(res, { settings }, { message: "System settings updated successfully." });
    } catch (error) {
      next(error);
    }
  };

  public createApiKey = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const adminUserId = req.user?.userId;
      if (!adminUserId) throw new UnauthorizedError("Authentication required.");

      const { name } = req.body;
      const result = await this.createAdminApiKeyUseCase.execute({
        name,
        adminUserId,
      });

      sendSuccess(res, result, {
        statusCode: 201,
        message: "API key created successfully. Save it now, it won't be shown again.",
      });
    } catch (error) {
      next(error);
    }
  };

  public revokeApiKey = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const adminUserId = req.user?.userId;
      if (!adminUserId) throw new UnauthorizedError("Authentication required.");

      const { id } = req.params;
      await this.revokeAdminApiKeyUseCase.execute({
        keyId: id,
        adminUserId,
      });

      sendSuccess(res, null, { message: "API key revoked successfully." });
    } catch (error) {
      next(error);
    }
  };
}
