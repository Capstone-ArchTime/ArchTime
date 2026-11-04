import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import type { IWorkspace } from "../../../domain/entities/Workspace.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";

export class GetProjectWorkspaceUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
    /** Names the person who confirmed the canonical map, so readers can see who vouches for it. */
    private readonly users?: Pick<IUserRepository, "findById">,
  ) {}

  async execute(projectId: string): Promise<IWorkspace> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    const saved = await this.workspaceRepository.findByProjectId(projectId);
    if (saved) {
      const by = saved.diagram?.confirmedAt && saved.diagram.confirmedBy && this.users
        ? await this.users.findById(saved.diagram.confirmedBy).catch(() => null)
        : null;
      return { ...saved, diagram: { ...saved.diagram, confirmedByName: by?.name ?? null } };
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
        confirmedRevision: null,
        confirmedByName: null,
      },
      rules: [],
      decisions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return initial;
  }
}
