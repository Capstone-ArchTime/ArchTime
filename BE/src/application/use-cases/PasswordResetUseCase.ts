import { createHash, randomBytes } from "node:crypto";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import { BadRequestError } from "../../shared/errors/AppError.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const message = "If this email belongs to a verified account, a reset code has been sent. Check your inbox and spam folder. Wait at least one minute before requesting another code.";
function normalizeEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new BadRequestError("Enter a valid email address.");
  }
  return value.trim().toLowerCase();
}
export class PasswordResetUseCase {
  constructor(private readonly users: IUserRepository, private readonly email: IEmailService, private readonly hasher: BcryptHasher) {}
  async request(input: { email?: unknown }) {
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);
    if (user?.isVerified) {
      const token = randomBytes(16).toString("hex");
      const hash = digest(token);
      const now = new Date();
      const saved = await this.users.requestPasswordReset(user.id, hash, now, new Date(now.getTime() + 600_000));
      if (saved) {
        try { await this.email.sendPasswordReset(user.email, token); }
        catch {
          await this.users.clearPasswordReset(user.id, hash);
          console.error("Password reset email delivery failed.");
        }
      }
    }
    return { message };
  }
  async reset(input: { email?: unknown; token?: unknown; password?: unknown; confirmPassword?: unknown }) {
    const email = normalizeEmail(input.email);
    if (typeof input.token !== "string" || !/^[a-f0-9]{32}$/.test(input.token)) throw new BadRequestError("Invalid or expired reset code.");
    if (typeof input.password !== "string" || input.password.length < 8 || Buffer.byteLength(input.password, "utf8") > 72) {
      throw new BadRequestError("Password must be at least 8 characters and at most 72 UTF-8 bytes.");
    }
    if (input.password !== input.confirmPassword) throw new BadRequestError("Passwords do not match.");
    const passwordHash = await this.hasher.hashPassword(input.password);
    if (!await this.users.resetPassword(email, digest(input.token), passwordHash, new Date())) throw new BadRequestError("Invalid or expired reset code.");
    return { message: "Password updated. Please sign in with your new password." };
  }
}
