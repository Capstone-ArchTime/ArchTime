import mongoose from "mongoose";
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
}
