import type { ISprint, ITask, ITaskCommitLink } from "../entities/Task.js";
import type { ImportPlan } from "../tasks/tasks.js";

export interface ITaskRepository {
  /** Every task of the project, removed ones included, in key order. */
  listTasks(projectId: string): Promise<ITask[]>;
  /** Every sprint of the project, removed ones included. */
  listSprints(projectId: string): Promise<ISprint[]>;
  /**
   * Writes an import plan: creates and updates by (project, key) so a key never has two tasks, marks the plan's
   * removals, and stamps `at` as lastImportedAt on every task in the file. Sprints likewise by (project, sprintId).
   */
  applyImport(projectId: string, plan: ImportPlan, at: Date): Promise<void>;
  /** Adds links, skipping ones that exist already (one per project, key and commit). Returns how many were new. */
  addLinks(links: ITaskCommitLink[]): Promise<number>;
  /** The links of a project, newest commit first. */
  listLinks(projectId: string): Promise<ITaskCommitLink[]>;
}

/** A mined commit as linking reads it. */
export interface MinedCommit {
  hash: string;
  fullHash?: string | null;
  title: string;
  trailers?: string[] | null;
  author: string;
  date: Date;
}

/** The mined commits of a project (its snapshots), for linking commits mined before the tasks were imported. */
export interface IMinedCommitSource {
  commitsOf(projectId: string): Promise<MinedCommit[]>;
}
