import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceDiagram } from "../../../domain/entities/Workspace.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";
import { settleConfirmation } from "../../../domain/architecture/canonical.js";

export interface SaveDiagramInput {
  projectId: string;
  expectedRevision?: number;
  diagram: IWorkspaceDiagram;
  userId?: string;
}

export class SaveProjectDiagramUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: SaveDiagramInput): Promise<{ diagram: IWorkspaceDiagram; revision: number }> {
    const { projectId, expectedRevision, diagram, userId } = input;

    if (!diagram || !Array.isArray(diagram.components) || !Array.isArray(diagram.dependencies)) {
      throw new BadRequestError("Invalid diagram: components and dependencies are required.");
    }

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    let ws = await this.workspaceRepository.findByProjectId(projectId);
    const currentRules = ws?.rules ?? [];
    const currentDecisions = ws?.decisions ?? [];

    const updated = await this.workspaceRepository.save(
      {
        projectId,
        revision: expectedRevision ?? ws?.revision ?? 1,
        // This route never confirms: the stored confirmation stays only if the content is unchanged.
        diagram: {
          components: diagram.components,
          dependencies: diagram.dependencies,
          revision: diagram.revision,
          ...settleConfirmation({ stored: ws?.diagram, incoming: diagram, request: "keep", now: new Date(), nextRevision: 0 }),
        },
        rules: currentRules,
        decisions: currentDecisions,
        updatedBy: userId,
      },
      expectedRevision,
    );

    return { diagram: updated.diagram, revision: updated.revision };
  }
}

export class ConfirmProjectDiagramUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string, userId: string): Promise<{ diagram: IWorkspaceDiagram; revision: number }> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    const ws = await this.workspaceRepository.findByProjectId(projectId);
    if (!ws) {
      throw new NotFoundError("Workspace not found. Save diagram before confirming.");
    }

    if (!ws.diagram?.components?.length) {
      throw new BadRequestError("Add at least one component before confirming the diagram.", "VALIDATION_ERROR");
    }
    const confirmedDiagram: IWorkspaceDiagram = {
      ...ws.diagram,
      ...settleConfirmation({ stored: ws.diagram, incoming: ws.diagram, request: "confirm", userId, now: new Date(), nextRevision: ws.revision + 1 }),
    };

    const updated = await this.workspaceRepository.save(
      {
        projectId,
        revision: ws.revision,
        diagram: confirmedDiagram,
        rules: ws.rules,
        decisions: ws.decisions,
        updatedBy: userId,
      },
      ws.revision,
    );

    return { diagram: updated.diagram, revision: updated.revision };
  }
}
