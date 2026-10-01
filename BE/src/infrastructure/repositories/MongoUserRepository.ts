import type { IUser, UserRole } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import { UserModel } from "../database/models/UserModel.js";

export class MongoUserRepository implements IUserRepository {
  private toEntity(doc: Record<string, unknown>): IUser {
    return {
      id: String(doc._id),
      name: doc.name as string,
      email: doc.email as string,
      passwordHash: (doc.passwordHash as string) ?? "",
      role: doc.role as UserRole,
      isVerified: doc.isVerified as boolean,
      githubId: doc.githubId as string | undefined,
      avatarUrl: doc.avatarUrl as string | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async findByEmail(email: string): Promise<IUser | null> {
    const doc = await UserModel.findOne({ email }).select("+passwordHash").lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async findById(id: string): Promise<IUser | null> {
    const doc = await UserModel.findById(id).select("+passwordHash").lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async findByGithubId(githubId: string): Promise<IUser | null> {
    const doc = await UserModel.findOne({ githubId }).select("+passwordHash").lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<IUser> {
    const doc = await UserModel.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async createOAuthUser(data: {
    name: string;
    email: string;
    role: UserRole;
    githubId: string;
    avatarUrl?: string;
  }): Promise<IUser> {
    const doc = await UserModel.create({
      ...data,
      isVerified: true, // OAuth users are pre-verified by the provider
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async existsByEmail(email: string): Promise<boolean> {
    return !!(await UserModel.exists({ email }));
  }

  async setVerified(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { isVerified: true });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { passwordHash });
  }

  async linkGithub(userId: string, githubId: string, avatarUrl?: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, {
      githubId,
      ...(avatarUrl && { avatarUrl }),
    });
  }
}

