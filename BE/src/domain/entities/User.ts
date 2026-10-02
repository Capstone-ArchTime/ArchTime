export enum UserRole {
  DEVELOPER_ANALYST = "developer-analyst",
  PROJECT_MAINTAINER = "project-maintainer",
  SYSTEM_ADMINISTRATOR = "system-administrator",
}

export interface IUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  githubId?: string;
  role: UserRole;
  isVerified: boolean;
  tokenVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}
