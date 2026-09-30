import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import { ProjectStatus, RepoVisibility, type IProject } from "../../../domain/entities/Project.js";

export interface RegisterProjectRequest {
  name: string;
  description?: string;
  repoUrl: string;
  visibility: RepoVisibility;
  token?: string;
  userId: string;
}

export class RegisterProjectUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(req: RegisterProjectRequest): Promise<IProject> {
    if (!req.name || !req.repoUrl) {
      throw new Error("Missing required fields: name, repoUrl");
    }

    if (req.visibility === RepoVisibility.PRIVATE && !req.token) {
      throw new Error("Private repositories require a token or SSH key");
    }

    // Here we could queue a background job to clone the repository using the GitService.
    // For now, we simply register the project as PENDING in the DB.
    const project = await this.projectRepository.create({
      name: req.name,
      description: req.description,
      repoUrl: req.repoUrl,
      visibility: req.visibility,
      token: req.token,
      status: ProjectStatus.PENDING,
      userId: req.userId,
    });

    return project;
  }
}
