import type { UserRole } from "../../domain/entities/User.js";
import type { IProject } from "../../domain/entities/Project.js";
import type { ProjectMemberRole } from "../../domain/entities/ProjectMember.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
      };
      project?: IProject;
      projectMemberRole?: ProjectMemberRole | "owner";
    }
  }
}

export {};

