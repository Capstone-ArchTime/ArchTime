import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceDiagram } from "../../../domain/entities/Workspace.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";

export interface GetDiagramResult {
  diagram: IWorkspaceDiagram;
  revision: number;
}

export class GetProjectDiagramUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string): Promise<GetDiagramResult> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    let ws = await this.workspaceRepository.findByProjectId(projectId);
    if (!ws) {
      // No saved workspace yet: start it empty rather than with invented components.
      const initial = await this.workspaceRepository.create({
        projectId,
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
      });
      return { diagram: initial.diagram, revision: initial.revision };
    }

    return { diagram: ws.diagram, revision: ws.revision };
  }
}
