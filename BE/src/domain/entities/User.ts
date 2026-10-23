/**
 * System-level roles. Everything else a user may do comes from their organization and project roles.
 * USER keeps the stored value "developer-analyst" so existing accounts and clients keep working.
 */
export enum UserRole {
  USER = "developer-analyst",
  SYSTEM_ADMINISTRATOR = "system-administrator",
}

/** "project-maintainer" used to be a system role; maintainers are now a per-project role. */
export const LEGACY_USER_ROLES: readonly string[] = ["project-maintainer"];

export function normalizeUserRole(value: unknown): UserRole {
  return value === UserRole.SYSTEM_ADMINISTRATOR ? UserRole.SYSTEM_ADMINISTRATOR : UserRole.USER;
}

export enum UserStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
}

export interface IUser {
  id: string;
  name: string;
  username?: string;
  email: string;
  passwordHash: string;
  githubId?: string;
  role: UserRole;
  status: UserStatus;
  isVerified: boolean;
  tokenVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}
