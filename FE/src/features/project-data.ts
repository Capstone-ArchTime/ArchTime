import { apiRequest } from '@/api/client';
export type ProjectSummary = { id: string; name: string };
export type Snapshot = { id: string; hash: string; title: string; date: string; nodes: { id: string; name: string; type: string }[]; edges: { source: string; target: string; type: string }[] };
export async function getProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  const body = await apiRequest<{ data?: { projects?: ProjectSummary[] } }>('/projects', { signal });
  if (!Array.isArray(body?.data?.projects) || !body.data.projects.every(p => p && typeof p.id === 'string' && typeof p.name === 'string')) throw new Error('Invalid project response.');
  return body.data.projects;
}
export async function getSnapshots(projectId: string, signal?: AbortSignal): Promise<Snapshot[]> {
  const body = await apiRequest<{ data?: { snapshots?: Snapshot[] } }>(`/projects/${encodeURIComponent(projectId)}/snapshots`, { signal });
  const rows = body?.data?.snapshots;
  if (!Array.isArray(rows) || !rows.every(s => s && [s.id, s.hash, s.title, s.date].every(v => typeof v === 'string') && Array.isArray(s.nodes) && s.nodes.every(n => n && [n.id, n.name, n.type].every(v => typeof v === 'string')) && Array.isArray(s.edges) && s.edges.every(e => e && [e.source, e.target, e.type].every(v => typeof v === 'string')))) throw new Error('Invalid snapshot response.');
  return rows;
}
