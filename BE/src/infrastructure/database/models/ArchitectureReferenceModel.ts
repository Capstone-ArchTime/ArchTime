import mongoose, { type Model, Schema } from "mongoose";
import type { ReferenceComponent } from "../../../domain/architecture/quality.js";

/**
 * The architecture a project's people say it has: component names and the path prefixes of their files. Views are scored
 * against it (adjusted Rand index), which tells whether a drawing matches how the team sees the system.
 */
export interface IArchitectureReference {
  projectId: string;
  components: ReferenceComponent[];
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ArchitectureReferenceSchema = new Schema<IArchitectureReference>(
  {
    projectId: { type: String, required: true, unique: true, ref: "Project" },
    components: [{ _id: false, name: { type: String, required: true }, prefixes: { type: [String], default: [] } }],
    updatedBy: { type: String },
  },
  { timestamps: true },
);

export const ArchitectureReferenceModel: Model<IArchitectureReference> = mongoose.model<IArchitectureReference>(
  "ArchitectureReference",
  ArchitectureReferenceSchema,
);
