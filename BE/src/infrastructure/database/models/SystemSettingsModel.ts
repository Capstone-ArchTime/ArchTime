import mongoose, { type Document, type Model, Schema } from "mongoose";
import type { ISystemSettings, IApiKey } from "../../../domain/entities/SystemSettings.js";

export interface ISystemSettingsDocument extends Omit<ISystemSettings, "id">, Document {}

const ApiKeySchema = new Schema<IApiKey>(
  {
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true },
    keyHash: { type: String, required: true, select: false },
    createdBy: { type: String, required: true },
    lastUsedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const SystemSettingsSchema = new Schema<ISystemSettingsDocument>(
  {
    maxConcurrentJobs: { type: Number, default: 5 },
    maxRepoSizeMb: { type: Number, default: 500 },
    miningTimeoutMinutes: { type: Number, default: 60 },
    defaultLlmProvider: {
      type: String,
      enum: ["gemini", "claude", "openai", "none"],
      default: "none",
    },
    maintenanceMode: { type: Boolean, default: false },
    allowPublicRegistration: { type: Boolean, default: true },
    apiKeys: [ApiKeySchema],
    defaultModelId: { type: String, ref: "LlmModel", default: null },
    allowUserModelChoice: { type: Boolean, default: true },
    scoring: {
      preset: { type: String, enum: ["balanced", "quality", "budget", "custom"], default: "balanced" },
      weights: { type: Schema.Types.Mixed },
      windowDays: { type: Number, default: 30, min: 1, max: 365 },
    },
    updatedBy: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        if (Array.isArray(ret.apiKeys)) {
          ret.apiKeys = ret.apiKeys.map((k: any) => {
            const { keyHash, ...safeKey } = k;
            return {
              ...safeKey,
              id: k._id ? k._id.toString() : k.id,
            };
          });
        }
      },
    },
  },
);

export const SystemSettingsModel: Model<ISystemSettingsDocument> = mongoose.model<ISystemSettingsDocument>(
  "SystemSettings",
  SystemSettingsSchema,
);
