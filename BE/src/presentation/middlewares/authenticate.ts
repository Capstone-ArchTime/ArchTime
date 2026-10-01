import type { Request, Response, NextFunction } from "express";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";

import { MongoUserRepository } from "../../infrastructure/repositories/MongoUserRepository.js";

export function createAuthenticateMiddleware(jwtService: JwtTokenService) {
  const users = new MongoUserRepository();
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      next(new UnauthorizedError("Authorization header missing or malformed."));
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = jwtService.verifyAccessToken(token);
      const user = await users.findById(payload.userId);
      if (!user || !user.isVerified || (user.tokenVersion ?? 0) !== payload.version) throw new UnauthorizedError("Session revoked.");
      req.user = { userId: payload.userId, role: payload.role as import("../../domain/entities/User.js").UserRole };
      next();
    } catch {
      next(new UnauthorizedError("Invalid or expired access token."));
    }
  };
}
