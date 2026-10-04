import type { Request, Response, NextFunction } from "express";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { AppError, UnauthorizedError } from "../../shared/errors/AppError.js";
import { UserStatus, type UserRole } from "../../domain/entities/User.js";
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
      if (!user || (user.tokenVersion ?? 0) !== payload.version) {
        throw new UnauthorizedError("Session revoked.");
      }
      if (user.status === UserStatus.SUSPENDED) {
        throw new UnauthorizedError("Account has been suspended.");
      }
      if (!user.isVerified) {
        throw new UnauthorizedError("Email not verified.");
      }
      req.user = { userId: payload.userId, role: payload.role as UserRole };
      next();
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new UnauthorizedError("Invalid or expired access token."));
    }
  };
}
