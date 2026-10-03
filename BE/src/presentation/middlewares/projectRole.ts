import type { Request, Response, NextFunction } from "express";
import { UserRole } from "../../domain/entities/User.js";
import { RepoVisibility } from "../../domain/entities/Project.js";
import {
  MemberStatus,
  ProjectMemberRole,
} from "../../domain/entities/ProjectMember.js";
import type { IProjectRepository } from "../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../domain/interfaces/IProjectMemberRepository.js";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/AppError.js";

export type ProjectAction = "read" | "write" | "admin";

/**
 * Middleware factory to enforce project-level permissions:
 * - SYSTEM_ADMINISTRATOR: full access to all projects
 * - Project Owner (project.userId): full access
 * - Project Maintainer: full access (read, write, admin)
 * - Project Member (developer-analyst): read access only
 * - Public projects: read access for any authenticated user
 */
export function createProjectRoleMiddleware(
  projectRepository: IProjectRepository,
  memberRepository: IProjectMemberRepository,
) {
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
          next(new NotFoundError("Project not found."));
          return;
        }

        // 1. System Administrator has full superuser access
        if (req.user.role === UserRole.SYSTEM_ADMINISTRATOR) {
          req.project = project;
          next();
          return;
        }

        // 2. Project Owner has full access
        if (project.userId === req.user.userId) {
          req.project = project;
          req.projectMemberRole = "owner";
          next();
          return;
        }

        // 3. Check active membership in project_members
        const member = await memberRepository.findByProjectAndUserId(
          projectId,
          req.user.userId,
        );

        if (member && member.status === MemberStatus.ACTIVE) {
          req.project = project;
          req.projectMemberRole = member.role;

          if (action === "read") {
            next();
            return;
          }

          if (member.role === ProjectMemberRole.MAINTAINER) {
            next();
            return;
          }

          next(
            new ForbiddenError(
              "Forbidden: only project maintainers can perform this action.",
            ),
          );
          return;
        }

        // 4. Public project read-only access
        if (action === "read" && project.visibility === RepoVisibility.PUBLIC) {
          req.project = project;
          next();
          return;
        }

        // 5. Unauthorized access
        next(
          new ForbiddenError(
            "Forbidden: you do not have permission to access this project.",
          ),
        );
      } catch (error) {
        next(error);
      }
    };
  };
}
