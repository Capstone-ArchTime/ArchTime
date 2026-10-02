import { apiRequest } from '@/api/client';
import type { ArchitectureView, ValidationResult } from './types';

export interface SnapshotSummary { id: string; hash: string; title: string; date: string }
export interface ArchitecturePayload {
  status: 'ready' | 'missing';
  snapshot: SnapshotSummary | null;
  view: ArchitectureView | null;
  validation: ValidationResult | null;
  mapping: { generator: string; algorithmVersion: string; createdAt: string; stale: boolean } | null;
}

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

export async function getSnapshotSummaries(projectId: string, signal?: AbortSignal): Promise<SnapshotSummary[]> {
  const body = await apiRequest<{ data?: { snapshots?: Record<string, unknown>[] } }>(`${base(projectId)}/snapshots?summary=1`, { signal });
  const rows = body?.data?.snapshots;
  if (!Array.isArray(rows)) throw new Error('The server returned an invalid snapshot list.');
  return rows.filter(s => typeof s.id === 'string' && typeof s.hash === 'string').map(s => ({ id: String(s.id), hash: String(s.hash), title: typeof s.title === 'string' ? s.title : '', date: typeof s.date === 'string' ? s.date : '' }));
}

function parsePayload(body: { data?: ArchitecturePayload } | undefined): ArchitecturePayload {
  const data = body?.data;
  if (!data || (data.status !== 'ready' && data.status !== 'missing')) throw new Error('The server returned an invalid architecture response.');
  if (data.status === 'ready' && (!data.view || typeof data.view !== 'object')) throw new Error('The server returned an architecture without a view.');
  return data;
}

export async function getArchitecture(projectId: string, snapshotId?: string, signal?: AbortSignal): Promise<ArchitecturePayload> {
  const query = snapshotId ? `?snapshotId=${encodeURIComponent(snapshotId)}` : '';
  return parsePayload(await apiRequest(`${base(projectId)}/architecture${query}`, { signal }));
}

export async function generateArchitecture(projectId: string, snapshotId?: string, signal?: AbortSignal): Promise<ArchitecturePayload> {
  return parsePayload(await apiRequest(`${base(projectId)}/architecture`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshotId ? { snapshotId } : {}), signal,
  }));
}
