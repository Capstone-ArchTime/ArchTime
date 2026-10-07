import { apiRequest } from '@/api/client';
import type { ArchitectureView, ValidationResult } from './types';

export interface SnapshotSummary { id: string; hash: string; title: string; date: string }
export interface RefineReceipt {
  mode: 'refine' | 'name-only';
  provider: string;
  model: string;
  external: boolean;
  filesSent: number;
  attempts: { n: number; ok: boolean; issues: { code: string; message: string }[]; usage?: { inputTokens: number; outputTokens: number }; latencyMs?: number }[];
  accepted: boolean;
  fallbackReason?: string;
  movedRatio?: number;
  notes?: string[];
  /** Summed over every attempt (failed ones were paid for too). Absent on results made before usage was recorded. */
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; reasoningTokens?: number; totalTokens: number; estimated?: boolean };
  latencyMs?: number;
  cost?: { amount: number; currency: string };
  runId?: string;
  modelId?: string;
}
export interface LlmCapability { enabled: boolean; provider: string | null; model: string | null; host: string | null; external: boolean; reason?: string; modelId?: string | null; displayName?: string | null }
export interface ArchitecturePayload {
  status: 'ready' | 'missing';
  snapshot: SnapshotSummary | null;
  view: ArchitectureView | null;
  validation: ValidationResult | null;
  mapping: { generator: string; algorithmVersion: string; createdAt: string; stale: boolean; receipt: RefineReceipt | null } | null;
  llm: LlmCapability;
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
  if (!data.llm || typeof data.llm.enabled !== 'boolean') data.llm = { enabled: false, provider: null, model: null, host: null, external: false };
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

/** Starts the background job that groups the snapshot and asks an AI model (the chosen one, else the default) to name and refine it. */
export async function refineArchitecture(projectId: string, snapshotId?: string, modelId?: string, signal?: AbortSignal): Promise<string> {
  const body = await apiRequest<{ data?: { jobId?: string } }>(`${base(projectId)}/architecture/refine`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(snapshotId ? { snapshotId } : {}), ...(modelId ? { modelId } : {}) }), signal,
  });
  if (typeof body?.data?.jobId !== 'string') throw new Error('The server did not start the job.');
  return body.data.jobId;
}
