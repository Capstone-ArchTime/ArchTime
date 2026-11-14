import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceComponent } from "../../../domain/entities/Workspace.js";
import { findPrefixOverlap, normalizePathPrefixes, overlapMessage } from "../../../domain/architecture/paths.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors/AppError.js";

type IncomingComponent = Omit<IWorkspaceComponent, "pathPrefixes"> & { pathPrefixes?: unknown };

/**
 * The components a whole-diagram save writes, with their path prefixes settled (BR-27): a component sent without
 * `pathPrefixes` keeps the stored ones (an editor that does not know about prefixes must not wipe them); sent ones are
 * normalized. Throws a 400 for a refused prefix and MSG24 when two components share one.
 */
export function settleComponentPaths(incoming: IncomingComponent[], stored: IWorkspaceComponent[] = []): IWorkspaceComponent[] {
  const before = new Map(stored.map(c => [c.id, c.pathPrefixes ?? []]));
  const settled = incoming.map((component, i) => {
    if (component.pathPrefixes === undefined) return { ...component, pathPrefixes: before.get(component.id) ?? [] };
    const result = normalizePathPrefixes(component.pathPrefixes);
    if ("invalid" in result) {
      const message = `Path prefix "${result.invalid}" of component "${component.name}" is not a path inside the repository.`;
      throw new ValidationError(message, { [`diagram.components[${i}].pathPrefixes`]: message });
    }
    return { ...component, pathPrefixes: result.prefixes };
  });
  const overlap = findPrefixOverlap(settled);
  if (overlap) {
    const index = settled.findIndex(c => c.id === overlap.second.id);
    throw new ValidationError(overlapMessage(overlap), { [`diagram.components[${index}].pathPrefixes`]: overlapMessage(overlap) });
  }
  return settled;
}

export interface SetComponentPathsInput {
  projectId: string;
  componentId: string;
  pathPrefixes: unknown;
  /** The workspace revision the page loaded; a save over a newer one is refused with 409. */
  expectedRevision?: number;
  userId?: string;
}

/**
 * Sets the path prefixes of one component (RF-08). Prefixes map files to components; they are not part of the diagram's
 * confirmed content, so the confirmation and its baseline stay as they are.
 */
export class SetComponentPathsUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: SetComponentPathsInput): Promise<{ component: IWorkspaceComponent; revision: number }> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Workspace not found.");
    const workspace = await this.workspaceRepository.findByProjectId(input.projectId);
    const components = workspace?.diagram?.components ?? [];
    if (!workspace || !components.some(c => c.id === input.componentId)) throw new NotFoundError("Component not found in this workspace's diagram.");
    if (input.expectedRevision !== undefined && input.expectedRevision !== workspace.revision) throw this.conflict(input.expectedRevision, workspace.revision);

    const settled = settleComponentPaths(components.map(c => (c.id === input.componentId ? { ...c, pathPrefixes: input.pathPrefixes } : c)), components);
    try {
      const saved = await this.workspaceRepository.save(
        { projectId: input.projectId, revision: workspace.revision, diagram: { ...workspace.diagram, components: settled }, rules: workspace.rules, decisions: workspace.decisions, updatedBy: input.userId },
        workspace.revision,
      );
      const component = saved.diagram.components.find(c => c.id === input.componentId)!;
      return { component, revision: saved.revision };
    } catch (err) {
      const conflict = err as { isConflict?: boolean; expectedRevision?: number; currentRevision?: number };
      if (conflict.isConflict) throw this.conflict(conflict.expectedRevision ?? workspace.revision, conflict.currentRevision);
      throw err;
    }
  }

  private conflict(expected: number, current?: number) {
    return new ConflictError(`Workspace revision conflict: expected revision ${expected}, but current revision on server is ${current ?? "newer"}. Please reload to avoid overwriting newer changes.`, "CONFLICT");
  }
}
