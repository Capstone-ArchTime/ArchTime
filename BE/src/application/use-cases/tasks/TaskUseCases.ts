import type { ISprint, ITask, ITaskCommitLink } from "../../../domain/entities/Task.js";
import type { IMinedCommitSource, ITaskRepository, MinedCommit } from "../../../domain/interfaces/ITaskRepository.js";
import { JiraExportError, parseJiraExport } from "../../../domain/tasks/jiraExport.js";
import { planImport, sprintProgress, taskKeysOf, type SprintProgress } from "../../../domain/tasks/tasks.js";
import { ValidationError } from "../../../shared/errors/AppError.js";

// Task tracking (F-13, RF-07, UC-36 – UC-39, SDD §3.14): import tasks and sprints from a Jira export, link mined commits
// to the tasks they name, and show sprints with their progress.

/** A Jira export is read whole in memory; 2 MB of JSON is several thousand issues (the JSON body limit of the API). */
export const MAX_EXPORT_CHARS = 2_000_000;

export interface LinkSummary {
  commits: number;
  /** Links added now; links that existed already are not counted again. */
  linked: number;
  /** Keys commits named that are not tasks of the project (typos, other projects' keys, words like HTTP2). */
  unknownKeys: string[];
}

/** LinkCommitsToTasksUseCase: runs after every mined batch (MiningService.onBatchSaved) and after every import. */
export class LinkCommitsToTasksUseCase {
  constructor(
    private readonly tasks: Pick<ITaskRepository, "listTasks" | "addLinks">,
    private readonly mined: IMinedCommitSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Links the given commits (one mined batch) to the project's tasks. Removed tasks are still linked: the commit happened. */
  async execute(projectId: string, commits: readonly MinedCommit[]): Promise<LinkSummary> {
    const summary: LinkSummary = { commits: commits.length, linked: 0, unknownKeys: [] };
    if (!commits.length) return summary;
    const known = new Set((await this.tasks.listTasks(projectId)).map(t => t.key));
    const unknown = new Set<string>();
    const links: ITaskCommitLink[] = [];
    const seen = new Set<string>();
    const at = this.now();
    for (const commit of commits) {
      if (!commit?.hash) continue;
      for (const { key, source } of taskKeysOf(commit)) {
        if (!known.has(key)) { unknown.add(key); continue; }
        const id = `${key}\u0000${commit.hash}`;
        if (seen.has(id)) continue;
        seen.add(id);
        links.push({
          projectId, taskKey: key, hash: commit.hash, fullHash: commit.fullHash ?? null, title: commit.title ?? "",
          author: commit.author ?? "", date: commit.date, source, linkedAt: at,
        });
      }
    }
    summary.linked = await this.tasks.addLinks(links);
    summary.unknownKeys = [...unknown].sort();
    return summary;
  }

  /** Links every mined commit of the project: after an import, commits mined earlier find their newly known tasks. */
  async relinkAll(projectId: string): Promise<LinkSummary> {
    return this.execute(projectId, await this.mined.commitsOf(projectId));
  }
}

export interface ImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  restored: number;
  sprints: number;
  sprintsRemoved: number;
  links: LinkSummary;
}

