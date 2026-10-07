import mongoose from "mongoose";
import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { LlmModelRegistry } from "../../../infrastructure/llm/registry.js";
import { ArchitectureService } from "../../../infrastructure/services/ArchitectureService.js";
import { LlmRunService } from "../../../infrastructure/services/LlmRunService.js";
import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";
import { BadRequestError, ForbiddenError } from "../../../shared/errors/AppError.js";
import { loadOwnedProject } from "./loadOwnedProject.js";

function snapshotIdOf(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) throw new BadRequestError("Invalid snapshot ID");
  return value;
}

function modelIdOf(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) throw new BadRequestError("Invalid model ID");
  return value;
}

export class ArchitectureUseCase {
  public async get(projectId: string, userId: string, snapshotId?: unknown) {
    await loadOwnedProject(projectId, userId);
    return ArchitectureService.get(projectId, snapshotIdOf(snapshotId));
  }

  public async generate(projectId: string, userId: string, body: unknown) {
    await loadOwnedProject(projectId, userId);
    const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return ArchitectureService.generate(projectId, snapshotIdOf(input.snapshotId), {
      minComponents: input.minComponents as number | undefined,
      maxComponents: input.maxComponents as number | undefined,
    });
  }

  /** Starts a background job that groups and then refines with the chosen (else the default) AI model. Returns the job id. */
  public async refine(projectId: string, userId: string, body: unknown): Promise<string> {
    await loadOwnedProject(projectId, userId);
    const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const snapshotId = snapshotIdOf(input.snapshotId);
    const modelId = modelIdOf(input.modelId);
    if (modelId) {
      const settings = await SystemSettingsModel.findOne().lean();
      if (settings && settings.allowUserModelChoice === false) throw new ForbiddenError("Choosing a model is turned off; the default model is used.");
    }
    // Fails here, before queueing, when the model is unknown, turned off, hidden from users or nothing is configured.
    await LlmModelRegistry.resolve(modelId, { forUser: true });
    return MiningService.startAbstractJob(projectId, userId, snapshotId, modelId);
  }

  /** The project's AI runs, newest first, with tokens, cost and quality. */
  public async runs(projectId: string, userId: string, query: { page?: unknown; limit?: unknown }) {
    await loadOwnedProject(projectId, userId);
    return LlmRunService.listForProject(projectId, { page: Number(query.page) || 1, limit: Number(query.limit) || 20 });
  }
}
