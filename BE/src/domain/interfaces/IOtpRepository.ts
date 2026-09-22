import type { IOtp } from "../entities/Otp.js";

export interface IOtpRepository {
  create(email: string, code: string, expiresAt: Date): Promise<IOtp>;
  findLatestByEmail(email: string): Promise<IOtp | null>;
  deleteByEmail(email: string): Promise<void>;
}
