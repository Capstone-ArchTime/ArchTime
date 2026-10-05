import {
  ApprovalRequestModel,
  type IApprovalRequestDocument,
} from "../../../infrastructure/database/models/ApprovalRequestModel.js";
import {
  ApprovalStatus,
  ApprovalType,
  type IApprovalRequest,
} from "../../../domain/entities/ApprovalRequest.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export interface FilterApprovalsInput {
  projectId: string;
  status?: ApprovalStatus;
  type?: ApprovalType;
  page?: number;
  limit?: number;
}

export interface CreateApprovalInput {
  projectId: string;
  title: string;
  description?: string;
  type?: ApprovalType;
  data?: Record<string, unknown>;
  requestedBy: string;
}

export interface ReviewApprovalInput {
  projectId: string;
  approvalId: string;
  reviewerId: string;
  reviewNote?: string;
}

export class GetProjectApprovalsUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(input: FilterApprovalsInput): Promise<{
    approvals: IApprovalRequest[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const query: Record<string, unknown> = { projectId: input.projectId };
    if (input.status) query.status = input.status;
    if (input.type) query.type = input.type;

    const page = Math.max(1, input.page ? Number(input.page) : 1);
    const limit = Math.max(1, Math.min(100, input.limit ? Number(input.limit) : 10));
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      ApprovalRequestModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ApprovalRequestModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const approvals = docs.map((d) => d.toJSON() as IApprovalRequest);

    return {
      approvals,
      meta: { page, limit, total, totalPages },
    };
  }
}

export class CreateApprovalRequestUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(input: CreateApprovalInput): Promise<IApprovalRequest> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    if (!input.title?.trim()) {
      throw new BadRequestError("Approval request title is required.");
    }

    const created = await ApprovalRequestModel.create({
      projectId: input.projectId,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      type: input.type ?? ApprovalType.ARCHITECTURE_CHANGE,
      status: ApprovalStatus.PENDING,
      requestedBy: input.requestedBy,
      data: input.data ?? {},
    });

    return created.toJSON() as IApprovalRequest;
  }
}

export class GetApprovalDetailUseCase {
  async execute(projectId: string, approvalId: string): Promise<IApprovalRequest> {
    const approval = await ApprovalRequestModel.findOne({
      _id: approvalId,
      projectId,
    });
    if (!approval) throw new NotFoundError("Approval request not found.");

    return approval.toJSON() as IApprovalRequest;
  }
}

export class ApproveRequestUseCase {
  async execute(input: ReviewApprovalInput): Promise<IApprovalRequest> {
    const approval = await ApprovalRequestModel.findOne({
      _id: input.approvalId,
      projectId: input.projectId,
    });
    if (!approval) throw new NotFoundError("Approval request not found.");

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestError(
        `Cannot approve request that is already ${approval.status}.`,
      );
    }

    approval.status = ApprovalStatus.APPROVED;
    approval.reviewedBy = input.reviewerId;
    approval.reviewedAt = new Date();
    if (input.reviewNote) approval.reviewNote = input.reviewNote.trim();

    await approval.save();
    return approval.toJSON() as IApprovalRequest;
  }
}

export class RejectRequestUseCase {
  async execute(input: ReviewApprovalInput): Promise<IApprovalRequest> {
    const approval = await ApprovalRequestModel.findOne({
      _id: input.approvalId,
      projectId: input.projectId,
    });
    if (!approval) throw new NotFoundError("Approval request not found.");

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestError(
        `Cannot reject request that is already ${approval.status}.`,
      );
    }

    if (!input.reviewNote?.trim()) {
      throw new BadRequestError("A rejection note/reason is required.");
    }

    approval.status = ApprovalStatus.REJECTED;
    approval.reviewedBy = input.reviewerId;
    approval.reviewedAt = new Date();
    approval.reviewNote = input.reviewNote.trim();

    await approval.save();
    return approval.toJSON() as IApprovalRequest;
  }
}
