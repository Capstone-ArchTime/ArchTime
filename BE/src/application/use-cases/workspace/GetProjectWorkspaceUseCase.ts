import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspace } from "../../../domain/entities/Workspace.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";

export class GetProjectWorkspaceUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string): Promise<IWorkspace> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    const saved = await this.workspaceRepository.findByProjectId(projectId);
    if (saved) {
      return saved;
    }

    // Nobody has saved anything for this workspace yet, so it starts empty: no invented components or dependencies.
    const initial: IWorkspace = {
      id: `init-${projectId}`,
      projectId: project.id,
      revision: 1,
      diagram: {
        components: [],
        dependencies: [],
        revision: 1,
        confirmedAt: null,
        confirmedBy: null,
      },
      rules: [],
      decisions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return initial;
  }
}
