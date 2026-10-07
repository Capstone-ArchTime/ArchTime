import mongoose, { type Model, Schema } from "mongoose";

export type LlmProvider = "anthropic" | "gemini" | "openai-compatible";
export const LLM_PROVIDERS: readonly LlmProvider[] = ["anthropic", "gemini", "openai-compatible"];
/** Projection that also loads the encrypted API key; only the registry needs it. */
export const WITH_SECRET = "+apiKey.ciphertext +apiKey.iv +apiKey.tag";
export type LlmHealthStatus = "unknown" | "up" | "degraded" | "down";

/** A model an administrator made available for drawing architectures. */
export interface ILlmModel {
  key: string;
  displayName: string;
  provider: LlmProvider;
  /** Model id sent to the provider's API. */
  model: string;
  baseUrl?: string;
  /** Encrypted with LLM_SECRET_KEY (see infrastructure/llm/secrets.ts); never returned by the API. */
  apiKey?: { ciphertext: string; iv: string; tag: string; last4: string } | null;
  /** maxRequestTokens: largest request the provider accepts (e.g. a free tier's tokens per minute); see RefineOptions. */
  options: { effort?: "low" | "medium" | "high"; maxTokens?: number; temperature?: number | null; jsonMode?: boolean; timeoutMs?: number; maxRequestTokens?: number };
  /** USD per million tokens. */
  pricing: { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok?: number; currency: string };
  enabled: boolean;
  visibleToUsers: boolean;
  isDefault: boolean;
  health: { status: LlmHealthStatus; checkedAt?: Date; latencyMs?: number; lastError?: string };
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LlmModelSchema = new Schema<ILlmModel>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    provider: { type: String, enum: LLM_PROVIDERS, required: true },
    model: { type: String, required: true, trim: true },
    baseUrl: { type: String, trim: true },
    // The sealed parts are never loaded unless asked for (registry.ts); last4 is what the admin pages show.
    apiKey: {
      type: new Schema({
        ciphertext: { type: String, select: false },
        iv: { type: String, select: false },
        tag: { type: String, select: false },
        last4: { type: String },
      }, { _id: false }),
      default: null,
    },
    options: {
      effort: { type: String, enum: ["low", "medium", "high"] },
      maxTokens: { type: Number },
      temperature: { type: Number },
      jsonMode: { type: Boolean },
      timeoutMs: { type: Number },
      maxRequestTokens: { type: Number },
    },
    pricing: {
      inputPerMTok: { type: Number, default: 0, min: 0 },
      outputPerMTok: { type: Number, default: 0, min: 0 },
      cacheReadPerMTok: { type: Number, min: 0 },
      currency: { type: String, default: "USD" },
    },
    enabled: { type: Boolean, default: true },
    visibleToUsers: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    health: {
      status: { type: String, enum: ["unknown", "up", "degraded", "down"], default: "unknown" },
      checkedAt: { type: Date },
      latencyMs: { type: Number },
      lastError: { type: String },
    },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        ret.hasApiKey = Boolean(ret.apiKey?.last4 || ret.apiKey?.ciphertext);
        ret.apiKeyLast4 = ret.apiKey?.last4 ?? null;
        delete ret.apiKey;
      },
    },
  },
);

export const LlmModelModel: Model<ILlmModel> = mongoose.model<ILlmModel>("LlmModel", LlmModelSchema);
