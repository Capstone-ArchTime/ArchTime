import jwt from "jsonwebtoken";
import type { IAuthService, ITokenPair } from "../../domain/interfaces/IAuthService.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";

interface AccessTokenPayload {
  sub: string;
  role: string;
  type: "access";
}

interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
}

export class JwtTokenService implements IAuthService {
  constructor(
    private readonly secret: string,
    private readonly accessExpiresIn: string,
    private readonly refreshExpiresIn: string,
  ) {}

  // ── These methods are delegated to BcryptHasher via container ──
  // JwtTokenService only handles JWT; hashing is in BcryptHasher.
  // The IAuthService interface is split at runtime through the container.
  async hashPassword(_password: string): Promise<string> {
    throw new Error("Use BcryptHasher for password hashing");
  }

  async comparePassword(_password: string, _hash: string): Promise<boolean> {
    throw new Error("Use BcryptHasher for password comparison");
  }

  generateTokens(userId: string, role: string): ITokenPair {
    return {
      accessToken: this.generateAccessToken(userId, role),
      refreshToken: this.signRefreshToken(userId),
    };
  }

  generateAccessToken(userId: string, role: string): string {
    const payload: AccessTokenPayload = { sub: userId, role, type: "access" };
    return jwt.sign(payload, this.secret, {
      expiresIn: this.accessExpiresIn as jwt.SignOptions["expiresIn"],
    });
  }

  private signRefreshToken(userId: string): string {
    const payload: RefreshTokenPayload = { sub: userId, type: "refresh" };
    return jwt.sign(payload, this.secret, {
      expiresIn: this.refreshExpiresIn as jwt.SignOptions["expiresIn"],
    });
  }

  verifyAccessToken(token: string): { userId: string; role: string } {
    try {
      const payload = jwt.verify(token, this.secret) as AccessTokenPayload;
      if (payload.type !== "access") throw new UnauthorizedError("Invalid token type");
      return { userId: payload.sub, role: payload.role };
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
  }

  verifyRefreshToken(token: string): { userId: string } {
    try {
      const payload = jwt.verify(token, this.secret) as RefreshTokenPayload;
      if (payload.type !== "refresh") throw new UnauthorizedError("Invalid token type");
      return { userId: payload.sub };
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
  }
}
