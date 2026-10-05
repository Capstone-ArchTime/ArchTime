import mongoose, { type Document, type Model, Schema } from "mongoose";
import { ProjectStatus, RepoVisibility, type IProject } from "../../../domain/entities/Project.js";

export interface IProjectDocument extends Omit<IProject, "id">, Document {}

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
    token: { type: String }, // In MVP, stored directly. In prod, this should be encrypted.
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
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

export const ProjectModel: Model<IProjectDocument> = mongoose.model<IProjectDocument>(
  "Project",
  ProjectSchema,
);
