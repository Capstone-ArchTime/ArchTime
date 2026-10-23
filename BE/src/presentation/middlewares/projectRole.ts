import type { Request, Response, NextFunction } from "express";
import {
  ProjectAccessPolicy,
  deniedMessage,
  type ProjectAction,
} from "../../application/services/ProjectAccessPolicy.js";
import type { IProjectRepository } from "../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../domain/interfaces/IProjectMemberRepository.js";
import type { IOrganizationRepository } from "../../domain/interfaces/IOrganizationRepository.js";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/AppError.js";

export type { ProjectAction };

/**
 * Enforces project-level permissions for routes with an `:id` project parameter; the rules live in
 * ProjectAccessPolicy. On success the project and the caller's access are put on the request.
 */
export function createProjectRoleMiddleware(
  projectRepository: IProjectRepository,
  memberRepository: IProjectMemberRepository,
  organizationRepository?: IOrganizationRepository,
) {
  const policy = new ProjectAccessPolicy(projectRepository, memberRepository, organizationRepository);
  return (action: ProjectAction) => {
    return async (
      req: Request,
      _res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const projectId = req.params.id;
        if (!projectId) {
          next();
          return;
        }

        if (!req.user) {
          next(new UnauthorizedError("Authentication required."));
          return;
        }

        const project = await projectRepository.findById(projectId);
        if (!project) {
          next(new NotFoundError("Workspace not found."));
          return;
        }

        const access = await policy.evaluate(project, req.user);
        if (!access.actions.has(action)) {
          next(new ForbiddenError(deniedMessage(access, action)));
          return;
        }

        req.project = project;
        req.projectAccess = access;
        if (access.memberRole) req.projectMemberRole = access.memberRole;
        next();
      } catch (error) {
        next(error);
      }
    };
  };
}
