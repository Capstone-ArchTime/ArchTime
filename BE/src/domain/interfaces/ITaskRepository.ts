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

/** A mined commit as the architectural impact of a task reads it (DS-07a, WF-07). */
export interface CommitArchitecture {
  depAdded: number;
  depRemoved: number;
  graph: { nodes: { id: string }[]; edges: { source: string; target: string }[] };
  /** Graph of the snapshot its counts were measured against; null for the first mined commit. */
  baseGraph: { nodes: { id: string }[]; edges: { source: string; target: string }[] } | null;
  /** The change evidence recorded for the commit, when it changed dependencies. */
  evidenceId: string | null;
}

export interface ICommitArchitectureSource {
  /** Null when the commit is not (or no longer) mined. */
  ofCommit(projectId: string, hash: string): Promise<CommitArchitecture | null>;
}
