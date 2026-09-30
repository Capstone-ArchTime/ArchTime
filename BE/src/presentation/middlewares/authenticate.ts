import type { Request, Response, NextFunction } from "express";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";

export function createAuthenticateMiddleware(jwtService: JwtTokenService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      next(new UnauthorizedError("Authorization header missing or malformed."));
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = jwtService.verifyAccessToken(token);
      req.user = { userId: payload.userId, role: payload.role as import("../../domain/entities/User.js").UserRole };
      next();
    } catch {
      next(new UnauthorizedError("Invalid or expired access token."));
    }
  };
}
