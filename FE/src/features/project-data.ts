import { apiRequest } from '@/api/client';
export type ProjectSummary = { id: string; name: string };
export type Snapshot = { id: string; hash: string; title: string; date: string; nodes: { id: string; name: string; type: string }[]; edges: { source: string; target: string; type: string }[] };
export async function getProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  const body = await apiRequest<{ data?: { projects?: ProjectSummary[] } }>('/projects', { signal });
  if (!Array.isArray(body?.data?.projects) || !body.data.projects.every(p => p && typeof p.id === 'string' && typeof p.name === 'string')) throw new Error('Invalid workspace response.');
  return body.data.projects;
}
const isSummary = (p: unknown): p is ProjectSummary => !!p && typeof (p as ProjectSummary).id === 'string' && typeof (p as ProjectSummary).name === 'string';
/** Workspaces the signed-in account maintains: its own, those it is a maintainer of, and those of organizations it owns (at most 100). */
export async function getManagedProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  const body = await apiRequest<{ data?: { projects?: unknown } }>('/projects?scope=managed&limit=100', { signal });
  const rows = body?.data?.projects;
  if (!Array.isArray(rows) || !rows.every(isSummary)) throw new Error('The server returned an invalid list of workspaces.');
  return rows.map(p => ({ id: p.id, name: p.name }));
}
/** Every workspace the signed-in account can see (at most 100), whatever its role in them. */
export async function getReadableProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  const body = await apiRequest<{ data?: { projects?: unknown } }>('/projects?limit=100', { signal });
  const rows = body?.data?.projects;
  if (!Array.isArray(rows) || !rows.every(isSummary)) throw new Error('The server returned an invalid list of workspaces.');
  return rows.map(p => ({ id: p.id, name: p.name }));
}
/** How many workspaces the signed-in account maintains, asking the server for one row and reading the total. */
export async function countManagedProjects(signal?: AbortSignal): Promise<number> {
  const body = await apiRequest<{ data?: { projects?: unknown }; meta?: { total?: unknown } }>('/projects?scope=managed&limit=1', { signal });
  const total = body?.meta?.total;
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0) return total;
  const rows = body?.data?.projects;
  if (Array.isArray(rows)) return rows.length;
  throw new Error('The server returned an invalid list of workspaces.');
}
export async function getSnapshots(projectId: string, signal?: AbortSignal): Promise<Snapshot[]> {
  const body = await apiRequest<{ data?: { snapshots?: Snapshot[] } }>(`/projects/${encodeURIComponent(projectId)}/snapshots`, { signal });
  const rows = body?.data?.snapshots;
  if (!Array.isArray(rows) || !rows.every(s => s && [s.id, s.hash, s.title, s.date].every(v => typeof v === 'string') && Array.isArray(s.nodes) && s.nodes.every(n => n && [n.id, n.name, n.type].every(v => typeof v === 'string')) && Array.isArray(s.edges) && s.edges.every(e => e && [e.source, e.target, e.type].every(v => typeof v === 'string')))) throw new Error('Invalid snapshot response.');
  return rows;
}
