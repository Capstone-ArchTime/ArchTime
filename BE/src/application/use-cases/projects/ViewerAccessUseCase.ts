import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import { MAX_VIEWER_DAILY_LIMIT, RepoVisibility, viewerAccessOf, type IProjectViewerAccess } from "../../../domain/entities/Project.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

/**
 * The owner of a public personal workspace decides what viewers may do (UC-16, BR-17). Organization workspaces have no
 * viewers: only members of the organization see them.
 */
export class ViewerAccessUseCase {
  constructor(private readonly projects: Pick<IProjectRepository, "findById" | "updateViewerAccess">) {}

  async get(projectId: string): Promise<IProjectViewerAccess> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError("Workspace not found.");
    return viewerAccessOf(project);
  }

  async update(projectId: string, patch: Record<string, unknown>): Promise<IProjectViewerAccess> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError("Workspace not found.");
    if (project.organizationId) throw new BadRequestError("Organization workspaces have no viewers: only members of the organization see them.", "VALIDATION_ERROR");
    if (project.visibility !== RepoVisibility.PUBLIC) throw new BadRequestError("Only workspaces of public repositories can have viewers.", "VALIDATION_ERROR");
    const next = { ...viewerAccessOf(project) };
    for (const key of ["publicRead", "allowChat"] as const) {
      if (patch[key] === undefined) continue;
      if (typeof patch[key] !== "boolean") throw new BadRequestError(`${key} must be true or false.`, "VALIDATION_ERROR");
      next[key] = patch[key] as boolean;
    }
    if (patch.dailyLimit !== undefined) {
      const n = Number(patch.dailyLimit);
      if (!Number.isInteger(n) || n < 1 || n > MAX_VIEWER_DAILY_LIMIT) {
        throw new BadRequestError(`dailyLimit must be a whole number from 1 to ${MAX_VIEWER_DAILY_LIMIT}.`, "VALIDATION_ERROR");
      }
      next.dailyLimit = n;
    }
    const saved = await this.projects.updateViewerAccess(projectId, next);
    if (!saved) throw new NotFoundError("Workspace not found.");
    return viewerAccessOf(saved);
  }
}
