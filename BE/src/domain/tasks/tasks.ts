// The pure rules of task tracking (F-13): which task keys a commit names, what an import changes, and how far a sprint
// has come. No I/O and no clock (the time is passed in), so every rule is unit-tested on its own.

import type { ISprint, ITask } from "../entities/Task.js";
import type { ParsedJiraExport, ParsedSprint, ParsedTask } from "./jiraExport.js";

// ── Commit → task keys ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ARCH-12 (Jira) or T22 (team ids): upper-case letters, then digits, with an optional dash, as a whole word. Not part of
 * a path or file name (src/T22.ts), so a key is never read out of a file mentioned in the subject.
 */
const KEY_IN_TEXT = /(?<![A-Za-z0-9_\-/.])([A-Z][A-Z0-9_]*-?\d+)(?![A-Za-z0-9_]|[./][A-Za-z0-9])/g;

export interface CommitText {
  /** The subject line. */
  title: string;
  /** Git trailers of the message ("Task: T22"), as mining stores them. Absent on snapshots mined before trailers were kept. */
  trailers?: readonly string[] | null;
}

export interface FoundKey { key: string; source: "subject" | "trailer" }

/** "Task: T22" -> ["Task", "T22"]; null for a line that is not a trailer. */
export function splitTrailer(line: string): [string, string] | null {
  const m = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*?)\s*$/.exec(line);
  return m ? [m[1], m[2]] : null;
}

/**
 * The task keys a commit names, each once, in the order found: first the "Task:" trailers (what the convention asks
 * for), then the subject. Only upper-case keys count (Jira keys are upper-case); whether a key is a real task is decided
 * by the caller against the project's tasks, so words such as "HTTP2" are harmless.
 */
export function taskKeysOf(commit: CommitText): FoundKey[] {
  const found = new Map<string, FoundKey>();
  const scan = (text: string, source: FoundKey["source"]) => {
    for (const m of text.matchAll(KEY_IN_TEXT)) if (!found.has(m[1])) found.set(m[1], { key: m[1], source });
  };
  for (const line of commit.trailers ?? []) {
    const trailer = splitTrailer(line);
    if (trailer && trailer[0].toLowerCase() === "task") scan(trailer[1].toUpperCase(), "trailer");
  }
  scan(commit.title ?? "", "subject");
  return [...found.values()];
}

// ── Import plan ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type TaskFields = Pick<ITask, "key" | "summary" | "status" | "statusCategory" | "assignee" | "storyPoints" | "sprintId">;
export type SprintFields = Pick<ISprint, "sprintId" | "name" | "state" | "startDate" | "endDate">;

export interface ImportPlan {
  create: TaskFields[];
  /** Tasks whose fields changed, or that come back after being removed. */
  update: TaskFields[];
  /** Keys of tasks the import contains unchanged (their lastImportedAt still moves). */
  unchanged: string[];
  /** Keys of tasks no longer in the export: marked removed. */
  remove: string[];
  /** Keys of removed tasks the export has again (also in `update`). */
  restore: string[];
  sprints: { upsert: SprintFields[]; remove: string[] };
}

const fieldsOf = (t: ParsedTask): TaskFields => ({
  key: t.key, summary: t.summary, status: t.status, statusCategory: t.statusCategory, assignee: t.assignee, storyPoints: t.storyPoints, sprintId: t.sprint,
});
const sprintFieldsOf = (s: ParsedSprint): SprintFields => ({ sprintId: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate });

const sameTask = (a: TaskFields, b: TaskFields) =>
  a.summary === b.summary && a.status === b.status && a.statusCategory === b.statusCategory && a.assignee === b.assignee
  && a.storyPoints === b.storyPoints && a.sprintId === b.sprintId;

/**
 * What importing `parsed` into a project that has `existing` tasks and sprints changes (UC-37): new keys are created,
 * known keys updated in place (never a second copy), and tasks the export no longer has are marked removed. Tasks already
 * marked removed are not removed twice.
 */
export function planImport(existing: { tasks: readonly (TaskFields & { removed?: boolean })[]; sprints: readonly { sprintId: string; removed?: boolean }[] }, parsed: ParsedJiraExport): ImportPlan {
  const known = new Map(existing.tasks.map(t => [t.key, t]));
  const plan: ImportPlan = { create: [], update: [], unchanged: [], remove: [], restore: [], sprints: { upsert: [], remove: [] } };
  const inFile = new Set<string>();
  for (const task of parsed.tasks) {
    inFile.add(task.key);
    const next = fieldsOf(task), before = known.get(task.key);
    if (!before) plan.create.push(next);
    else if (before.removed) { plan.update.push(next); plan.restore.push(task.key); }
    else if (!sameTask(before, next)) plan.update.push(next);
    else plan.unchanged.push(task.key);
  }
  for (const t of existing.tasks) if (!inFile.has(t.key) && !t.removed) plan.remove.push(t.key);

  const sprintsInFile = new Set(parsed.sprints.map(s => s.id));
  plan.sprints.upsert = parsed.sprints.map(sprintFieldsOf);
  plan.sprints.remove = existing.sprints.filter(s => !sprintsInFile.has(s.sprintId) && !s.removed).map(s => s.sprintId);
  return plan;
}

// ── Sprint progress ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface SprintProgress {
  done: number;
  total: number;
  /** done / total in percent, rounded; null for a sprint with no tasks (0 % would claim work that is not there). */
  percent: number | null;
  pointsDone: number;
  pointsTotal: number;
}

/**
 * Sprint progress = Done tasks / all tasks of the sprint (F-13). Removed tasks are not part of the sprint any more and
 * are left out of both numbers. Story points are summed alongside for information; tasks without points add 0.
 */
export function sprintProgress(tasks: readonly Pick<ITask, "statusCategory" | "removed" | "storyPoints">[]): SprintProgress {
  const live = tasks.filter(t => !t.removed);
  const done = live.filter(t => t.statusCategory === "done");
  const points = (list: typeof live) => list.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  return {
    done: done.length,
    total: live.length,
    percent: live.length ? Math.round((done.length / live.length) * 100) : null,
    pointsDone: points(done),
    pointsTotal: points(live),
  };
}
