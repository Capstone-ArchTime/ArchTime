import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";
import type { OtpCodeService } from "../../infrastructure/services/OtpCodeService.js";
import { normalizeEmail } from "../../shared/utils/normalize.js";

const OTP_TTL_MINUTES = 10;

export class ResendOtpUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly emailService: IEmailService,
    private readonly otpCodes: OtpCodeService,
  ) {}

  /**
   * Answers the same way for every address, so this cannot be used to find out who has an account: a real, unverified
   * account gets a new code; an unknown or already verified address gets the identical answer and no mail.
   */
  async execute(input: { email: string }): Promise<{ message: string; expiresAt: string }> {
    const email = normalizeEmail(input.email);
    const user = await this.userRepo.findByEmail(email);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    if (user && !user.isVerified) {
      await this.otpRepo.deleteByEmail(email);
      const code = this.otpCodes.generate();
      await this.otpRepo.create(email, this.otpCodes.hash(email, code), expiresAt);
      // Not awaited: waiting for the mail server would make a real account answer slower than an unknown address.
      void (async () => {
        try { await this.emailService.sendOtp(email, code); }
        catch (err) { console.error("Verification email delivery failed:", err); }
      })();
    }

    return {
      message: `If this email has an account waiting to be verified, a new code has been sent to it. It expires in ${OTP_TTL_MINUTES} minutes.`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
