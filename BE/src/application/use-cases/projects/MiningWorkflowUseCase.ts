import mongoose from "mongoose";
import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { parseMineRequest } from "../../../domain/mining/miningPlan.js";
import { BadRequestError } from "../../../shared/errors/AppError.js";
import { loadOwnedProject } from "./loadOwnedProject.js";

export class MiningWorkflowUseCase {
  public async scan(projectId: string, userId: string): Promise<string> {
    await loadOwnedProject(projectId, userId);
    return MiningService.startScanJob(projectId, userId);
  }

  public async overview(projectId: string, userId: string) {
    return MiningService.overview(await loadOwnedProject(projectId, userId));
  }

  public async estimate(projectId: string, userId: string, query: { since?: unknown; until?: unknown }) {
    const project = await loadOwnedProject(projectId, userId);
    try {
      return await MiningService.estimate(project, parseMineRequest({ mode: "range", ...query }));
    } catch (error: any) {
      if (error?.statusCode) throw error;
      throw new BadRequestError(error.message);
    }
  }

  public async cancel(jobId: string, userId: string) {
    if (!mongoose.isValidObjectId(jobId)) throw new BadRequestError("Invalid job ID");
    return MiningService.cancelJob(jobId, userId);
  }
}
