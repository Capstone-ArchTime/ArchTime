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
      tokenVersion: (doc.tokenVersion as number) ?? 0,
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
    const doc = await UserModel.findById(id).lean();
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

  async existsByEmail(email: string): Promise<boolean> {
    return !!(await UserModel.exists({ email }));
  }

  async requestPasswordReset(userId: string, tokenHash: string, now: Date, expiresAt: Date): Promise<boolean> {
    const result = await UserModel.updateOne({ _id: userId, isVerified: true,
      $or: [{ resetRequestedAt: { $exists: false } }, { resetRequestedAt: { $lte: new Date(now.getTime() - 60_000) } }],
    }, { $set: { resetTokenHash: tokenHash, resetExpiresAt: expiresAt, resetRequestedAt: now } });
    return result.modifiedCount === 1;
  }
  async resetPassword(email: string, tokenHash: string, passwordHash: string, now: Date): Promise<boolean> {
    const result = await UserModel.updateOne({ email, isVerified: true, resetTokenHash: tokenHash, resetExpiresAt: { $gt: now } }, {
      $set: { passwordHash }, $inc: { tokenVersion: 1 }, $unset: { resetTokenHash: 1, resetExpiresAt: 1 },
    });
    return result.modifiedCount === 1;
  }
  async clearPasswordReset(userId: string, tokenHash: string): Promise<void> {
    await UserModel.updateOne({ _id: userId, resetTokenHash: tokenHash }, { $unset: { resetTokenHash: 1, resetExpiresAt: 1, resetRequestedAt: 1 } });
  }
  async setVerified(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { isVerified: true });
  }
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await UserModel.updateOne({ _id: userId }, {
      $set: { passwordHash },
      $inc: { tokenVersion: 1 },
      $unset: { resetTokenHash: 1, resetExpiresAt: 1 },
    });
  }
}
