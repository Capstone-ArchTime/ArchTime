import mongoose, { type Model, Schema } from "mongoose";
import type { IOnboardingAssignment } from "../../../domain/entities/OnboardingPath.js";

export type IOnboardingAssignmentDocument = Omit<IOnboardingAssignment, "id">;

const OnboardingAssignmentSchema = new Schema<IOnboardingAssignmentDocument>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    pathId: { type: String, required: true, ref: "OnboardingPath" },
    userId: { type: String, required: true, ref: "User" },
    assignedBy: { type: String, required: true },
    assignedAt: { type: Date, default: Date.now },
    // Progress by step id. One key per step, so recording an answer is a single atomic write that cannot add a step twice.
    progress: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);

// A path is given to a person once.
OnboardingAssignmentSchema.index({ pathId: 1, userId: 1 }, { unique: true });
// "What I was given", across projects, is the learner's list.
OnboardingAssignmentSchema.index({ userId: 1, updatedAt: -1 });

export const OnboardingAssignmentModel: Model<IOnboardingAssignmentDocument> = mongoose.model<IOnboardingAssignmentDocument>(
  "OnboardingAssignment",
  OnboardingAssignmentSchema,
);
