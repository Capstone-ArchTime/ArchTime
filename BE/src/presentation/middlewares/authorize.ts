import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../../domain/entities/User.js";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/AppError.js";

/**
 * Role-based access control middleware factory for system-level roles.
 *
 * Usage:
 *   router.get("/admin", authenticate, authorize(UserRole.SYSTEM_ADMINISTRATOR), handler)
 *
 * Project-level permissions (owner, maintainer, member) are checked by projectRole.ts instead.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Authentication required."));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          "Forbidden: you do not have permission to access this resource.",
        ),
      );
      return;
    }

    next();
  };
}

