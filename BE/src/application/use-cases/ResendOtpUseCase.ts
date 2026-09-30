import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/AppError.js";

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const OTP_TTL_MINUTES = 10;

export class ResendOtpUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(input: { email: string }): Promise<{ message: string }> {
    const user = await this.userRepo.findByEmail(input.email);
    if (!user) {
      throw new NotFoundError("No account found with this email.");
    }

    if (user.isVerified) {
      throw new BadRequestError("This email is already verified.");
    }

    await this.otpRepo.deleteByEmail(input.email);

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await this.otpRepo.create(input.email, code, expiresAt);

    await this.emailService.sendOtp(input.email, code);

    return {
      message: `A new OTP has been sent to ${input.email}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    };
  }
}
