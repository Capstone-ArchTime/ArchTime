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
  setVerified(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}
