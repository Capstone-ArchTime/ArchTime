import mongoose, { type Document, type Model, Schema } from "mongoose";
import { DECISION_ORIGINS, DECISION_SOURCE_KINDS, type IWorkspace } from "../../../domain/entities/Workspace.js";

export interface IWorkspaceDocument
  extends Omit<IWorkspace, "id">,
    Document {}

const ComponentSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, default: "Service" },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const DependencySchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    label: { type: String, default: "" },
  },
  { _id: false },
);

const DiagramSchema = new Schema(
  {
    components: { type: [ComponentSchema], default: [] },
    dependencies: { type: [DependencySchema], default: [] },
    revision: { type: Number, default: 1 },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: String, default: null },
  },
  { _id: false },
);

const RuleSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    constraint: {
      type: String,
      enum: ["forbidden", "required"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["error", "warning"],
      default: "error",
    },
    rationale: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const DecisionSchema = new Schema(
  {
    id: { type: String, required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ["Proposed", "Accepted", "Deprecated"],
      default: "Proposed",
    },
    context: { type: String, default: "" },
    decision: { type: String, default: "" },
    alternatives: { type: String, default: "" },
    consequences: { type: String, default: "" },
    componentIds: { type: [String], default: [] },
    origin: { type: String, enum: DECISION_ORIGINS, default: "recorded" },
    sources: {
      type: [new Schema({
        kind: { type: String, enum: DECISION_SOURCE_KINDS, required: true },
        ref: { type: String, required: true },
        title: { type: String, default: "" },
        date: { type: Date },
        note: { type: String },
      }, { _id: false })],
      default: [],
    },
    statusHistory: {
      type: [new Schema({
        status: { type: String, enum: ["Proposed", "Accepted", "Deprecated"], required: true },
        at: { type: Date, required: true },
        by: { type: String },
      }, { _id: false })],
      default: [],
    },
    createdBy: { type: String },
    updatedBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const WorkspaceSchema = new Schema<IWorkspaceDocument>(
  {
    projectId: {
      type: String,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    revision: {
      type: Number,
      required: true,
      default: 1,
    },
    diagram: {
      type: DiagramSchema,
      required: true,
    },
    rules: {
      type: [RuleSchema],
      default: [],
    },
    decisions: {
      type: [DecisionSchema],
      default: [],
    },
    updatedBy: {
      type: String,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

export const WorkspaceModel: Model<IWorkspaceDocument> =
  mongoose.model<IWorkspaceDocument>("Workspace", WorkspaceSchema);
