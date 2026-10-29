import mongoose from "mongoose";
import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { LlmModelRegistry } from "../../../infrastructure/llm/registry.js";
import { ArchitectureService } from "../../../infrastructure/services/ArchitectureService.js";
import { LlmRunService } from "../../../infrastructure/services/LlmRunService.js";
import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";
import { BadRequestError, ForbiddenError } from "../../../shared/errors/AppError.js";
import { loadProject } from "./loadOwnedProject.js";

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
    await loadProject(projectId);
    return ArchitectureService.get(projectId, snapshotIdOf(snapshotId));
  }

  public async generate(projectId: string, userId: string, body: unknown) {
    await loadProject(projectId);
    const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return ArchitectureService.generate(projectId, snapshotIdOf(input.snapshotId), {
      minComponents: input.minComponents as number | undefined,
      maxComponents: input.maxComponents as number | undefined,
    });
  }

  /** Starts a background job that groups and then refines with the chosen (else the default) AI model. Returns the job id. */
  public async refine(projectId: string, userId: string, body: unknown): Promise<string> {
    await loadProject(projectId);
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
    await loadProject(projectId);
    return ArchitectureService.getReference(projectId);
  }

  /** Body: { components: [{ name, prefixes: [path prefix, ...] }] }; an empty list removes the reference. */
  public async saveReference(projectId: string, userId: string, body: unknown) {
    await loadProject(projectId);
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

  /** Which component of one snapshot became which of another. Query: { baseId, targetId }. */
  public async match(projectId: string, userId: string, query: { baseId?: unknown; targetId?: unknown }) {
    await loadProject(projectId);
    const baseId = snapshotIdOf(query.baseId), targetId = snapshotIdOf(query.targetId);
    if (!baseId || !targetId) throw new BadRequestError("Missing required query parameters: baseId, targetId.");
    if (baseId === targetId) throw new BadRequestError("Choose two different snapshots.");
    return ArchitectureService.match(projectId, baseId, targetId);
  }

  /** What one commit's evidence changed, in components of its snapshot's grouping (never creates a grouping). */
  public async evidenceImpact(projectId: string, userId: string, evidenceId: unknown) {
    await loadProject(projectId);
    if (typeof evidenceId !== "string" || !mongoose.isValidObjectId(evidenceId)) throw new BadRequestError("Invalid evidence ID");
    return ArchitectureService.evidenceImpact(projectId, evidenceId);
  }

  /** The commits that changed the components of one snapshot. Query: { snapshotId?, limit? } (limit 1 to 50, default 20). */
  public async commitImpacts(projectId: string, userId: string, query: { snapshotId?: unknown; limit?: unknown }) {
    await loadProject(projectId);
    return ArchitectureService.commitImpacts(projectId, snapshotIdOf(query.snapshotId), query.limit);
  }

  /** Every component followed through the snapshots that have components. */
  public async lineage(projectId: string, userId: string) {
    await loadProject(projectId);
    return ArchitectureService.lineage(projectId);
  }

  /** The recovered architecture against the directory baseline over time. Query: { depth? } (folder levels, 1 to 6). */
  public async evaluation(projectId: string, userId: string, query: { depth?: unknown }) {
    await loadProject(projectId);
    let depth: number | undefined;
    if (query.depth !== undefined && query.depth !== "") {
      depth = Number(query.depth);
      if (!Number.isInteger(depth) || depth < 1 || depth > 6) throw new BadRequestError("depth must be a whole number from 1 to 6.");
    }
    return ArchitectureService.evaluation(projectId, { depth });
  }

  /**
   * The project's AI runs, newest first, with tokens and cost (and quality for the ones that drew an architecture; chat runs have
   * none). Owners and maintainers see everyone's. Anyone else who can read the project sees only their own, as in the system
   * overview: AI cost is shown project-wide to the owner and maintainers, and a member sees theirs.
   */
  public async runs(projectId: string, userId: string, query: { page?: unknown; limit?: unknown }, seeEveryone = false) {
    await loadProject(projectId);
    return LlmRunService.listForProject(projectId, { page: Number(query.page) || 1, limit: Number(query.limit) || 20, ...(seeEveryone ? {} : { userId }) });
  }
}
