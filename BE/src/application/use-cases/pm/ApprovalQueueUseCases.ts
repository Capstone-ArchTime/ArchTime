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
import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IWorkspaceDiagram } from "../../../domain/entities/Workspace.js";
import type { LatestCommitLookup } from "../../../domain/interfaces/ILatestCommit.js";
import { settleConfirmation } from "../../../domain/architecture/canonical.js";

/**
 * An architecture change request may carry the diagram it proposes (`data.diagram`: components and dependencies) and the
 * commit that introduced the change (`data.commit`). Approving it applies that diagram, confirms it and moves the baseline
 * to the commit (or the latest mined commit), so a confirmed diagram changes only through an approved request (BR-32).
 */
function proposedDiagram(data: unknown): Pick<IWorkspaceDiagram, "components" | "dependencies"> | null {
  const d = (data as { diagram?: unknown } | undefined)?.diagram as { components?: unknown; dependencies?: unknown } | undefined;
  if (!d) return null;
  if (!Array.isArray(d.components) || !Array.isArray(d.dependencies)) {
    throw new BadRequestError("The proposed diagram needs components and dependencies arrays.", "VALIDATION_ERROR");
  }
  return { components: d.components as IWorkspaceDiagram["components"], dependencies: d.dependencies as IWorkspaceDiagram["dependencies"] };
}

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
    if (!project) throw new NotFoundError("Workspace not found.");

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
    if (!project) throw new NotFoundError("Workspace not found.");

    if (!input.title?.trim()) {
      throw new BadRequestError("Approval request title is required.");
    }

    if ((input.type ?? ApprovalType.ARCHITECTURE_CHANGE) === ApprovalType.ARCHITECTURE_CHANGE) proposedDiagram(input.data);
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
  constructor(
    private readonly workspaceRepository?: IWorkspaceRepository,
    private readonly latestCommit?: LatestCommitLookup,
  ) {}

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

    const proposal = approval.type === ApprovalType.ARCHITECTURE_CHANGE ? proposedDiagram(approval.data) : null;
    if (proposal && this.workspaceRepository) {
      if (!proposal.components.length) throw new BadRequestError("The proposed diagram has no component.", "VALIDATION_ERROR");
      const ws = await this.workspaceRepository.findByProjectId(input.projectId);
      const commit = (approval.data as { commit?: unknown } | undefined)?.commit;
      const baselineCommit = typeof commit === "string" && commit.trim() ? commit.trim() : this.latestCommit ? await this.latestCommit(input.projectId) : null;
      const revision = ws?.revision ?? 1;
      await this.workspaceRepository.save(
        {
          projectId: input.projectId,
          revision,
          diagram: {
            ...proposal,
            revision: ws?.diagram?.revision ?? revision,
            ...settleConfirmation({ stored: ws?.diagram, incoming: proposal, request: "confirm", userId: input.reviewerId, now: new Date(), nextRevision: revision + 1, baselineCommit }),
          },
          rules: ws?.rules ?? [],
          decisions: ws?.decisions ?? [],
          updatedBy: input.reviewerId,
        },
        ws ? revision : undefined,
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
