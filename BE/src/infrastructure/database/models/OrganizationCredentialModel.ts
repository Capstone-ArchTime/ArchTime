import mongoose, { type Document, type Model, Schema } from "mongoose";
import { CredentialProvider, type IOrganizationCredential } from "../../../domain/entities/Organization.js";
import type { SealedSecret } from "../../llm/secrets.js";

export interface IOrganizationCredentialDocument extends Omit<IOrganizationCredential, "id">, Document {
  secret: Omit<SealedSecret, "last4">;
}

const OrganizationCredentialSchema = new Schema<IOrganizationCredentialDocument>(
  {
    organizationId: { type: String, required: true, ref: "Organization", index: true },
    name: { type: String, required: true, trim: true },
    provider: { type: String, enum: Object.values(CredentialProvider), default: CredentialProvider.GITHUB },
    // AES-256-GCM, see infrastructure/llm/secrets.ts. Never selected unless asked for.
    secret: {
      type: new Schema({ ciphertext: String, iv: String, tag: String }, { _id: false }),
      required: true,
      select: false,
    },
    last4: { type: String, default: "" },
    createdBy: { type: String, required: true, ref: "User" },
    rotatedAt: { type: Date },
    lastUsedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.secret;
      },
    },
  },
);

OrganizationCredentialSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const OrganizationCredentialModel: Model<IOrganizationCredentialDocument> = mongoose.model<IOrganizationCredentialDocument>(
  "OrganizationCredential",
  OrganizationCredentialSchema,
);
