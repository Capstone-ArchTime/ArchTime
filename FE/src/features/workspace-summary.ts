import { apiRequest } from '@/api/client';
import { ACTIVE_STATUSES } from './mining-api';
import { parseMiningJobs, type MiningJob } from './mining-jobs';

// What the analyst pages show about the signed-in account's workspaces, read from GET /projects and GET /projects/jobs.
// Server: BE/src/application/use-cases/projects/GetAllProjectsUseCase.ts; status rules in BE MiningService.settleProjectStatus.

export type WorkspaceStatus = 'PENDING' | 'CLONING' | 'ANALYZING' | 'PARTIAL' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';
export type Workspace = {
  id: string; name: string; description: string; repoUrl: string; status: WorkspaceStatus; role: string;
  /** Commits found by the last scan; null until the history has been read. */
  totalCommits: number | null; firstCommitDate: string | null; lastCommitDate: string | null; updatedAt: string | null;
};

const STATUSES: WorkspaceStatus[] = ['PENDING', 'CLONING', 'ANALYZING', 'PARTIAL', 'COMPLETED', 'FAILED'];
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const date = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

export function parseWorkspace(raw: unknown): Workspace | null {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') return null;
  const status = text(p.status).toUpperCase() as WorkspaceStatus;
  const history = p.history as Record<string, unknown> | null | undefined;
  const commits = history?.totalCommits;
  return {
    id: p.id, name: p.name, description: text(p.description), repoUrl: text(p.repoUrl),
    status: STATUSES.includes(status) ? status : 'UNKNOWN', role: text(p.userRole) || 'viewer',
    totalCommits: typeof commits === 'number' && Number.isFinite(commits) && commits >= 0 ? commits : null,
    firstCommitDate: date(history?.firstCommitDate), lastCommitDate: date(history?.lastCommitDate), updatedAt: date(p.updatedAt),
  };
}

export function parseWorkspaceList(body: unknown): { workspaces: Workspace[]; total: number } {
  const b = body as { data?: { projects?: unknown }; meta?: { total?: unknown } } | null;
  const rows = b?.data?.projects;
  if (!Array.isArray(rows)) throw new Error('The server returned an invalid list of workspaces.');
  const workspaces = rows.map(parseWorkspace);
  if (workspaces.some(w => !w)) throw new Error('The server returned an invalid workspace.');
  const total = b?.meta?.total;
  return { workspaces: workspaces as Workspace[], total: typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : workspaces.length };
}

/** Mining has stored at least one snapshot: the server only sets these statuses once a commit has been mined (ANALYZING may also be a first run). */
export const hasMinedHistory = (w: Pick<Workspace, 'status'>) => w.status === 'PARTIAL' || w.status === 'COMPLETED';
/** Workspaces whose architecture history can be browsed, including those being mined again. */
export const mayHaveSnapshots = (w: Pick<Workspace, 'status'>) => hasMinedHistory(w) || w.status === 'ANALYZING';

export const STATUS_LABELS: Record<WorkspaceStatus, string> = {
  PENDING: 'Not mined yet', CLONING: 'Cloning', ANALYZING: 'Mining', PARTIAL: 'Partly mined', COMPLETED: 'Fully mined', FAILED: 'Mining failed', UNKNOWN: 'Unknown',
};

export type NextStep = { label: string; hint: string; to: string; action: 'scan' | 'mine' | 'open' | 'wait' };
/** The one thing to do next with a workspace, following create → scan → mine → group files into components. */
export function nextStep(w: Pick<Workspace, 'id' | 'status' | 'totalCommits'>): NextStep {
  const id = encodeURIComponent(w.id);
  if (hasMinedHistory(w)) return { action: 'open', label: 'Group files into components', hint: 'Mined commits are ready. Open the architecture to name its components.', to: `/workspace/${id}` };
  if (w.status === 'ANALYZING' || w.status === 'CLONING') return { action: 'wait', label: 'Mining in progress', hint: 'Commits are being analyzed. This page shows them once the first batch is stored.', to: '/projects' };
  if (w.status === 'FAILED') return { action: 'mine', label: 'Try mining again', hint: 'The last mining run stored no commits. Open Manage mining to see the error and retry.', to: '/projects' };
  if (w.totalCommits === null) return { action: 'scan', label: 'Read the commit history', hint: 'Scan the repository so you can choose which commits to mine.', to: '/projects' };
  return { action: 'mine', label: 'Mine commits', hint: `${w.totalCommits} commits found. Mine a date range or all of them to build the history.`, to: '/projects' };
}

