import mongoose, { type Model, Schema } from "mongoose";
import type { RunStatus } from "../../../domain/architecture/llm/metrics.js";
import type { UsageTotals } from "../../../domain/architecture/llm/types.js";

/** One request to draw (refine) an architecture with a model: what it cost, how long it took and how good the answer was. */
export interface ILlmRun {
  projectId: string;
  snapshotId?: string;
  userId: string;
  jobId?: string;
  /** Registry id; null for the model configured through environment variables. Provider and model are copied so history survives the model being removed. */
  modelId?: string | null;
  modelKey: string;
  provider: string;
  model: string;
  purpose: "user" | "benchmark";
  /** Groups runs started together by one benchmark. */
  benchmarkId?: string;
  mode: "refine" | "name-only";
  filesSent: number;
  status: RunStatus;
  errorKind?: string;
  fallbackReason?: string;
  attempts: { n: number; ok: boolean; issueCodes: string[]; inputTokens: number; outputTokens: number; latencyMs: number; errorKind?: string }[];
  usage: UsageTotals;
  latencyMs: number;
  wallMs: number;
  cost: { amount: number; currency: string; pricing?: { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok?: number } };
  quality: {
    score: number; pass: number; V: number; M: number; R: number; E: number; B: number;
    errors: number; warnings: number; modularity: number; baselineModularity: number; movedRatio?: number; attemptsUsed: number; components: number;
  };
  feedback?: { rating: 0 | 1; at: Date };
  createdAt: Date;
}

const LlmRunSchema = new Schema<ILlmRun>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    snapshotId: { type: String, ref: "Snapshot" },
    userId: { type: String, required: true, ref: "User" },
    jobId: { type: String, ref: "MiningJob" },
    modelId: { type: String, ref: "LlmModel", default: null },
    modelKey: { type: String, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    purpose: { type: String, enum: ["user", "benchmark"], default: "user" },
    benchmarkId: { type: String },
    mode: { type: String, enum: ["refine", "name-only"], required: true },
    filesSent: { type: Number, default: 0 },
    status: { type: String, enum: ["accepted", "fallback", "failed", "cancelled"], required: true },
    errorKind: { type: String },
    fallbackReason: { type: String },
    attempts: { type: Schema.Types.Mixed, default: [] },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheReadTokens: { type: Number, default: 0 },
      reasoningTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      estimated: { type: Boolean, default: false },
    },
    latencyMs: { type: Number, default: 0 },
    wallMs: { type: Number, default: 0 },
    cost: { type: Schema.Types.Mixed, default: { amount: 0, currency: "USD" } },
    quality: { type: Schema.Types.Mixed, default: {} },
    feedback: { rating: { type: Number, enum: [0, 1] }, at: { type: Date } },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

LlmRunSchema.index({ userId: 1, createdAt: -1 });
LlmRunSchema.index({ modelId: 1, mode: 1, createdAt: -1 });
LlmRunSchema.index({ projectId: 1, createdAt: -1 });
LlmRunSchema.index({ benchmarkId: 1 });

export const LlmRunModel: Model<ILlmRun> = mongoose.model<ILlmRun>("LlmRun", LlmRunSchema);
