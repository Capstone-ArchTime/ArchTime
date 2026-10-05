import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceDiagram } from "../../../domain/entities/Workspace.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

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
      throw new NotFoundError("Project not found.");
    }

    let ws = await this.workspaceRepository.findByProjectId(projectId);
    const currentRules = ws?.rules ?? [];
    const currentDecisions = ws?.decisions ?? [];

    const updated = await this.workspaceRepository.save(
      {
        projectId,
        revision: expectedRevision ?? ws?.revision ?? 1,
        diagram: {
          ...diagram,
          confirmedAt: ws?.diagram?.confirmedAt ?? null,
          confirmedBy: ws?.diagram?.confirmedBy ?? null,
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
      throw new NotFoundError("Project not found.");
    }

    const ws = await this.workspaceRepository.findByProjectId(projectId);
    if (!ws) {
      throw new NotFoundError("Workspace not found. Save diagram before confirming.");
    }

    const confirmedDiagram: IWorkspaceDiagram = {
      ...ws.diagram,
      confirmedAt: new Date(),
      confirmedBy: userId,
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
