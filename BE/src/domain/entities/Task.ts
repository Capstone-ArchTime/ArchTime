import type { SprintState, TaskStatusCategory } from "../tasks/jiraExport.js";

// Project tasks and sprints (F-13, UC-36 – UC-39, SDD §3.14), imported from a Jira export. A task is identified in its
// project by its key; importing again updates it in place. A task (or sprint) missing from a later import is kept and
// marked removed, never deleted: commits stay linked to it and the history of the project still reads.

export interface ITask {
  id: string;
  projectId: string;
  key: string;
  summary: string;
  status: string | null;
  statusCategory: TaskStatusCategory;
  assignee: string | null;
  storyPoints: number | null;
  /** Sprint id (ISprint.sprintId) or null for the backlog. */
  sprintId: string | null;
  removed: boolean;
  removedAt: Date | null;
  /** When an import last contained the task. */
  lastImportedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISprint {
  id: string;
  projectId: string;
  /** "jira:<id>", or "name:<name>" when the export gives no id. */
  sprintId: string;
  name: string;
  state: SprintState | null;
  startDate: Date | null;
  endDate: Date | null;
  removed: boolean;
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A mined commit that names a task (LinkCommitsToTasksUseCase). One link per (project, task key, commit). */
export interface ITaskCommitLink {
  projectId: string;
  taskKey: string;
  /** Short hash, as snapshots store it. */
  hash: string;
  fullHash: string | null;
  title: string;
  author: string;
  date: Date;
  /** Where the key was found: the subject line, or a "Task:" trailer. */
  source: "subject" | "trailer";
  linkedAt: Date;
}
