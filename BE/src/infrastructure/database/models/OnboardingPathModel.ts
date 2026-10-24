import mongoose, { type Model, Schema } from "mongoose";
import { ONBOARDING_PATH_STATUSES, ONBOARDING_STEP_KINDS, type IOnboardingPath } from "../../../domain/entities/OnboardingPath.js";

export type IOnboardingPathDocument = Omit<IOnboardingPath, "id">;

const RevisionSchema = new Schema(
  {
    commit: { type: String, default: null },
    snapshotId: { type: String, default: null },
    workspaceRevision: { type: Number, default: null },
    pinnedAt: { type: Date, required: true },
  },
  { _id: false },
);

const QuestionSchema = new Schema(
  {
    prompt: { type: String, required: true },
    options: { type: [String], required: true },
    correctIndex: { type: Number, required: true },
    explanation: { type: String, default: "" },
  },
  { _id: false },
);

const StepSchema = new Schema(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: ONBOARDING_STEP_KINDS, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    componentId: { type: String },
    adrId: { type: String },
    commitTitle: { type: String },
    question: { type: QuestionSchema, default: undefined },
    revision: { type: RevisionSchema, required: true },
  },
  { _id: false },
);

const OnboardingPathSchema = new Schema<IOnboardingPathDocument>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ONBOARDING_PATH_STATUSES, default: "draft" },
    steps: { type: [StepSchema], default: [] },
    revision: { type: Number, default: 1 },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true },
);

// "The paths of this workspace, latest edit first" is the list the mentors' page asks for.
OnboardingPathSchema.index({ projectId: 1, updatedAt: -1 });

export const OnboardingPathModel: Model<IOnboardingPathDocument> = mongoose.model<IOnboardingPathDocument>(
  "OnboardingPath",
  OnboardingPathSchema,
);
