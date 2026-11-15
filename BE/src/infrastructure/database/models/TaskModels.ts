import mongoose, { Schema } from "mongoose";

// Project tasks, sprints and task–commit links (F-13). Unique indexes are what make a re-import update instead of
// duplicate, and a re-link a no-op.

const TaskSchema = new Schema(
  {
    projectId: { type: String, required: true },
    key: { type: String, required: true },
    summary: { type: String, default: "" },
    status: { type: String, default: null },
    statusCategory: { type: String, enum: ["todo", "in-progress", "done"], default: "todo" },
    assignee: { type: String, default: null },
    storyPoints: { type: Number, default: null },
    sprintId: { type: String, default: null },
    removed: { type: Boolean, default: false },
    removedAt: { type: Date, default: null },
    lastImportedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "project_tasks" },
);
TaskSchema.index({ projectId: 1, key: 1 }, { unique: true });

const SprintSchema = new Schema(
  {
    projectId: { type: String, required: true },
    sprintId: { type: String, required: true },
    name: { type: String, required: true },
    state: { type: String, enum: ["active", "future", "closed", null], default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    removed: { type: Boolean, default: false },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "project_sprints" },
);
SprintSchema.index({ projectId: 1, sprintId: 1 }, { unique: true });

const TaskCommitSchema = new Schema(
  {
    projectId: { type: String, required: true },
    taskKey: { type: String, required: true },
    hash: { type: String, required: true },
    fullHash: { type: String, default: null },
    title: { type: String, default: "" },
    author: { type: String, default: "" },
    date: { type: Date, required: true },
    source: { type: String, enum: ["subject", "trailer"], required: true },
    linkedAt: { type: Date, required: true },
  },
  { collection: "task_commits" },
);
TaskCommitSchema.index({ projectId: 1, taskKey: 1, hash: 1 }, { unique: true });
TaskCommitSchema.index({ projectId: 1, date: -1 });

export const TaskModel = mongoose.models.ProjectTask || mongoose.model("ProjectTask", TaskSchema);
export const SprintModel = mongoose.models.ProjectSprint || mongoose.model("ProjectSprint", SprintSchema);
export const TaskCommitModel = mongoose.models.TaskCommit || mongoose.model("TaskCommit", TaskCommitSchema);
