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
import { RepoUrlError, validateRepoUrl } from "../../../domain/mining/repoUrl.js";

export interface RegisterProjectRequest {
  name: string;
  description?: string;
  repoUrl: string;
  visibility: RepoVisibility;
  token?: string;
  userId: string;
  /** Registers the project in this organization instead of the caller's personal space; the caller must own it. */
  organizationId?: string;
  /** An organization credential to clone with, instead of a personal token. */
  credentialId?: string;
}

/** What registration needs from the organization module, so it does not depend on its storage. */
export interface ProjectOrganizationAccess {
  requireOwner(organizationId: string, userId: string): Promise<unknown>;
  requireCredential(organizationId: string, credentialId: string): Promise<unknown>;
}

export class RegisterProjectUseCase {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memberRepository?: IProjectMemberRepository,
    private readonly userRepository?: IUserRepository,
    private readonly organizationAccess?: ProjectOrganizationAccess,
  ) {}

  async execute(req: RegisterProjectRequest): Promise<IProject> {
    if (!req.name || !req.repoUrl) {
      throw new BadRequestError(
        "Missing required fields: name, repoUrl",
        "VALIDATION_ERROR",
      );
    }
    let repoUrl: string;
    try {
      repoUrl = validateRepoUrl(req.repoUrl);
    } catch (error) {
      if (error instanceof RepoUrlError) throw new BadRequestError(error.message, "VALIDATION_ERROR");
      throw error;
    }

    const organizationId = typeof req.organizationId === "string" && req.organizationId ? req.organizationId : undefined;
    const credentialId = typeof req.credentialId === "string" && req.credentialId ? req.credentialId : undefined;
    if (credentialId && !organizationId) {
      throw new BadRequestError("credentialId needs organizationId: credentials belong to an organization.", "VALIDATION_ERROR");
    }
    if (credentialId && req.token) {
      throw new BadRequestError("Send either token or credentialId, not both.", "VALIDATION_ERROR");
    }
    if (organizationId) {
      if (!this.organizationAccess) throw new BadRequestError("Organizations are not available.");
      await this.organizationAccess.requireOwner(organizationId, req.userId);
      if (credentialId) await this.organizationAccess.requireCredential(organizationId, credentialId);
    }

    if (req.visibility === RepoVisibility.PRIVATE && !req.token && !credentialId) {
      throw new BadRequestError(
        "Private repositories require a token or an organization credential",
        "VALIDATION_ERROR",
      );
    }

    const project = await this.projectRepository.create({
      name: req.name,
      description: req.description,
      repoUrl,
      visibility: req.visibility,
      token: req.token,
      status: ProjectStatus.PENDING,
      userId: req.userId,
      ...(organizationId ? { organizationId } : {}),
      ...(credentialId ? { credentialId } : {}),
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
