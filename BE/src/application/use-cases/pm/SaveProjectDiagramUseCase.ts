import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceDiagram } from "../../../domain/entities/Workspace.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors/AppError.js";
import { LOCKED_DIAGRAM_MESSAGE, editsLockedDiagram, settleConfirmation } from "../../../domain/architecture/canonical.js";
import { checkPathPrefixes } from "../../../domain/architecture/pathPrefix.js";
import type { LatestCommitLookup } from "../../../domain/interfaces/ILatestCommit.js";

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
    const { projectId, expectedRevision, userId } = input;
    let { diagram } = input;

    if (!diagram || !Array.isArray(diagram.components) || !Array.isArray(diagram.dependencies)) {
      throw new BadRequestError("Invalid diagram: components and dependencies are required.");
    }
    const prefixes = checkPathPrefixes(diagram.components);
    if (prefixes.problem) throw new BadRequestError(prefixes.problem, "VALIDATION_ERROR");
    diagram = { ...diagram, components: prefixes.components };

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    let ws = await this.workspaceRepository.findByProjectId(projectId);
    if (editsLockedDiagram(ws?.diagram, diagram)) throw new ConflictError(LOCKED_DIAGRAM_MESSAGE, "DIAGRAM_LOCKED");
    const currentRules = ws?.rules ?? [];
    const currentDecisions = ws?.decisions ?? [];

    const updated = await this.workspaceRepository.save(
      {
        projectId,
        revision: expectedRevision ?? ws?.revision ?? 1,
        // This route never confirms, and a confirmed diagram reaches here only unchanged, so its confirmation stays.
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
    ).catch((err) => {
      // A stale expectedRevision is the client's to resolve (reload), not a server error.
      if (err?.isConflict) {
        throw new ConflictError(`Diagram revision conflict: expected revision ${err.expectedRevision}, but the server has revision ${err.currentRevision}. Reload before saving.`, "CONFLICT");
      }
      throw err;
    });

    return { diagram: updated.diagram, revision: updated.revision };
  }
}

/** Unlocks a confirmed diagram for direct editing: the content stays, the confirmation and its baseline go. */
export class UnconfirmProjectDiagramUseCase {
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
    if (!ws?.diagram?.confirmedAt) {
      throw new BadRequestError("The diagram is not confirmed.", "VALIDATION_ERROR");
    }

    const updated = await this.workspaceRepository.save(
      {
        projectId,
        revision: ws.revision,
        diagram: { ...ws.diagram, ...settleConfirmation({ stored: ws.diagram, incoming: ws.diagram, request: "clear", now: new Date(), nextRevision: 0 }) },
        rules: ws.rules,
        decisions: ws.decisions,
        updatedBy: userId,
      },
      ws.revision,
    );

    return { diagram: updated.diagram, revision: updated.revision };
  }
}

export class ConfirmProjectDiagramUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
    /** Baseline of the confirmation (BR-32). */
    private readonly latestCommit?: LatestCommitLookup,
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
      ...settleConfirmation({ stored: ws.diagram, incoming: ws.diagram, request: "confirm", userId, now: new Date(), nextRevision: ws.revision + 1,
        baselineCommit: this.latestCommit ? await this.latestCommit(projectId) : null }),
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
