import { apiRequest } from '../api/client.ts';

// The signed-in person's organizations, workspaces and learning progress, in one place.
// Server: GET /organizations, GET /projects, GET /onboarding/me. Each call returns only what this account may see.

export type OrganizationRole = 'owner' | 'member';
export type MyOrganization = { id: string; name: string; description: string; myRole: OrganizationRole; memberCount: number };

export type WorkspaceRole = 'owner' | 'project-maintainer' | 'developer-analyst' | 'system-administrator' | 'viewer';
export type WorkspaceStatus = 'PENDING' | 'CLONING' | 'ANALYZING' | 'PARTIAL' | 'COMPLETED' | 'FAILED';
export type MyWorkspace = {
  id: string; name: string; description: string; status: WorkspaceStatus | string; userRole: WorkspaceRole;
  organizationId: string | null; totalCommits: number | null; lastCommitDate: string | null; updatedAt: string | null;
};

/** Workspaces are fetched page by page up to this many; more than that is not something one page should list. */
export const MAX_WORKSPACES = 500;
const PAGE = 100;

type Envelope<T> = { data?: T; meta?: { total?: number; totalPages?: number } };
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function getMyOrganizations(signal?: AbortSignal): Promise<MyOrganization[]> {
  const body = await apiRequest<Envelope<{ organizations?: unknown }>>('/organizations', { signal });
  const list = body?.data?.organizations;
  if (!Array.isArray(list)) throw new Error('The server returned an invalid list of organizations.');
  return list.map((o: any) => ({
    id: str(o.id), name: str(o.name), description: str(o.description),
    myRole: o.myRole === 'owner' ? 'owner' : 'member', memberCount: Number(o.memberCount) || 0,
  }));
}

function toWorkspace(p: any): MyWorkspace {
  return {
    id: str(p.id), name: str(p.name), description: str(p.description), status: str(p.status) || 'PENDING',
    userRole: (p.userRole ?? 'viewer') as WorkspaceRole, organizationId: p.organizationId ? String(p.organizationId) : null,
    totalCommits: typeof p.history?.totalCommits === 'number' ? p.history.totalCommits : null,
    lastCommitDate: p.history?.lastCommitDate ? String(p.history.lastCommitDate) : null,
    updatedAt: p.updatedAt ? String(p.updatedAt) : null,
  };
}

/** Every workspace the account can read (owned, joined, and all of an owned organization's), up to MAX_WORKSPACES. */
export async function getMyWorkspaces(signal?: AbortSignal): Promise<{ workspaces: MyWorkspace[]; total: number }> {
  const out: MyWorkspace[] = [];
  let total = 0;
  for (let page = 1; out.length < MAX_WORKSPACES; page++) {
    const body = await apiRequest<Envelope<{ projects?: unknown }>>(`/projects?scope=all&limit=${PAGE}&page=${page}`, { signal });
    const list = body?.data?.projects;
    if (!Array.isArray(list)) throw new Error('The server returned an invalid list of workspaces.');
    out.push(...list.map(toWorkspace));
    total = body.meta?.total ?? out.length;
    if (list.length < PAGE || out.length >= total) break;
  }
  return { workspaces: out.slice(0, MAX_WORKSPACES), total };
}

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = { owner: 'Owner', member: 'Member' };

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner', 'project-maintainer': 'Maintainer', 'developer-analyst': 'Member', 'system-administrator': 'Administrator', viewer: 'Viewer',
};

export const STATUS_VIEW: Record<WorkspaceStatus, { label: string; color: string }> = {
  PENDING: { label: 'Not scanned', color: 'default' },
  CLONING: { label: 'Cloning', color: 'blue' },
  ANALYZING: { label: 'Mining', color: 'blue' },
  PARTIAL: { label: 'Partly mined', color: 'gold' },
  COMPLETED: { label: 'Mined', color: 'green' },
  FAILED: { label: 'Failed', color: 'red' },
};
export const statusView = (status: string) => STATUS_VIEW[status as WorkspaceStatus] ?? { label: status || 'Unknown', color: 'default' };

