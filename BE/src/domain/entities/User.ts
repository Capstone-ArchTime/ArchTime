export enum UserRole {
  DEVELOPER_ANALYST = "developer-analyst",
  PROJECT_MAINTAINER = "project-maintainer",
  SYSTEM_ADMINISTRATOR = "system-administrator",
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
