import type { IUser, UserRole } from "../entities/User.js";

export interface IUserRepository {
  findByEmail(email: string): Promise<IUser | null>;
  findById(id: string): Promise<IUser | null>;
  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<IUser>;
  existsByEmail(email: string): Promise<boolean>;
  requestPasswordReset(userId: string, tokenHash: string, now: Date, expiresAt: Date): Promise<boolean>;
  resetPassword(email: string, tokenHash: string, passwordHash: string, now: Date): Promise<boolean>;
  clearPasswordReset(userId: string, tokenHash: string): Promise<void>;
  setVerified(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}
