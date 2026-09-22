import type { IUser } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { ITokenPair } from "../../domain/interfaces/IAuthService.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { BadRequestError } from "../../shared/errors/AppError.js";

export class VerifyEmailUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly jwtService: JwtTokenService,
  ) {}

  async execute(input: {
    email: string;
    otp: string;
  }): Promise<{ user: Omit<IUser, "passwordHash">; tokens: ITokenPair }> {
    const otpRecord = await this.otpRepo.findLatestByEmail(input.email);

    if (!otpRecord) {
      throw new BadRequestError("No OTP found for this email. Please request a new one.");
    }

    if (otpRecord.code !== input.otp) {
      throw new BadRequestError("Invalid OTP code.");
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new BadRequestError("OTP has expired. Please request a new one.");
    }

    const user = await this.userRepo.findByEmail(input.email);
    if (!user) {
      throw new BadRequestError("User not found.");
    }

    await this.userRepo.setVerified(user.id);
    await this.otpRepo.deleteByEmail(input.email);

    const tokens = this.jwtService.generateTokens(user.id, user.role);

    const { passwordHash: _ph, ...safeUser } = user;
    return { user: { ...safeUser, isVerified: true }, tokens };
  }
}
