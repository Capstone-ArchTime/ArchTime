import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type {
  IWorkspace,
  IWorkspaceDiagram,
  IWorkspaceRule,
  IWorkspaceDecision,
} from "../../../domain/entities/Workspace.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../../shared/errors/AppError.js";

export interface SaveWorkspaceRequest {
  projectId: string;
  expectedRevision?: number;
  diagram: IWorkspaceDiagram;
  rules?: IWorkspaceRule[];
  decisions?: IWorkspaceDecision[];
  userId?: string;
}

export class SaveProjectWorkspaceUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(req: SaveWorkspaceRequest): Promise<IWorkspace> {
    const { projectId, expectedRevision, diagram, rules, decisions, userId } =
      req;

    if (!projectId) {
      throw new BadRequestError("Project ID is required.", "VALIDATION_ERROR");
    }

    if (!diagram || !Array.isArray(diagram.components) || !Array.isArray(diagram.dependencies)) {
      throw new BadRequestError(
        "Invalid diagram payload: components and dependencies arrays are required.",
        "VALIDATION_ERROR",
      );
    }

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }

    try {
      const saved = await this.workspaceRepository.save(
        {
          projectId,
          revision: expectedRevision ?? 1,
          diagram,
          rules: rules ?? [],
          decisions: decisions ?? [],
          updatedBy: userId,
        },
        expectedRevision,
      );

      return saved;
    } catch (err: any) {
      if (err.isConflict) {
        throw new ConflictError(
          `Workspace revision conflict: expected revision ${err.expectedRevision}, but current revision on server is ${err.currentRevision}. Please reload to avoid overwriting newer changes.`,
          "CONFLICT",
        );
      }
      throw err;
    }
  }
}
