import { UserRole } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import { ConflictError } from "../../shared/errors/AppError.js";

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const OTP_TTL_MINUTES = 10;

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly hasher: BcryptHasher,
    private readonly emailService: IEmailService,
  ) {}

  async execute(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ message: string; email: string }> {
    const exists = await this.userRepo.existsByEmail(input.email);
    if (exists) {
      throw new ConflictError("Email is already registered");
    }

    const passwordHash = await this.hasher.hashPassword(input.password);

    const user = await this.userRepo.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: UserRole.DEVELOPER_ANALYST,
    });

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Remove any previous OTPs for this email before saving new one
    await this.otpRepo.deleteByEmail(input.email);
    await this.otpRepo.create(user.email, code, expiresAt);

    await this.emailService.sendOtp(user.email, code);

    return {
      message: `Verification OTP sent to ${user.email}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      email: user.email,
    };
  }
}
