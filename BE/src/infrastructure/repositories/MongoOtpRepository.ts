import type { IOtp } from "../../domain/entities/Otp.js";
import type { IOtpRepository } from "../../domain/interfaces/IOtpRepository.js";
import { OtpModel } from "../database/models/OtpModel.js";

export class MongoOtpRepository implements IOtpRepository {
  private toEntity(doc: Record<string, unknown>): IOtp {
    return {
      id: String(doc._id),
      email: doc.email as string,
      // A document from before hashing has no hash: an empty one can never match.
      codeHash: typeof doc.codeHash === "string" ? doc.codeHash : "",
      attempts: typeof doc.attempts === "number" ? doc.attempts : 0,
      expiresAt: doc.expiresAt as Date,
      createdAt: doc.createdAt as Date,
    };
  }

  async create(email: string, codeHash: string, expiresAt: Date): Promise<IOtp> {
    const doc = await OtpModel.create({ email, codeHash, attempts: 0, expiresAt });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findLatestByEmail(email: string): Promise<IOtp | null> {
    const doc = await OtpModel.findOne({ email })
      .sort({ createdAt: -1 })
      .lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async takeAttempt(id: string, maxAttempts: number): Promise<IOtp | null> {
    // One findOneAndUpdate: the filter and the increment are evaluated together by MongoDB, so two requests can never
    // both take the last guess. A document without a counter (older than this field) has made no guesses yet.
    const doc = await OtpModel.findOneAndUpdate(
      { _id: id, $or: [{ attempts: { $lt: maxAttempts } }, { attempts: { $exists: false } }] },
      { $inc: { attempts: 1 } },
      { new: true },
    ).lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async deleteByEmail(email: string): Promise<void> {
    await OtpModel.deleteMany({ email });
  }
}
