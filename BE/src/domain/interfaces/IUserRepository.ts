import type { IUser, UserRole } from "../entities/User.js";

export interface IUserRepository {
  findByEmail(email: string): Promise<IUser | null>;
  findById(id: string): Promise<IUser | null>;
  findByGithubId(githubId: string): Promise<IUser | null>;
  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<IUser>;
  createOAuthUser(data: {
    name: string;
    email: string;
    role: UserRole;
    githubId: string;
    avatarUrl?: string;
  }): Promise<IUser>;
  existsByEmail(email: string): Promise<boolean>;
  setVerified(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  linkGithub(userId: string, githubId: string, avatarUrl?: string): Promise<void>;
}

