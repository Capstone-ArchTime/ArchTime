import { UserRole } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import type { OtpCodeService } from "../../infrastructure/services/OtpCodeService.js";
import { ConflictError } from "../../shared/errors/AppError.js";
import { normalizeEmail } from "../../shared/utils/normalize.js";

const OTP_TTL_MINUTES = 10;

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly hasher: BcryptHasher,
    private readonly emailService: IEmailService,
    private readonly otpCodes: OtpCodeService,
  ) {}

  async execute(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ message: string; email: string; expiresAt: string }> {
    const email = normalizeEmail(input.email);
    const exists = await this.userRepo.existsByEmail(email);
    if (exists) {
      throw new ConflictError("Email is already registered");
    }

    const passwordHash = await this.hasher.hashPassword(input.password);

    const user = await this.userRepo.create({
      name: input.name,
      email,
      passwordHash,
      role: UserRole.USER,
    });

    const code = this.otpCodes.generate();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Remove any previous OTPs for this email before saving new one. Only a hash of the code is stored.
    await this.otpRepo.deleteByEmail(user.email);
    await this.otpRepo.create(user.email, this.otpCodes.hash(user.email, code), expiresAt);

    await this.emailService.sendOtp(user.email, code);

    return {
      message: `Verification OTP sent to ${user.email}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      email: user.email,
      // So the verification page can count down to it.
      expiresAt: expiresAt.toISOString(),
    };
  }
}
