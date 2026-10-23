import mongoose from "mongoose";
import type { CredentialProvider, IOrganizationCredential } from "../../domain/entities/Organization.js";
import type { IOrganizationCredentialRepository } from "../../domain/interfaces/IOrganizationRepository.js";
import { OrganizationCredentialModel } from "../database/models/OrganizationCredentialModel.js";
import { seal, unseal } from "../llm/secrets.js";

const validId = (id: string) => mongoose.isValidObjectId(id);

/** Organization repository tokens, encrypted at rest with the same key as model API keys (LLM_SECRET_KEY / JWT_SECRET). */
export class MongoOrganizationCredentialRepository implements IOrganizationCredentialRepository {
  private toEntity(doc: Record<string, unknown>): IOrganizationCredential {
    return {
      id: String(doc._id),
      organizationId: String(doc.organizationId),
      name: doc.name as string,
      provider: doc.provider as CredentialProvider,
      last4: (doc.last4 as string) ?? "",
      createdBy: String(doc.createdBy),
      rotatedAt: doc.rotatedAt as Date | undefined,
      lastUsedAt: doc.lastUsedAt as Date | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async create(data: { organizationId: string; name: string; provider: CredentialProvider; secret: string; createdBy: string }): Promise<IOrganizationCredential> {
    const { last4, ...secret } = seal(data.secret);
    const doc = await OrganizationCredentialModel.create({
      organizationId: data.organizationId, name: data.name, provider: data.provider, createdBy: data.createdBy, secret, last4,
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(organizationId: string, credentialId: string): Promise<IOrganizationCredential | null> {
    if (!validId(credentialId)) return null;
    const doc = await OrganizationCredentialModel.findOne({ _id: credentialId, organizationId }).lean();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async list(organizationId: string): Promise<IOrganizationCredential[]> {
    const docs = await OrganizationCredentialModel.find({ organizationId }).sort({ name: 1 }).lean();
    return docs.map(doc => this.toEntity(doc as Record<string, unknown>));
  }

  async rotate(organizationId: string, credentialId: string, plain: string): Promise<IOrganizationCredential | null> {
    if (!validId(credentialId)) return null;
    const { last4, ...secret } = seal(plain);
    const doc = await OrganizationCredentialModel.findOneAndUpdate(
      { _id: credentialId, organizationId },
      { $set: { secret, last4, rotatedAt: new Date() } },
      { new: true },
    ).lean();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async delete(organizationId: string, credentialId: string): Promise<boolean> {
    if (!validId(credentialId)) return false;
    const result = await OrganizationCredentialModel.deleteOne({ _id: credentialId, organizationId });
    return result.deletedCount > 0;
  }

  async resolveSecret(credentialId: string): Promise<string | null> {
    if (!validId(credentialId)) return null;
    const doc = await OrganizationCredentialModel.findByIdAndUpdate(credentialId, { $set: { lastUsedAt: new Date() } })
      .select("+secret").lean();
    if (!doc?.secret?.ciphertext) return null;
    return unseal(doc.secret);
  }
}
