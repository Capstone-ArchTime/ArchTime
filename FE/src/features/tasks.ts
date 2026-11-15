import { apiRequest } from '../api/client.ts';

// Project tasks & sprints (F-13, RF-07): imported from a Jira JSON export, linked to the mined commits that name them.
// The server computes everything (progress included); this module reads it, checks its shape and words it for people.

export type StatusCategory = 'todo' | 'in-progress' | 'done';

export interface TaskCommit { hash: string; fullHash: string | null; title: string; author: string; date: string; source: 'subject' | 'trailer' }

export interface Task {
  id: string;
  key: string;
  summary: string;
  status: string | null;
  statusCategory: StatusCategory;
  assignee: string | null;
  storyPoints: number | null;
  sprintId: string | null;
  sprintName: string | null;
  removed: boolean;
  removedAt: string | null;
  commits: TaskCommit[];
}

export interface Progress { done: number; total: number; percent: number | null; pointsDone: number; pointsTotal: number }

export interface Sprint {
  id: string;
  sprintId: string;
  name: string;
  state: 'active' | 'future' | 'closed' | null;
  startDate: string | null;
  endDate: string | null;
  removed: boolean;
  progress: Progress;
}

export interface TaskBoard {
  tasks: Task[];
  sprints: Sprint[];
  backlog: Progress;
  totals: { tasks: number; removed: number; linkedCommits: number };
  lastImportedAt: string | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  restored: number;
  sprints: number;
  sprintsRemoved: number;
  links: { commits: number; linked: number; unknownKeys: string[] };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isProgress = (p: unknown): p is Progress => isObject(p) && typeof p.done === 'number' && typeof p.total === 'number' && (p.percent === null || typeof p.percent === 'number');
const isTask = (t: unknown): t is Task => isObject(t) && typeof t.key === 'string' && typeof t.summary === 'string' && typeof t.removed === 'boolean' && Array.isArray(t.commits)
  && ['todo', 'in-progress', 'done'].includes(t.statusCategory as string);
const isSprint = (s: unknown): s is Sprint => isObject(s) && typeof s.sprintId === 'string' && typeof s.name === 'string' && typeof s.removed === 'boolean' && isProgress(s.progress);

/** Checks the shape of GET /projects/:id/tasks, so a page never renders half a board. */
export function readBoard(data: unknown): TaskBoard {
  if (!isObject(data) || !Array.isArray(data.tasks) || !Array.isArray(data.sprints) || !data.tasks.every(isTask) || !data.sprints.every(isSprint) || !isProgress(data.backlog)) {
    throw new Error('The server returned an invalid task board.');
  }
  return data as unknown as TaskBoard;
}

export async function fetchTaskBoard(projectId: string, signal?: AbortSignal): Promise<TaskBoard> {
  const body = await apiRequest<{ data?: unknown }>(`/projects/${encodeURIComponent(projectId)}/tasks`, { signal });
  return readBoard(body?.data);
}

/** Sends the text of the export as it is: the server parses and validates it, and refuses the whole file on any error (MSG22). */
export async function importJiraExport(projectId: string, fileText: string): Promise<ImportResult> {
  // apiRequest adds no Content-Type: without it the server's JSON parser ignores the body ("Attach the Jira export file").
  const body = await apiRequest<{ data?: ImportResult }>(`/projects/${encodeURIComponent(projectId)}/tasks/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: fileText }),
  }, 60_000);
  if (!body?.data) throw new Error('The server did not confirm the import.');
  return body.data;
}

export async function relinkCommits(projectId: string): Promise<ImportResult['links']> {
  const body = await apiRequest<{ data?: ImportResult['links'] }>(`/projects/${encodeURIComponent(projectId)}/tasks/link`, { method: 'POST' });
  if (!body?.data) throw new Error('The server did not confirm the linking.');
  return body.data;
}

/** "2 / 3 done (67 %)", or "No tasks" for an empty sprint: 0 % would claim there is work left. */
export function progressLabel(p: Progress): string {
  if (!p.total) return 'No tasks';
  return `${p.done} / ${p.total} done (${p.percent ?? Math.round((p.done / p.total) * 100)} %)`;
}

export const STATUS_COLORS: Record<StatusCategory, string> = { todo: 'default', 'in-progress': 'processing', done: 'success' };

/** One line for the person who imported: what changed, and which keys commits named that are no task of this workspace. */
export function importSummary(r: ImportResult): string {
  const parts = [`${r.created} new`, `${r.updated} updated`, `${r.unchanged} unchanged`];
  if (r.removed) parts.push(`${r.removed} marked removed`);
  if (r.restored) parts.push(`${r.restored} restored`);
  let text = `Imported: ${parts.join(', ')}. ${r.links.linked} new commit link${r.links.linked === 1 ? '' : 's'}.`;
  if (r.links.unknownKeys.length) text += ` Commits also name ${r.links.unknownKeys.slice(0, 5).join(', ')}${r.links.unknownKeys.length > 5 ? '…' : ''}, which are not tasks here.`;
  return text;
}

export type TaskFilter = { sprint: string | 'all' | 'backlog'; showRemoved: boolean; query: string };

/** The tasks a filter shows: by sprint (or the backlog), removed ones only when asked, and by key, summary or assignee. */
export function filterTasks(tasks: readonly Task[], filter: TaskFilter): Task[] {
  const q = filter.query.trim().toLowerCase();
  return tasks.filter(t => (filter.showRemoved || !t.removed)
    && (filter.sprint === 'all' || (filter.sprint === 'backlog' ? !t.sprintId : t.sprintId === filter.sprint))
    && (!q || t.key.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q) || (t.assignee ?? '').toLowerCase().includes(q)));
}
