import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import {
  MemberStatus,
  ProjectMemberRole,
  type IProjectMember,
} from "../../../domain/entities/ProjectMember.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";

export class GetProjectMembersUseCase {
  constructor(
    private readonly memberRepository: IProjectMemberRepository,
    private readonly projectRepository: IProjectRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(projectId: string): Promise<IProjectMember[]> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }

    const members = await this.memberRepository.findByProjectId(projectId);

    // Ensure project owner is present in the list
    const hasOwner = members.some((m) => m.userId === project.userId);
    if (!hasOwner && project.userId) {
      const ownerUser = await this.userRepository.findById(project.userId);
      if (ownerUser) {
        members.unshift({
          id: `owner-${project.userId}`,
          projectId: project.id,
          userId: ownerUser.id,
          email: ownerUser.email,
          name: ownerUser.name,
          role: ProjectMemberRole.MAINTAINER,
          status: MemberStatus.ACTIVE,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
      }
    }

    return members;
  }
}
