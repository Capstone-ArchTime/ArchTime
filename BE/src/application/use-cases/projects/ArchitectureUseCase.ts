import mongoose from "mongoose";
import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { getLlmRuntime } from "../../../infrastructure/llm/runtime.js";
import { ArchitectureService } from "../../../infrastructure/services/ArchitectureService.js";
import { BadRequestError } from "../../../shared/errors/AppError.js";
import { loadOwnedProject } from "./loadOwnedProject.js";

function snapshotIdOf(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) throw new BadRequestError("Invalid snapshot ID");
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

  /** Starts a background job that groups and then refines with the AI model. Returns the job id. */
  public async refine(projectId: string, userId: string, body: unknown): Promise<string> {
    await loadOwnedProject(projectId, userId);
    const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const { client, capability } = getLlmRuntime();
    if (!client) throw new BadRequestError(capability.reason ?? "AI refinement is not configured on this server");
    return MiningService.startAbstractJob(projectId, userId, snapshotIdOf(input.snapshotId));
  }
}
