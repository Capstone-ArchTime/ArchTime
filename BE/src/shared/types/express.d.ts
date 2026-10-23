import type { UserRole } from "../../domain/entities/User.js";
import type { IProject } from "../../domain/entities/Project.js";
import type { ProjectMemberRole } from "../../domain/entities/ProjectMember.js";
import type { ProjectAccess } from "../../application/services/ProjectAccessPolicy.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
      };
      project?: IProject;
      projectMemberRole?: ProjectMemberRole | "owner";
      /** Set by projectRole middleware: what the caller may do in req.project. */
      projectAccess?: ProjectAccess;
    }
  }
}

export {};

