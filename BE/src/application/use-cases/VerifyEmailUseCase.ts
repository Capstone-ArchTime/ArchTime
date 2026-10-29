import type { IUser } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import type { ITokenPair } from "../../domain/interfaces/IAuthService.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import type { OtpCodeService } from "../../infrastructure/services/OtpCodeService.js";
import { AppError, BadRequestError } from "../../shared/errors/AppError.js";
import { normalizeEmail } from "../../shared/utils/normalize.js";

/** Wrong guesses one emailed code survives. The next code has to be requested. */
export const MAX_OTP_ATTEMPTS = 5;

export class VerifyEmailUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly otpRepo: IOtpRepository,
    private readonly jwtService: JwtTokenService,
    private readonly otpCodes: OtpCodeService,
  ) {}

  async execute(input: {
    email: string;
    otp: string;
  }): Promise<{ user: Omit<IUser, "passwordHash">; tokens: ITokenPair }> {
    const email = normalizeEmail(input.email);
    // Not a guess at the code, so it costs no attempt.
    if (typeof input.otp !== "string" || !/^\d{6}$/.test(input.otp.trim())) {
      throw new BadRequestError("Enter the six-digit code from your email.", "OTP_INVALID");
    }
    const code = input.otp.trim();

    const otpRecord = await this.otpRepo.findLatestByEmail(email);
    if (!otpRecord) {
      throw new BadRequestError("No OTP found for this email. Please request a new one.");
    }

    // Expiry first: an expired code is never compared, and never costs an attempt.
    if (new Date() > otpRecord.expiresAt) {
      throw new BadRequestError("OTP has expired. Please request a new one.", "OTP_EXPIRED");
    }

    // The guess is paid for before it is checked, in one atomic step, so parallel requests cannot make more than MAX_OTP_ATTEMPTS.
    const taken = await this.otpRepo.takeAttempt(otpRecord.id, MAX_OTP_ATTEMPTS);
    if (!taken) throw otpLocked();

    if (!this.otpCodes.matches(email, code, taken.codeHash)) {
      if (taken.attempts >= MAX_OTP_ATTEMPTS) throw otpLocked();
      const left = MAX_OTP_ATTEMPTS - taken.attempts;
      throw new BadRequestError(`Invalid OTP code. ${left} ${left === 1 ? "try" : "tries"} left.`, "OTP_INVALID");
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new BadRequestError("User not found.");
    }

    await this.userRepo.setVerified(user.id);
    await this.otpRepo.deleteByEmail(email);

    const tokens = this.jwtService.generateTokens(user.id, user.role, user.tokenVersion ?? 0);

    const { passwordHash: _ph, ...safeUser } = user;
    return { user: { ...safeUser, isVerified: true }, tokens };
  }
}

// The locked code stays in the database (until it expires or a new code replaces it), so a later correct guess gets this same answer.
const otpLocked = () => new AppError(429, "OTP_LOCKED", "Too many wrong codes. Request a new code to continue.");
