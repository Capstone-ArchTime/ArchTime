import mongoose, { type Document, type Model, Schema } from "mongoose";

export enum JobStatus {
  QUEUED = "queued",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum JobKind {
  SCAN = "scan",
  MINE = "mine",
}

export interface IMiningJob {
  id: string;
  projectId: string;
  requestedBy: string;
  status: JobStatus;
  stage: string;
  progress: number;
  error?: string;
  kind: JobKind;
  mode?: "range" | "remaining";
  rangeSince?: Date;
  rangeUntil?: Date;
  force?: boolean;
  total: number; // commits this job will analyze
  processed: number;
  failedCommits: number;
  batchSize: number;
  batchIndex: number;
  batchCount: number;
  startedAt?: Date;
  finishedAt?: Date;
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
    kind: { type: String, enum: Object.values(JobKind), default: JobKind.MINE },
    mode: { type: String, enum: ["range", "remaining"] },
    rangeSince: { type: Date },
    rangeUntil: { type: Date },
    force: { type: Boolean, default: false },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    failedCommits: { type: Number, default: 0 },
    batchSize: { type: Number, default: 50 },
    batchIndex: { type: Number, default: 0 },
    batchCount: { type: Number, default: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
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
