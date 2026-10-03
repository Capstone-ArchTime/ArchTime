import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../../shared/errors/AppError.js";

export class RemoveProjectMemberUseCase {
  constructor(
    private readonly memberRepository: IProjectMemberRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string, memberId: string): Promise<boolean> {
    if (!projectId || !memberId) {
      throw new BadRequestError(
        "Missing required parameters: projectId, memberId.",
        "VALIDATION_ERROR",
      );
    }

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }

    // Owner cannot be removed as a member
    if (memberId.startsWith("owner-") || memberId === project.userId) {
      throw new ForbiddenError(
        "Forbidden: the project owner cannot be removed.",
      );
    }

    const removed = await this.memberRepository.deleteByProjectAndId(
      projectId,
      memberId,
    );
    if (!removed) {
      throw new NotFoundError("Project member not found.");
    }

    return true;
  }
}
