import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import { ProjectMemberRole } from "../../../domain/entities/ProjectMember.js";
import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { ApprovalRequestModel } from "../../../infrastructure/database/models/ApprovalRequestModel.js";
import { ApprovalStatus } from "../../../domain/entities/ApprovalRequest.js";
import { EvaluateProjectRulesUseCase } from "./ProjectRulesUseCases.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";

export interface ProjectDashboardData {
  project: {
    id: string;
    name: string;
    description: string;
    repoUrl: string;
    visibility: string;
    status: string;
    createdAt: Date;
  };
  healthScore: number;
  architecture: {
    revision: number;
    componentsCount: number;
    dependenciesCount: number;
    isConfirmed: boolean;
    confirmedAt?: Date | null;
  };
  rules: {
    total: number;
    active: number;
    compliancePercent: number;
    violationsCount: number;
    warningsCount: number;
  };
  decisions: {
    total: number;
    accepted: number;
    proposed: number;
  };
  approvals: {
    pendingCount: number;
    totalCount: number;
  };
  snapshots: {
    total: number;
    latestSnapshotDate?: Date | null;
  };
  team: {
    totalMembers: number;
    maintainersCount: number;
    membersCount: number;
  };
}

export class GetProjectDashboardUseCase {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly memberRepository: IProjectMemberRepository,
    private readonly evaluateRulesUseCase: EvaluateProjectRulesUseCase,
  ) {}

  async execute(projectId: string): Promise<ProjectDashboardData> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const [ws, members, snapshotsCount, latestSnapshot, pendingApprovalsCount, totalApprovalsCount] =
      await Promise.all([
        this.workspaceRepository.findByProjectId(projectId),
        this.memberRepository.findByProjectId(projectId),
        SnapshotModel.countDocuments({ projectId }),
        SnapshotModel.findOne({ projectId }).sort({ commitDate: -1 }).select("commitDate"),
        ApprovalRequestModel.countDocuments({ projectId, status: ApprovalStatus.PENDING }),
        ApprovalRequestModel.countDocuments({ projectId }),
      ]);

    const components = ws?.diagram?.components ?? [];
    const dependencies = ws?.diagram?.dependencies ?? [];
    const decisions = ws?.decisions ?? [];

    // Evaluate rules for compliance rate
    let compliancePercent = 100;
    let violationsCount = 0;
    let warningsCount = 0;
    try {
      const evaluation = await this.evaluateRulesUseCase.execute(projectId);
      compliancePercent = evaluation.compliancePercent;
      violationsCount = evaluation.violationCount;
      warningsCount = evaluation.warningCount;
    } catch {
      // Fallback if no rules exist
    }

    // Health Score calculation (0 to 100):
    // 50% weight on rules compliance
    // 25% weight on having active snapshots/history
    // 25% weight on team collaboration
    let healthScore = Math.round(compliancePercent * 0.5);
    if (snapshotsCount > 0) healthScore += 25;
    if (members.length > 0) healthScore += 25;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const maintainersCount = members.filter((m) => m.role === ProjectMemberRole.MAINTAINER).length;
    const membersCount = members.filter((m) => m.role === ProjectMemberRole.MEMBER).length;

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description || "",
        repoUrl: project.repoUrl,
        visibility: project.visibility,
        status: project.status,
        createdAt: project.createdAt,
      },
      healthScore,
      architecture: {
        revision: ws?.revision ?? 1,
        componentsCount: components.length,
        dependenciesCount: dependencies.length,
        isConfirmed: Boolean(ws?.diagram?.confirmedAt),
        confirmedAt: ws?.diagram?.confirmedAt ?? null,
      },
      rules: {
        total: ws?.rules?.length ?? 0,
        active: ws?.rules?.filter((r) => r.enabled).length ?? 0,
        compliancePercent,
        violationsCount,
        warningsCount,
      },
      decisions: {
        total: decisions.length,
        accepted: decisions.filter((d) => d.status === "Accepted").length,
        proposed: decisions.filter((d) => d.status === "Proposed").length,
      },
      approvals: {
        pendingCount: pendingApprovalsCount,
        totalCount: totalApprovalsCount,
      },
      snapshots: {
        total: snapshotsCount,
        latestSnapshotDate: latestSnapshot?.date ?? null,
      },
      team: {
        totalMembers: members.length,
        maintainersCount,
        membersCount,
      },
    };
  }
}
