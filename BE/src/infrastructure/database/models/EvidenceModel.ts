import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface IEvidence {
  id: string;
  projectId: string;
  changeTitle: string;
  type: string; // 'MODULE EXTRACTION', 'DEPENDENCY CHANGE', 'MODULE SPLIT'
  repository: string;
  commit: string;
  files: number;
  date: Date;
  summary: string;
  depsAdded: number;
  depsRemoved: number;
  sourceFiles: string[];
  diffBefore: string;
  diffAfter: string;
}

export interface IEvidenceDocument extends Omit<IEvidence, "id">, Document {}

const EvidenceSchema = new Schema<IEvidenceDocument>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    changeTitle: { type: String, required: true },
    type: { type: String, required: true },
    repository: { type: String, required: true },
    commit: { type: String, required: true },
    files: { type: Number, default: 0 },
    date: { type: Date, required: true },
    summary: { type: String, required: true },
    depsAdded: { type: Number, default: 0 },
    depsRemoved: { type: Number, default: 0 },
    sourceFiles: { type: [String], default: [] },
    diffBefore: { type: String, default: "" },
    diffAfter: { type: String, default: "" },
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

export const EvidenceModel: Model<IEvidenceDocument> = mongoose.model<IEvidenceDocument>(
  "Evidence",
  EvidenceSchema,
);
