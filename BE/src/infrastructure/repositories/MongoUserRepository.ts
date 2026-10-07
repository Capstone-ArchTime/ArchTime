import { UserStatus, type IUser, type UserRole } from "../../domain/entities/User.js";
import type {
  IUserRepository,
  UserFilter,
} from "../../domain/interfaces/IUserRepository.js";
import type { PaginatedResult } from "../../shared/utils/apiResponse.js";
import { UserModel } from "../database/models/UserModel.js";

export class MongoUserRepository implements IUserRepository {
  private toEntity(doc: Record<string, unknown>): IUser {
    return {
      id: String(doc._id),
      name: doc.name as string,
      email: doc.email as string,
      passwordHash: (doc.passwordHash as string) ?? "",
      role: doc.role as UserRole,
      status: (doc.status as UserStatus) ?? UserStatus.ACTIVE,
      isVerified: (doc.isVerified as boolean) ?? false,
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

  async findByEmailOrUsername(identifier: string): Promise<IUser | null> {
    const doc = await UserModel.findOne({
      $or: [{ email: identifier }, { email: identifier.toLowerCase() }],
    }).select("+passwordHash").lean();
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
    status?: UserStatus;
    isVerified?: boolean;
  }): Promise<IUser> {
    const doc = await UserModel.create({
      ...data,
      status: data.status ?? UserStatus.ACTIVE,
      isVerified: data.isVerified ?? false,
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async existsByEmail(email: string): Promise<boolean> {
    return !!(await UserModel.exists({ email }));
  }

  async findPaginated(filter: UserFilter): Promise<PaginatedResult<IUser>> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 10));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (filter.role) {
      query.role = filter.role;
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.search && filter.search.trim()) {
      const escaped = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }

    const [docs, total] = await Promise.all([
      UserModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(query),
    ]);

    return {
      items: docs.map((doc) => this.toEntity(doc as Record<string, unknown>)),
      total,
    };
  }

  async updateRole(userId: string, role: UserRole): Promise<IUser | null> {
    const doc = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: { role },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    ).lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async updateStatus(userId: string, status: UserStatus): Promise<IUser | null> {
    const update: Record<string, unknown> = { $set: { status } };
    if (status === UserStatus.SUSPENDED) {
      update.$inc = { tokenVersion: 1 };
    }
    const doc = await UserModel.findByIdAndUpdate(userId, update, { new: true }).lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async revokeSessions(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  }

  async countByRole(role: UserRole): Promise<number> {
    return UserModel.countDocuments({ role, status: UserStatus.ACTIVE });
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
