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

  /** The architecture the project's people say it has, used to score views (adjusted Rand index). */
  public async getReference(projectId: string, userId: string) {
    await loadOwnedProject(projectId, userId);
    return ArchitectureService.getReference(projectId);
  }

  /** Body: { components: [{ name, prefixes: [path prefix, ...] }] }; an empty list removes the reference. */
  public async saveReference(projectId: string, userId: string, body: unknown) {
    await loadOwnedProject(projectId, userId);
    const raw = (body && typeof body === "object" ? (body as Record<string, unknown>).components : undefined);
    if (!Array.isArray(raw) || raw.length > 40) throw new BadRequestError("components must be a list of at most 40 entries.");
    const seen = new Set<string>();
    const components = raw.map((c, i) => {
      const item = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name || name.length > 60) throw new BadRequestError(`components[${i}].name must be 1 to 60 characters.`);
      if (seen.has(name.toLowerCase())) throw new BadRequestError(`The name "${name}" is used twice.`);
      seen.add(name.toLowerCase());
      const prefixes = Array.isArray(item.prefixes) ? item.prefixes.filter((p): p is string => typeof p === "string").map(p => p.trim()).filter(Boolean) : [];
      if (!prefixes.length || prefixes.length > 50 || prefixes.some(p => p.length > 200)) throw new BadRequestError(`components[${i}] needs 1 to 50 path prefixes of at most 200 characters.`);
      return { name, prefixes: [...new Set(prefixes)] };
    });
    return ArchitectureService.saveReference(projectId, components, userId);
  }

  /** The project's AI runs, newest first, with tokens, cost and quality. */
  public async runs(projectId: string, userId: string, query: { page?: unknown; limit?: unknown }) {
    await loadOwnedProject(projectId, userId);
    return LlmRunService.listForProject(projectId, { page: Number(query.page) || 1, limit: Number(query.limit) || 20 });
  }
}
