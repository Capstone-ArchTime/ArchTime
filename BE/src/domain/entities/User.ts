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
  role: UserRole;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
