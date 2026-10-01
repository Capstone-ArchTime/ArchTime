import type { UserRole } from "../../domain/entities/User.js";

declare global {
  namespace Express {
    interface User {
      userId?: string;
      role?: UserRole;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};

