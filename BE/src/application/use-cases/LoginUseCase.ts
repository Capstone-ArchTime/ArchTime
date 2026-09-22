import type { IUser } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { ITokenPair } from "../../domain/interfaces/IAuthService.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../shared/errors/AppError.js";

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hasher: BcryptHasher,
    private readonly jwtService: JwtTokenService,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<{ user: Omit<IUser, "passwordHash">; tokens: ITokenPair }> {
    const user = await this.userRepo.findByEmail(input.email);
    if (!user) {
      // Deliberate vague message to prevent email enumeration
      throw new UnauthorizedError("Invalid email or password.");
    }

    const passwordMatch = await this.hasher.comparePassword(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    // Block login if email not verified
    if (!user.isVerified) {
      throw new ForbiddenError(
        "Email not verified. Please check your inbox for the OTP.",
      );
    }

    const tokens = this.jwtService.generateTokens(user.id, user.role);
    const { passwordHash: _ph, ...safeUser } = user;
    return { user: safeUser, tokens };
  }
}
