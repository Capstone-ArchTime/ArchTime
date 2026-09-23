import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import { BadRequestError } from "../../shared/errors/AppError.js";

export class ResetPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly hasher: BcryptHasher,
  ) {}

  async execute(input: {
    email: string;
    otp: string;
    newPassword: string;
  }): Promise<{ message: string }> {
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

    const passwordHash = await this.hasher.hashPassword(input.newPassword);
    
    await this.userRepo.updatePassword(user.id, passwordHash);
    await this.otpRepo.deleteByEmail(input.email);

    return { message: "Password has been reset successfully." };
  }
}
