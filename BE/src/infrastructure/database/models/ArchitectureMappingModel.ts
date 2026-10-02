import mongoose, { type Document, type Model, Schema } from "mongoose";
import type { MappingComponent } from "../../../domain/architecture/buildView.js";

export interface IArchitectureMapping {
  projectId: string;
  snapshotId: string;
  generator: "cluster-only" | "cluster+llm" | "manual";
  algorithmVersion: string;
  /** Hash of the snapshot graph the mapping was computed from. */
  graphHash: string;
  options: { minComponents: number; maxComponents: number };
  components: MappingComponent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IArchitectureMappingDocument extends IArchitectureMapping, Document {}

const ArchitectureMappingSchema = new Schema<IArchitectureMappingDocument>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    snapshotId: { type: String, required: true, ref: "Snapshot" },
    generator: { type: String, enum: ["cluster-only", "cluster+llm", "manual"], required: true },
    algorithmVersion: { type: String, required: true },
    graphHash: { type: String, required: true },
    options: { minComponents: Number, maxComponents: Number },
    components: [
      {
        _id: false,
        id: { type: String, required: true },
        name: { type: String, required: true },
        role: { type: String, required: true },
        label: { type: String, required: true },
        description: { type: String, default: "" },
        layer: { type: Number },
        memberIds: { type: [String], default: [] },
      },
    ],
  },
  { timestamps: true },
);

ArchitectureMappingSchema.index({ projectId: 1, snapshotId: 1 }, { unique: true });

export const ArchitectureMappingModel: Model<IArchitectureMappingDocument> = mongoose.model<IArchitectureMappingDocument>(
  "ArchitectureMapping",
  ArchitectureMappingSchema,
);
