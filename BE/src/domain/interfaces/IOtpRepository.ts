import type { IOtp } from "../entities/Otp.js";

export interface IOtpRepository {
  create(email: string, codeHash: string, expiresAt: Date): Promise<IOtp>;
  findLatestByEmail(email: string): Promise<IOtp | null>;
  /**
   * Uses up one guess on the code, in a single atomic step so parallel requests cannot make more than `maxAttempts`
   * guesses in total. Returns the code with the updated count, or null when it has no guesses left (or is gone).
   */
  takeAttempt(id: string, maxAttempts: number): Promise<IOtp | null>;
  deleteByEmail(email: string): Promise<void>;
}
