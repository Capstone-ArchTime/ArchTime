import type { IOtp } from "../../domain/entities/Otp.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import { OtpModel } from "../database/models/OtpModel.js";

export class MongoOtpRepository implements IOtpRepository {
  private toEntity(doc: Record<string, unknown>): IOtp {
    return {
      id: String(doc._id),
      email: doc.email as string,
      code: doc.code as string,
      expiresAt: doc.expiresAt as Date,
      createdAt: doc.createdAt as Date,
    };
  }

  async create(email: string, code: string, expiresAt: Date): Promise<IOtp> {
    const doc = await OtpModel.create({ email, code, expiresAt });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findLatestByEmail(email: string): Promise<IOtp | null> {
    const doc = await OtpModel.findOne({ email })
      .sort({ createdAt: -1 })
      .lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async deleteByEmail(email: string): Promise<void> {
    await OtpModel.deleteMany({ email });
  }
}
