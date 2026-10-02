import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface ISnapshot {
  id: string;
  projectId: string;
  hash: string;
  fullHash?: string;
  version: string;
  title: string;
  author: string;
  date: Date;
  branches: string[];
  files: number;
  archChanges: number;
  depAdded: number;
  depRemoved: number;
  nodes: { id: string; name: string; type: string }[];
  edges: { source: string; target: string; type: string }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ISnapshotDocument extends Omit<ISnapshot, "id">, Document {}

const SnapshotSchema = new Schema<ISnapshotDocument>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    hash: { type: String, required: true },
    fullHash: { type: String },
    version: { type: String },
    title: { type: String, required: true },
    author: { type: String, required: true },
    date: { type: Date, required: true },
    branches: { type: [String], default: [] },
    files: { type: Number, default: 0 },
    archChanges: { type: Number, default: 0 },
    depAdded: { type: Number, default: 0 },
    depRemoved: { type: Number, default: 0 },
    nodes: [
      {
        id: { type: String },
        name: { type: String },
        type: { type: String },
      },
    ],
    edges: [
      {
        source: { type: String },
        target: { type: String },
        type: { type: String },
      },
    ],
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

SnapshotSchema.index({ projectId: 1, date: 1 });
SnapshotSchema.index({ projectId: 1, hash: 1 });

export const SnapshotModel: Model<ISnapshotDocument> = mongoose.model<ISnapshotDocument>(
  "Snapshot",
  SnapshotSchema,
);
