import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProject } from "../../../domain/entities/Project.js";
import { RepoVisibility } from "../../../domain/entities/Project.js";
import { UserRole } from "../../../domain/entities/User.js";
import { MemberStatus } from "../../../domain/entities/ProjectMember.js";
import type { ProjectAccess } from "../../services/ProjectAccessPolicy.js";
import {
  ForbiddenError,
  NotFoundError,
} from "../../../shared/errors/AppError.js";

export interface ProjectDetailDTO extends IProject {
  userRole: "owner" | "project-maintainer" | "developer-analyst" | "system-administrator" | "viewer";
  isOwner: boolean;
  isMaintainer: boolean;
  membersCount: number;
}

export class GetProjectByIdUseCase {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memberRepository?: IProjectMemberRepository,
  ) {}

  /**
   * `access`, when given, is what the projectRole middleware already decided (ProjectAccessPolicy); it covers
   * organization owners and administrators of organization projects, which the checks below do not know about.
   */
  async execute(
    projectId: string,
    userId: string,
    userRole?: UserRole,
    access?: ProjectAccess,
  ): Promise<ProjectDetailDTO> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    const isOwner = project.userId === userId;
    const isAdmin = userRole === UserRole.SYSTEM_ADMINISTRATOR;

    let member = null;
    let membersCount = isOwner ? 1 : 0;

    if (this.memberRepository) {
      member = await this.memberRepository.findByProjectAndUserId(
        projectId,
        userId,
      );
      const allMembers = await this.memberRepository.findByProjectId(projectId);
      const activeMembers = allMembers.filter(
        (m) => m.status === MemberStatus.ACTIVE,
      );
      // count active members (avoid double-counting owner if owner is in project_members)
      const nonOwnerCount = activeMembers.filter(
        (m) => m.userId !== project.userId,
      ).length;
      membersCount = nonOwnerCount + 1; // +1 for owner
    }

    if (access?.role) {
      return {
        ...project,
        // Clients know five role labels; an organization owner works as a maintainer.
        userRole: access.role === "organization-owner" ? "project-maintainer" : access.role,
        isOwner: access.role === "owner",
        isMaintainer: access.actions.has("write"),
        membersCount,
      };
    }

    const isMember = member?.status === MemberStatus.ACTIVE;
    const isPublic = project.visibility === RepoVisibility.PUBLIC;

    // Check read access
    if (!isOwner && !isAdmin && !isMember && !isPublic) {
      throw new ForbiddenError(
        "Forbidden: you do not have permission to view this workspace.",
      );
    }

    let effectiveRole: ProjectDetailDTO["userRole"] = "viewer";
    if (isOwner) {
      effectiveRole = "owner";
    } else if (member?.role === "project-maintainer") {
      effectiveRole = "project-maintainer";
    } else if (member?.role === "developer-analyst") {
      effectiveRole = "developer-analyst";
    } else if (isAdmin) {
      effectiveRole = "system-administrator";
    }

    const isMaintainer =
      isOwner ||
      effectiveRole === "project-maintainer" ||
      effectiveRole === "system-administrator";

    return {
      ...project,
      userRole: effectiveRole,
      isOwner,
      isMaintainer,
      membersCount,
    };
  }
}
