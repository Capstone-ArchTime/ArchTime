import { randomBytes } from "node:crypto";
import { UserStatus, type IUser } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { ITokenPair } from "../../domain/interfaces/IAuthService.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../shared/errors/AppError.js";

export class LoginUseCase {
  // A hash made with the same cost as real ones, created on first use, so an unknown account costs as much as a wrong password.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hasher: BcryptHasher,
    private readonly jwtService: JwtTokenService,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<{ user: Omit<IUser, "passwordHash">; tokens: ITokenPair }> {
    const user = await this.userRepo.findByEmailOrUsername(input.email);
    if (!user) {
      // Still do the slow password check, so the response time does not tell whether the account exists.
      this.dummyHash ??= this.hasher.hashPassword(randomBytes(16).toString("hex"));
      await this.hasher.comparePassword(input.password, await this.dummyHash);
      throw new UnauthorizedError("Invalid credentials.", "INVALID_CREDENTIALS");
    }

    const passwordMatch = await this.hasher.comparePassword(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedError("Invalid credentials.", "INVALID_CREDENTIALS");
    }

    // Block login if email not verified
    if (!user.isVerified) {
      throw new ForbiddenError(
        "Email not verified. Please check your inbox for the OTP.",
      );
    }

    // Block login if account suspended
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError(
        "Account has been suspended. Please contact administrator.",
      );
    }

    const tokens = this.jwtService.generateTokens(user.id, user.role, user.tokenVersion ?? 0);
    const { passwordHash: _ph, ...safeUser } = user;
    return { user: safeUser, tokens };
  }
}