export type WorkspaceStats = { workspaces: number; commitsFound: number; mined: number; jobs: number; activeJobs: number };
export function workspaceStats(list: { workspaces: Workspace[]; total: number }, jobs: { jobs: MiningJob[]; total: number }): WorkspaceStats {
  return {
    workspaces: list.total,
    commitsFound: list.workspaces.reduce((sum, w) => sum + (w.totalCommits ?? 0), 0),
    mined: list.workspaces.filter(hasMinedHistory).length,
    jobs: jobs.total,
    activeJobs: jobs.jobs.filter(j => ACTIVE_STATUSES.includes(j.status)).length,
  };
}

/** Most recently changed first; workspaces without a date go last. */
export const byRecent = (a: Workspace, b: Workspace) => (b.updatedAt ? Date.parse(b.updatedAt) : 0) - (a.updatedAt ? Date.parse(a.updatedAt) : 0);

/** Every workspace the account can read (the server caps a page at 100). */
export async function getWorkspaces(signal?: AbortSignal) {
  return parseWorkspaceList(await apiRequest('/projects?limit=100', { signal }));
}
export async function getRecentJobs(limit: number, signal?: AbortSignal): Promise<{ jobs: MiningJob[]; total: number }> {
  const body = await apiRequest<{ meta?: { total?: unknown } }>(`/projects/jobs?limit=${limit}`, { signal });
  const jobs = parseMiningJobs(body);
  const total = body?.meta?.total;
  return { jobs, total: typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : jobs.length };
}

export type SnapshotRow = { id: string; hash: string; title: string; author: string; date: string; files: number; archChanges: number; depAdded: number; depRemoved: number; modules: number; dependencies: number };
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
export function parseSnapshotPage(body: unknown): { rows: SnapshotRow[]; total: number } {
  const b = body as { data?: { snapshots?: unknown }; meta?: { total?: unknown } } | null;
  const raw = b?.data?.snapshots;
  if (!Array.isArray(raw)) throw new Error('The server returned an invalid list of mined commits.');
  const rows = raw.map((s: Record<string, unknown> | null) => {
    if (!s || typeof s.id !== 'string' || typeof s.hash !== 'string' || date(s.date) === null) throw new Error('The server returned an invalid mined commit.');
    return {
      id: s.id, hash: s.hash.slice(0, 7), title: text(s.title) || 'No commit message', author: text(s.author), date: s.date as string,
      files: count(s.files), archChanges: count(s.archChanges), depAdded: count(s.depAdded), depRemoved: count(s.depRemoved),
      modules: Array.isArray(s.nodes) ? s.nodes.length : 0, dependencies: Array.isArray(s.edges) ? s.edges.length : 0,
    };
  });
  const total = b?.meta?.total;
  return { rows, total: typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : rows.length };
}
/** Newest commits that changed the structure (modules or dependencies), at most `limit`. */
export const structuralChanges = (rows: SnapshotRow[], limit = 5) => rows
  .filter(r => r.archChanges + r.depAdded + r.depRemoved > 0)
  .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  .slice(0, limit);

/** One mined commit page of a workspace; `summary` leaves out the dependency graph. */
export async function getSnapshotPage(projectId: string, query: { limit: number; summary?: boolean }, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: '1', limit: String(query.limit), ...(query.summary ? { summary: '1' } : {}) });
  return parseSnapshotPage(await apiRequest(`/projects/${encodeURIComponent(projectId)}/snapshots?${params}`, { signal }));
}
export async function getWorkspace(projectId: string, signal?: AbortSignal): Promise<Workspace> {
  const body = await apiRequest<{ data?: { project?: unknown } }>(`/projects/${encodeURIComponent(projectId)}`, { signal });
  const workspace = parseWorkspace(body?.data?.project);
  if (!workspace) throw new Error('The server returned an invalid workspace.');
  return workspace;
}