/** ImportTasksUseCase (UC-37): a re-import updates tasks by key, never duplicates them, and marks missing ones removed. */
export class ImportTasksUseCase {
  constructor(
    private readonly tasks: Pick<ITaskRepository, "listTasks" | "listSprints" | "applyImport">,
    private readonly linker: Pick<LinkCommitsToTasksUseCase, "relinkAll">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(projectId: string, file: unknown): Promise<ImportSummary> {
    if (typeof file === "string" && file.length > MAX_EXPORT_CHARS) {
      throw new ValidationError(`The export is larger than ${MAX_EXPORT_CHARS / 1_000_000} MB. Export fewer issues at a time.`, { file: "too large" });
    }
    if (file === undefined || file === null) throw new ValidationError("Attach the Jira export file.", { file: "required" });
    let parsed;
    try {
      parsed = parseJiraExport(file);
    } catch (error) {
      // The file is refused as a whole (BR-25): nothing below has written anything yet.
      if (error instanceof JiraExportError) {
        throw new ValidationError(error.message, {
          file: error.messageId ?? "invalid",
          ...(error.messageId ? { messageId: error.messageId } : {}),
          ...(error.taskIndex !== null ? { task: String(error.taskIndex) } : {}),
        });
      }
      throw error;
    }
    const [tasks, sprints] = await Promise.all([this.tasks.listTasks(projectId), this.tasks.listSprints(projectId)]);
    const plan = planImport({ tasks, sprints }, parsed);
    await this.tasks.applyImport(projectId, plan, this.now());
    const links = await this.linker.relinkAll(projectId);
    return {
      created: plan.create.length,
      updated: plan.update.length - plan.restore.length,
      unchanged: plan.unchanged.length,
      removed: plan.remove.length,
      restored: plan.restore.length,
      sprints: plan.sprints.upsert.length,
      sprintsRemoved: plan.sprints.remove.length,
      links,
    };
  }
}

export interface TaskView extends Omit<ITask, "projectId"> {
  sprintName: string | null;
  commits: Pick<ITaskCommitLink, "hash" | "fullHash" | "title" | "author" | "date" | "source">[];
}

export interface SprintView extends Omit<ISprint, "projectId"> {
  progress: SprintProgress;
}

export interface TaskBoard {
  tasks: TaskView[];
  sprints: SprintView[];
  /** Tasks with no sprint (the backlog), removed ones left out of the progress as everywhere. */
  backlog: SprintProgress;
  totals: { tasks: number; removed: number; linkedCommits: number };
  lastImportedAt: Date | null;
}

const SPRINT_ORDER = { active: 0, future: 1, closed: 2 } as const;

/** ListTasksUseCase (UC-38, UC-39): every task with its related commits, every sprint with Done / total. */
export class ListTasksUseCase {
  constructor(private readonly tasks: Pick<ITaskRepository, "listTasks" | "listSprints" | "listLinks">) {}

  async execute(projectId: string): Promise<TaskBoard> {
    const [tasks, sprints, links] = await Promise.all([this.tasks.listTasks(projectId), this.tasks.listSprints(projectId), this.tasks.listLinks(projectId)]);
    const names = new Map(sprints.map(s => [s.sprintId, s.name]));
    const byKey = new Map<string, TaskView["commits"]>();
    for (const l of links) {
      const list = byKey.get(l.taskKey) ?? [];
      list.push({ hash: l.hash, fullHash: l.fullHash, title: l.title, author: l.author, date: l.date, source: l.source });
      byKey.set(l.taskKey, list);
    }
    const strip = <T extends { projectId: string }>({ projectId: _p, ...rest }: T) => rest;
    const sprintViews = sprints
      .map(s => ({ ...strip(s), progress: sprintProgress(tasks.filter(t => t.sprintId === s.sprintId)) }))
      .sort((a, b) => Number(a.removed) - Number(b.removed)
        || (SPRINT_ORDER[a.state ?? "closed"] ?? 3) - (SPRINT_ORDER[b.state ?? "closed"] ?? 3)
        || (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0)
        || a.name.localeCompare(b.name));
    const known = new Set(sprints.map(s => s.sprintId));
    return {
      tasks: tasks.map(t => ({ ...strip(t), sprintName: t.sprintId ? names.get(t.sprintId) ?? null : null, commits: byKey.get(t.key) ?? [] })),
      sprints: sprintViews,
      backlog: sprintProgress(tasks.filter(t => !t.sprintId || !known.has(t.sprintId))),
      totals: { tasks: tasks.filter(t => !t.removed).length, removed: tasks.filter(t => t.removed).length, linkedCommits: new Set(links.map(l => l.hash)).size },
      lastImportedAt: tasks.reduce<Date | null>((latest, t) => (!latest || t.lastImportedAt > latest ? t.lastImportedAt : latest), null),
    };
  }
}
