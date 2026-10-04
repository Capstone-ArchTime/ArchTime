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
      throw new NotFoundError("Project not found.");
    }

    const saved = await this.workspaceRepository.findByProjectId(projectId);
    if (saved) {
      return saved;
    }

    // Return initial default workspace template for this project
    const defaultServiceName = `${project.name} Service`;
    const initial: IWorkspace = {
      id: `init-${projectId}`,
      projectId: project.id,
      revision: 1,
      diagram: {
        components: [
          {
            id: "web",
            name: "Web Application",
            kind: "UI",
            description: "User-facing application interface",
          },
          {
            id: "api",
            name: "API Gateway",
            kind: "Service",
            description: "Routes incoming requests and authentication",
          },
          {
            id: "service",
            name: defaultServiceName,
            kind: "Service",
            description: "Domain logic and core business operations",
          },
          {
            id: "db",
            name: "Database",
            kind: "Database",
            description: "Persistent domain datastore",
          },
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return initial;
  }
}
