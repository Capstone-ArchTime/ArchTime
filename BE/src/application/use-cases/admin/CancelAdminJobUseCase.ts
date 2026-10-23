import mongoose from "mongoose";
import { JobStatus, MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";
import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";
import { AuditService } from "../../../infrastructure/services/AuditService.js";
import { AuditAction } from "../../../domain/entities/AuditLog.js";

export interface CancelAdminJobInput {
  jobId: string;
  adminUserId: string;
}

export class CancelAdminJobUseCase {
  async execute(input: CancelAdminJobInput): Promise<Record<string, unknown>> {
    if (!mongoose.isValidObjectId(input.jobId)) {
      throw new NotFoundError("Mining job not found.");
    }
    const existing = await MiningJobModel.findById(input.jobId);
    if (!existing) {
      throw new NotFoundError("Mining job not found.");
    }

    if (existing.status === JobStatus.COMPLETED || existing.status === JobStatus.FAILED) {
      throw new BadRequestError(`Cannot cancel a job that is already ${existing.status}.`);
    }

    if (existing.status === JobStatus.CANCELLED) {
      return existing.toJSON();
    }

    // Through the mining queue, so a running worker actually stops instead of finishing and overwriting the status.
    const job = await MiningService.cancelJob(input.jobId, { by: input.adminUserId, stage: "Cancelled by administrator" });

    await AuditService.log({
      action: AuditAction.JOB_CANCEL,
      userId: input.adminUserId,
      targetType: "job",
      targetId: input.jobId,
      details: { projectId: job.projectId },
    });

    return job.toJSON();
  }
}
