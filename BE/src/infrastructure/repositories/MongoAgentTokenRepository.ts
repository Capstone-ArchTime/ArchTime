import mongoose, { Schema } from "mongoose";
import type { IAgentToken } from "../../domain/entities/AgentToken.js";
import type { IAgentTokenRepository } from "../../domain/interfaces/IAgentTokenRepository.js";

const AgentTokenSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { collection: "agent_tokens" },
);

export const AgentTokenModel = mongoose.models.AgentToken || mongoose.model("AgentToken", AgentTokenSchema);

const toToken = (doc: any): IAgentToken => {
  const { _id, __v, ...rest } = doc;
  return { ...rest, id: String(_id), revokedAt: doc.revokedAt ?? null, revokedBy: doc.revokedBy ?? null, lastUsedAt: doc.lastUsedAt ?? null };
};

export class MongoAgentTokenRepository implements IAgentTokenRepository {
  async create(token: Omit<IAgentToken, "id">): Promise<IAgentToken> {
    const doc = await AgentTokenModel.create(token);
    return toToken(doc.toObject());
  }

  async listByProject(projectId: string): Promise<IAgentToken[]> {
    return (await AgentTokenModel.find({ projectId }).sort({ createdAt: -1 }).lean()).map(toToken);
  }

  async findByHash(tokenHash: string): Promise<IAgentToken | null> {
    const doc = await AgentTokenModel.findOne({ tokenHash }).lean();
    return doc ? toToken(doc) : null;
  }

  async revoke(projectId: string, tokenId: string, by: string, at: Date): Promise<IAgentToken | null> {
    if (!mongoose.Types.ObjectId.isValid(tokenId)) return null;
    const doc = await AgentTokenModel.findOneAndUpdate({ _id: tokenId, projectId, revokedAt: null }, { $set: { revokedAt: at, revokedBy: by } }, { new: true }).lean();
    return doc ? toToken(doc) : null;
  }

  async touch(tokenId: string, at: Date): Promise<void> {
    await AgentTokenModel.updateOne({ _id: tokenId }, { $set: { lastUsedAt: at } });
  }

  async countActive(projectId: string, now: Date): Promise<number> {
    return AgentTokenModel.countDocuments({ projectId, revokedAt: null, expiresAt: { $gt: now } });
  }
}
