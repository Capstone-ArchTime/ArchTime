import mongoose from "mongoose";
import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { parseMineRequest } from "../../../domain/mining/miningPlan.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors/AppError.js";
import { MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";
import { deniedMessage, type AccessUser, type ProjectAccessPolicy } from "../../services/ProjectAccessPolicy.js";
import { loadProject } from "./loadOwnedProject.js";

export class MiningWorkflowUseCase {
  constructor(private readonly projectAccess?: Pick<ProjectAccessPolicy, "accessTo">) {}

  public async scan(projectId: string, userId: string): Promise<string> {
    await loadProject(projectId);
    return MiningService.startScanJob(projectId, userId);
  }

  public async overview(projectId: string, userId: string) {
    return MiningService.overview(await loadProject(projectId));
  }

  public async estimate(projectId: string, userId: string, query: { since?: unknown; until?: unknown }) {
    const project = await loadProject(projectId);
    try {
      return await MiningService.estimate(project, parseMineRequest({ mode: "range", ...query }));
    } catch (error: any) {
      if (error?.statusCode) throw error;
      throw new BadRequestError(error.message);
    }
  }

  /** Anyone who may mine the job's project (owner, organization owner, maintainer) may cancel its job. */
  public async cancel(jobId: string, user: AccessUser) {
    if (!mongoose.isValidObjectId(jobId)) throw new BadRequestError("Invalid job ID");
    const job = await MiningJobModel.findById(jobId).select("projectId").lean();
    if (!job) throw new NotFoundError("Job not found");
    if (this.projectAccess) {
      const found = await this.projectAccess.accessTo(String(job.projectId), user);
      // Someone who cannot see the project does not learn that the job exists.
      if (!found || !found.access.actions.has("metadata")) throw new NotFoundError("Job not found");
      if (!found.access.actions.has("write")) throw new ForbiddenError(deniedMessage(found.access, "write"));
    } else {
      await loadProject(String(job.projectId));
    }
    return MiningService.cancelJob(jobId, { by: user.userId });
  }
}
