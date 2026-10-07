import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";
import { BadRequestError } from "../../../shared/errors/AppError.js";
import { AuditService } from "../../../infrastructure/services/AuditService.js";
import { AuditAction } from "../../../domain/entities/AuditLog.js";
import { normalizeWeights } from "../../../domain/architecture/llm/metrics.js";
import type { ScoreWeights } from "../../../domain/architecture/llm/metrics.js";

const SCORING_PRESETS = ["balanced", "quality", "budget", "custom"] as const;

export interface UpdateAdminSettingsInput {
  maxConcurrentJobs?: number;
  maxRepoSizeMb?: number;
  miningTimeoutMinutes?: number;
  defaultLlmProvider?: "gemini" | "claude" | "openai" | "none";
  maintenanceMode?: boolean;
  allowPublicRegistration?: boolean;
  allowUserModelChoice?: boolean;
  scoring?: { preset?: string; weights?: Partial<ScoreWeights>; windowDays?: number };
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

    if (input.allowUserModelChoice !== undefined && typeof input.allowUserModelChoice !== "boolean") {
      throw new BadRequestError("allowUserModelChoice must be true or false.");
    }
    const scoring = input.scoring;
    if (scoring !== undefined) {
      if (!scoring || typeof scoring !== "object") throw new BadRequestError("scoring must be an object.");
      if (scoring.preset !== undefined && !SCORING_PRESETS.includes(scoring.preset as never)) {
        throw new BadRequestError(`scoring.preset must be one of: ${SCORING_PRESETS.join(", ")}.`);
      }
      if (scoring.windowDays !== undefined && (!Number.isInteger(scoring.windowDays) || scoring.windowDays < 1 || scoring.windowDays > 365)) {
        throw new BadRequestError("scoring.windowDays must be a whole number from 1 to 365.");
      }
      if (scoring.weights !== undefined) {
        const values = Object.values(scoring.weights ?? {});
        if (!scoring.weights || values.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0) || values.reduce((a, b) => a + (b as number), 0) <= 0) {
          throw new BadRequestError("scoring.weights must be non-negative numbers that are not all zero.");
        }
      }
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
    if (input.allowUserModelChoice !== undefined) settings.allowUserModelChoice = input.allowUserModelChoice;
    if (scoring) {
      const current = settings.scoring ?? { preset: "balanced", windowDays: 30 };
      settings.scoring = {
        preset: (scoring.preset as typeof current.preset) ?? current.preset,
        windowDays: scoring.windowDays ?? current.windowDays,
        weights: scoring.weights ? normalizeWeights(scoring.weights) : current.weights,
      };
      settings.markModified("scoring");
    }
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
        allowUserModelChoice: settings.allowUserModelChoice,
        scoring: settings.scoring,
      },
    });

    return settings.toJSON();
  }
}