export interface WorkspaceGroup {
  key: string;
  /** null for the personal space. */
  organization: MyOrganization | null;
  title: string;
  workspaces: MyWorkspace[];
}

const roleOrder: WorkspaceRole[] = ['owner', 'project-maintainer', 'developer-analyst', 'viewer', 'system-administrator'];

/**
 * Workspaces by space: personal first, then each organization by name. Organization projects whose organization is not
 * in the list (the list failed, or an administrator sees their metadata) are gathered in one last group.
 */
export function groupWorkspaces(workspaces: MyWorkspace[], organizations: MyOrganization[]): WorkspaceGroup[] {
  const byOrg = new Map(organizations.map(o => [o.id, o]));
  const groups = new Map<string, WorkspaceGroup>();
  for (const w of workspaces) {
    const org = w.organizationId ? byOrg.get(w.organizationId) ?? null : null;
    // Organizations whose names are not known share one group: several groups with the same title would read as duplicates.
    const key = !w.organizationId ? 'personal' : org ? org.id : 'other';
    if (!groups.has(key)) {
      groups.set(key, { key, organization: org, title: key === 'personal' ? 'Personal space' : org?.name ?? 'Other organizations', workspaces: [] });
    }
    groups.get(key)!.workspaces.push(w);
  }
  for (const g of groups.values()) {
    g.workspaces.sort((a, b) => roleOrder.indexOf(a.userRole) - roleOrder.indexOf(b.userRole) || a.name.localeCompare(b.name));
  }
  return [...groups.values()].sort((a, b) =>
    (a.key === 'personal' ? -1 : b.key === 'personal' ? 1 : 0) || Number(!a.organization) - Number(!b.organization) || a.title.localeCompare(b.title));
}

/** How many of the account's workspaces each organization holds. */
export function workspacesPerOrganization(workspaces: MyWorkspace[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of workspaces) if (w.organizationId) out.set(w.organizationId, (out.get(w.organizationId) ?? 0) + 1);
  return out;
}

const BREAKDOWN: [WorkspaceRole, string][] = [
  ['owner', 'owned'], ['project-maintainer', 'maintained'], ['developer-analyst', 'as member'], ['viewer', 'view only'], ['system-administrator', 'as administrator'],
];

/** "2 owned · 1 maintained · 1 view only": every role the account has in some workspace, so the parts add up to the total. */
export function workspaceRoleBreakdown(workspaces: MyWorkspace[]): string {
  return BREAKDOWN.map(([role, label]) => [workspaces.filter(w => w.userRole === role).length, label] as const)
    .filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(' · ') || 'none yet';
}

export interface LearningSummary { assigned: number; finished: number; inProgress: number; notStarted: number; percent: number }

/** Paths finished, started and not started, and the share of all their steps done. */
export function summarizeLearning(paths: { done: number; total: number }[]): LearningSummary {
  const steps = paths.reduce((s, p) => s + p.total, 0);
  const done = paths.reduce((s, p) => s + Math.min(p.done, p.total), 0);
  return {
    assigned: paths.length,
    finished: paths.filter(p => p.total > 0 && p.done >= p.total).length,
    inProgress: paths.filter(p => p.done > 0 && p.done < p.total).length,
    notStarted: paths.filter(p => p.done === 0 && p.total > 0).length,
    percent: steps ? Math.round((done / steps) * 100) : 0,
  };
}

/** Unfinished paths first, most recently active first; finished ones last. */
export function orderPaths<T extends { done: number; total: number; lastActivityAt: string }>(paths: T[]): T[] {
  const finished = (p: T) => p.total > 0 && p.done >= p.total;
  return [...paths].sort((a, b) => Number(finished(a)) - Number(finished(b)) || b.lastActivityAt.localeCompare(a.lastActivityAt));
}
