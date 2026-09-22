import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../../domain/entities/User.js";

/**
 * Role-based access control middleware factory.
 *
 * Usage:
 *   router.get("/admin", authenticate, authorize(UserRole.SYSTEM_ADMINISTRATOR), handler)
 *   router.delete("/project/:id", authenticate, authorize(UserRole.PROJECT_MAINTAINER, UserRole.SYSTEM_ADMINISTRATOR), handler)
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "Forbidden: you do not have permission to access this resource.",
        requiredRoles: allowedRoles,
        yourRole: req.user.role,
      });
      return;
    }

    next();
  };
}
