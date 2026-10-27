import type { IUser, UserRole, UserStatus } from "../entities/User.js";
import type { PaginatedResult } from "../../shared/utils/apiResponse.js";

export interface UserFilter {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  limit?: number;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<IUser | null>;
  findByEmailOrUsername(identifier: string): Promise<IUser | null>;
  findById(id: string): Promise<IUser | null>;
  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    status?: UserStatus;
    isVerified?: boolean;
  }): Promise<IUser>;
  existsByEmail(email: string): Promise<boolean>;
  findPaginated(filter: UserFilter): Promise<PaginatedResult<IUser>>;
  updateRole(userId: string, role: UserRole): Promise<IUser | null>;
  updateStatus(userId: string, status: UserStatus): Promise<IUser | null>;
  revokeSessions(userId: string): Promise<void>;
  existsByUsername(username: string, exceptUserId?: string): Promise<boolean>;
  /** `username: null` clears it. */
  updateProfile(userId: string, patch: { name?: string; username?: string | null }): Promise<IUser | null>;
  countByRole(role: UserRole): Promise<number>;
  requestPasswordReset(userId: string, tokenHash: string, now: Date, expiresAt: Date): Promise<boolean>;
  resetPassword(email: string, tokenHash: string, passwordHash: string, now: Date): Promise<boolean>;
  clearPasswordReset(userId: string, tokenHash: string): Promise<void>;
  setVerified(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  /** The stored hash and GitHub id, for working out how the account signs in; null when there is no such account. */
  findCredentials(userId: string): Promise<{ passwordHash: string | null; githubId: string | null } | null>;
  /**
   * Stores a first password, only while the account has none (no hash, or the GitHub-only placeholder). Checked in the
   * same write so two requests cannot both set one. Keeps the sessions; false when nothing was written.
   */
  setPasswordIfNone(userId: string, passwordHash: string): Promise<boolean>;
}
