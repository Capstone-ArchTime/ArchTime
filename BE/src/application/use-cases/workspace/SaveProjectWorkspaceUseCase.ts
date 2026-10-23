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

/**
 * The whole-workspace save carries ADR text but not provenance: origin, sources and authorship are taken from the stored
 * ADR (sources are only changed through the ADR endpoints, which verify them). A status change is added to the history.
 */
function keepProvenance(
  incoming: IWorkspaceDecision[],
  stored: IWorkspaceDecision[],
  userId?: string,
): IWorkspaceDecision[] {
  const byId = new Map(stored.map((d) => [d.id, d]));
  const now = new Date();
  return incoming.map((d) => {
    const before = byId.get(d.id);
    if (!before) {
      return {
        ...d,
        origin: d.origin === "reconstructed" ? "reconstructed" : "recorded",
        sources: [],
        statusHistory: [{ status: d.status, at: now, by: userId }],
        createdBy: userId,
        updatedBy: userId,
      };
    }
    const history = before.statusHistory?.length
      ? before.statusHistory
      : [{ status: before.status, at: before.createdAt ?? now }];
    return {
      ...d,
      origin: before.origin ?? "recorded",
      sources: before.sources ?? [],
      statusHistory: d.status === before.status ? history : [...history, { status: d.status, at: now, by: userId }],
      createdBy: before.createdBy,
      updatedBy: userId ?? before.updatedBy,
    };
  });
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
      throw new BadRequestError("Workspace ID is required.", "VALIDATION_ERROR");
    }

    if (!diagram || !Array.isArray(diagram.components) || !Array.isArray(diagram.dependencies)) {
      throw new BadRequestError(
        "Invalid diagram payload: components and dependencies arrays are required.",
        "VALIDATION_ERROR",
      );
    }

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError("Workspace not found.");
    }

    const current = await this.workspaceRepository.findByProjectId(projectId);

    try {
      const saved = await this.workspaceRepository.save(
        {
          projectId,
          revision: expectedRevision ?? 1,
          diagram,
          rules: rules ?? [],
          decisions: keepProvenance(decisions ?? [], current?.decisions ?? [], userId),
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
