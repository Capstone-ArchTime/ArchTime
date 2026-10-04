import { JobStatus, MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";
import { AuditService } from "../../../infrastructure/services/AuditService.js";
import { AuditAction } from "../../../domain/entities/AuditLog.js";

export interface CancelAdminJobInput {
  jobId: string;
  adminUserId: string;
}

export class CancelAdminJobUseCase {
  async execute(input: CancelAdminJobInput): Promise<Record<string, unknown>> {
    const job = await MiningJobModel.findById(input.jobId);
    if (!job) {
      throw new NotFoundError("Mining job not found.");
    }

    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
      throw new BadRequestError(`Cannot cancel a job that is already ${job.status}.`);
    }

    if (job.status === JobStatus.CANCELLED) {
      return job.toJSON();
    }

    job.status = JobStatus.CANCELLED;
    job.cancelledAt = new Date();
    job.cancelledBy = input.adminUserId;
    job.stage = "Cancelled by administrator";
    await job.save();

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
