import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";
import { BadRequestError } from "../../../shared/errors/AppError.js";
import { AuditService } from "../../../infrastructure/services/AuditService.js";
import { AuditAction } from "../../../domain/entities/AuditLog.js";

export interface UpdateAdminSettingsInput {
  maxConcurrentJobs?: number;
  maxRepoSizeMb?: number;
  miningTimeoutMinutes?: number;
  defaultLlmProvider?: "gemini" | "claude" | "openai" | "none";
  maintenanceMode?: boolean;
  allowPublicRegistration?: boolean;
  adminUserId: string;
}

export class UpdateAdminSettingsUseCase {
  async execute(input: UpdateAdminSettingsInput): Promise<Record<string, unknown>> {
    if (input.maxConcurrentJobs !== undefined && input.maxConcurrentJobs <= 0) {
      throw new BadRequestError("maxConcurrentJobs must be a positive integer.");
    }
    if (input.maxRepoSizeMb !== undefined && input.maxRepoSizeMb <= 0) {
      throw new BadRequestError("maxRepoSizeMb must be a positive integer.");
    }
    if (input.miningTimeoutMinutes !== undefined && input.miningTimeoutMinutes <= 0) {
      throw new BadRequestError("miningTimeoutMinutes must be a positive integer.");
    }
    if (
      input.defaultLlmProvider !== undefined &&
      !["gemini", "claude", "openai", "none"].includes(input.defaultLlmProvider)
    ) {
      throw new BadRequestError("defaultLlmProvider must be one of: gemini, claude, openai, none.");
    }

    let settings = await SystemSettingsModel.findOne();
    if (!settings) {
      settings = await SystemSettingsModel.create({});
    }

    if (input.maxConcurrentJobs !== undefined) settings.maxConcurrentJobs = input.maxConcurrentJobs;
    if (input.maxRepoSizeMb !== undefined) settings.maxRepoSizeMb = input.maxRepoSizeMb;
    if (input.miningTimeoutMinutes !== undefined) settings.miningTimeoutMinutes = input.miningTimeoutMinutes;
    if (input.defaultLlmProvider !== undefined) settings.defaultLlmProvider = input.defaultLlmProvider;
    if (input.maintenanceMode !== undefined) settings.maintenanceMode = input.maintenanceMode;
    if (input.allowPublicRegistration !== undefined) settings.allowPublicRegistration = input.allowPublicRegistration;
    settings.updatedBy = input.adminUserId;

    await settings.save();

    await AuditService.log({
      action: AuditAction.SETTINGS_UPDATE,
      userId: input.adminUserId,
      targetType: "settings",
      details: {
        maxConcurrentJobs: settings.maxConcurrentJobs,
        defaultLlmProvider: settings.defaultLlmProvider,
        maintenanceMode: settings.maintenanceMode,
      },
    });

    return settings.toJSON();
  }
}
