import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import {
  ProjectMemberRole,
  type IProjectMember,
} from "../../../domain/entities/ProjectMember.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../../shared/errors/AppError.js";

export class UpdateProjectMemberRoleUseCase {
  constructor(
    private readonly memberRepository: IProjectMemberRepository,
    private readonly projectRepository?: Pick<IProjectRepository, "findById">,
  ) {}

  /**
   * With a projectId (the member routes always pass one) the member must belong to that workspace, and the
   * workspace owner's own membership cannot be changed: they stay a maintainer of their workspace.
   */
  async execute(
    memberId: string,
    role: ProjectMemberRole,
    projectId?: string,
  ): Promise<IProjectMember> {
    if (!memberId || !role) {
      throw new BadRequestError(
        "Missing required fields: memberId, role.",
        "VALIDATION_ERROR",
      );
    }

    if (!Object.values(ProjectMemberRole).includes(role)) {
      throw new BadRequestError(
        `Invalid role. Must be one of: ${Object.values(ProjectMemberRole).join(", ")}`,
        "VALIDATION_ERROR",
      );
    }

    if (projectId) {
      const member = (await this.memberRepository.findByProjectId(projectId)).find((m) => m.id === memberId);
      if (!member) {
        throw new NotFoundError("Workspace member not found.");
      }
      const project = await this.projectRepository?.findById(projectId);
      if (project && member.userId && member.userId === project.userId) {
        throw new ForbiddenError("Forbidden: the workspace owner's role cannot be changed.");
      }
    }

    const updated = await this.memberRepository.updateRole(memberId, role);
    if (!updated) {
      throw new NotFoundError("Workspace member not found.");
    }

    return updated;
  }
}
