import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import {
  ProjectMemberRole,
  type IProjectMember,
} from "../../../domain/entities/ProjectMember.js";
import {
  BadRequestError,
  NotFoundError,
} from "../../../shared/errors/AppError.js";

export class UpdateProjectMemberRoleUseCase {
  constructor(private readonly memberRepository: IProjectMemberRepository) {}

  async execute(
    memberId: string,
    role: ProjectMemberRole,
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

    const updated = await this.memberRepository.updateRole(memberId, role);
    if (!updated) {
      throw new NotFoundError("Project member not found.");
    }

    return updated;
  }
}
