import mongoose, { Schema } from "mongoose";
import { FINDING_DECISIONS } from "../../../domain/entities/ConformanceFinding.js";

// Findings of the conformance check and the record of each check (domain/entities/ConformanceFinding.ts).

const ImportSchema = new Schema({ from: { type: String, required: true }, to: { type: String, required: true } }, { _id: false });

const DecisionSchema = new Schema(
  {
    kind: { type: String, enum: FINDING_DECISIONS, required: true },
    note: { type: String, default: "" },
    by: { type: String, required: true },
    at: { type: Date, required: true },
    inheritedFrom: { type: String, default: null },
  },
  { _id: false },
);

const ExplanationSchema = new Schema({ text: { type: String, required: true }, model: { type: String, default: "" }, at: { type: Date, required: true } }, { _id: false });

const ConformanceFindingSchema = new Schema(
  {
    projectId: { type: String, required: true },
    snapshotId: { type: String, required: true },
    snapshotHash: { type: String, required: true },
    commitDate: { type: Date, required: true },
    key: { type: String, required: true },
    type: { type: String, enum: ["forbidden-dependency", "missing-required-dependency", "undeclared-dependency"], required: true },
    ruleId: { type: String, default: null },
    ruleName: { type: String, default: null },
    severity: { type: String, enum: ["error", "warning"], required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceName: { type: String, default: "" },
    targetName: { type: String, default: "" },
    imports: { type: [ImportSchema], default: [] },
    importCount: { type: Number, default: 0 },
    files: { type: [String], default: [] },
    decision: { type: DecisionSchema, default: null },
    explanation: { type: ExplanationSchema, default: null },
    notifiedAt: { type: Date, default: null },
    outdated: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "conformance_findings" },
);
// One finding per (snapshot, key): a re-check updates it in place.
ConformanceFindingSchema.index({ projectId: 1, snapshotId: 1, key: 1 }, { unique: true });
ConformanceFindingSchema.index({ projectId: 1, commitDate: -1 });
ConformanceFindingSchema.index({ projectId: 1, key: 1, commitDate: -1 });
ConformanceFindingSchema.index({ projectId: 1, notifiedAt: 1 });

export const ConformanceFindingModel = mongoose.models.ConformanceFinding || mongoose.model("ConformanceFinding", ConformanceFindingSchema);

const ConformanceCheckSchema = new Schema(
  {
    projectId: { type: String, required: true },
    snapshotId: { type: String, required: true },
    snapshotHash: { type: String, required: true },
    commitDate: { type: Date, required: true },
    fingerprint: { type: String, required: true },
    checkedAt: { type: Date, required: true },
    counts: {
      findings: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
      unmappedFiles: { type: Number, default: 0 },
      files: { type: Number, default: 0 },
    },
    unresolvedRules: { type: [String], default: [] },
  },
  { collection: "conformance_checks" },
);
ConformanceCheckSchema.index({ projectId: 1, snapshotId: 1 }, { unique: true });
ConformanceCheckSchema.index({ projectId: 1, commitDate: -1 });

/** When each person last looked at a project's findings: what came after is unread for them (MSG26). */
const ConformanceSeenSchema = new Schema(
  { projectId: { type: String, required: true }, userId: { type: String, required: true }, seenAt: { type: Date, required: true } },
  { collection: "conformance_seen" },
);
ConformanceSeenSchema.index({ userId: 1, projectId: 1 }, { unique: true });
export const ConformanceSeenModel = mongoose.models.ConformanceSeen || mongoose.model("ConformanceSeen", ConformanceSeenSchema);

export const ConformanceCheckModel = mongoose.models.ConformanceCheck || mongoose.model("ConformanceCheck", ConformanceCheckSchema);
