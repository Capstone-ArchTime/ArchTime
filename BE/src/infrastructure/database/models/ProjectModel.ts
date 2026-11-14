import mongoose, { type Document, type Model, Schema } from "mongoose";
import { ProjectStatus, RepoVisibility, type IProject } from "../../../domain/entities/Project.js";
import type { SealedSecret } from "../../llm/secrets.js";

export interface IProjectDocument extends Omit<IProject, "id">, Document {
  tokenSecret?: Omit<SealedSecret, "last4">;
}

const ProjectSchema = new Schema<IProjectDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    repoUrl: { type: String, required: true, trim: true },
    visibility: {
      type: String,
      enum: Object.values(RepoVisibility),
      required: true,
    },
    // Personal access token of a private repository, AES-256-GCM (see infrastructure/llm/secrets.ts). Never selected
    // unless asked for; only MongoProjectRepository.resolveToken reads it, to clone.
    tokenSecret: {
      type: new Schema({ ciphertext: String, iv: String, tag: String }, { _id: false }),
      select: false,
    },
    // Plain-text token saved before RF-17. Read only to encrypt it (MongoProjectRepository.encryptLegacyTokens).
    token: { type: String, select: false },
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.PENDING,
    },
    history: {
      type: new Schema(
        {
          totalCommits: { type: Number, default: 0 },
          firstCommitDate: { type: Date },
          lastCommitDate: { type: Date },
          monthly: [{ _id: false, month: String, commits: Number }],
          scannedAt: { type: Date },
        },
        { _id: false },
      ),
    },
    userId: { type: String, required: true, ref: "User" },
    organizationId: { type: String, ref: "Organization", index: true },
    credentialId: { type: String, ref: "OrganizationCredential", index: true },
    viewerAccess: {
      publicRead: { type: Boolean, default: true },
      allowChat: { type: Boolean, default: false },
      dailyLimit: { type: Number, default: 10, min: 1 },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.token;
        delete ret.tokenSecret;
      },
    },
  },
);

export const ProjectModel: Model<IProjectDocument> = mongoose.model<IProjectDocument>(
  "Project",
  ProjectSchema,
);
