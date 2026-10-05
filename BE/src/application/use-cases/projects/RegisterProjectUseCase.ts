import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import {
  ProjectStatus,
  RepoVisibility,
  type IProject,
} from "../../../domain/entities/Project.js";
import {
  ProjectMemberRole,
  MemberStatus,
} from "../../../domain/entities/ProjectMember.js";
import { BadRequestError } from "../../../shared/errors/AppError.js";

export interface RegisterProjectRequest {
  name: string;
  description?: string;
  repoUrl: string;
  visibility: RepoVisibility;
  token?: string;
  userId: string;
}

export class RegisterProjectUseCase {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memberRepository?: IProjectMemberRepository,
    private readonly userRepository?: IUserRepository,
  ) {}

  async execute(req: RegisterProjectRequest): Promise<IProject> {
    if (!req.name || !req.repoUrl) {
      throw new BadRequestError(
        "Missing required fields: name, repoUrl",
        "VALIDATION_ERROR",
      );
    }

    if (req.visibility === RepoVisibility.PRIVATE && !req.token) {
      throw new BadRequestError(
        "Private repositories require a token or SSH key",
        "VALIDATION_ERROR",
      );
    }

    const project = await this.projectRepository.create({
      name: req.name,
      description: req.description,
      repoUrl: req.repoUrl,
      visibility: req.visibility,
      token: req.token,
      status: ProjectStatus.PENDING,
      userId: req.userId,
    });

    // Automatically record creator as active maintainer in project_members
    if (this.memberRepository && this.userRepository) {
      try {
        const user = await this.userRepository.findById(req.userId);
        if (user) {
          await this.memberRepository.addMember({
            projectId: project.id,
            userId: user.id,
            email: user.email,
            name: user.name,
            role: ProjectMemberRole.MAINTAINER,
            status: MemberStatus.ACTIVE,
          });
        }
      } catch {
        // Safe to ignore if member already exists
      }
    }

    return project;
  }
}
