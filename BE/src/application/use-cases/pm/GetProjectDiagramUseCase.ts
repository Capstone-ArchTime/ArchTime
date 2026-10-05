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
      throw new NotFoundError("Project not found.");
    }

    let ws = await this.workspaceRepository.findByProjectId(projectId);
    if (!ws) {
      // Default fallback
      const defaultName = `${project.name} Service`;
      const initial = await this.workspaceRepository.create({
        projectId,
        revision: 1,
        diagram: {
          components: [
            { id: "web", name: "Web Application", kind: "UI", description: "Frontend UI" },
            { id: "api", name: "API Gateway", kind: "Service", description: "API Routing" },
            { id: "service", name: defaultName, kind: "Service", description: "Core Domain" },
            { id: "db", name: "Database", kind: "Database", description: "Persistence" },
          ],
          dependencies: [
            { id: "e1", source: "web", target: "api", label: "HTTPS" },
            { id: "e2", source: "api", target: "service", label: "REST" },
            { id: "e3", source: "service", target: "db", label: "SQL" },
          ],
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
