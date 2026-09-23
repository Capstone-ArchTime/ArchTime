import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const OTP_TTL_MINUTES = 10;

export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(input: { email: string }): Promise<{ message: string }> {
    const user = await this.userRepo.findByEmail(input.email);
    if (!user) {
      // Return a success message even if user not found to prevent email enumeration
      return {
        message: "If an account with that email exists, we have sent a password reset OTP.",
      };
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Remove any previous OTPs for this email before saving new one
    await this.otpRepo.deleteByEmail(input.email);
    await this.otpRepo.create(user.email, code, expiresAt);

    await this.emailService.sendPasswordResetOtp(user.email, code);

    return {
      message: "If an account with that email exists, we have sent a password reset OTP.",
    };
  }
}
