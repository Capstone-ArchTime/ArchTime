import mongoose, { type Document, type Model, Schema } from "mongoose";

export enum JobStatus {
  QUEUED = "queued",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface IMiningJob {
  id: string;
  projectId: string;
  requestedBy: string;
  status: JobStatus;
  stage: string;
  progress: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMiningJobDocument extends Omit<IMiningJob, "id">, Document {}

const MiningJobSchema = new Schema<IMiningJobDocument>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    requestedBy: { type: String, required: true, ref: "User" },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.QUEUED,
    },
    stage: { type: String, default: "Waiting for worker" },
    progress: { type: Number, default: 0 },
    error: { type: String },
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

export const MiningJobModel: Model<IMiningJobDocument> = mongoose.model<IMiningJobDocument>(
  "MiningJob",
  MiningJobSchema,
);
