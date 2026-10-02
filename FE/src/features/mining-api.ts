import { apiRequest } from '@/api/client';
import type { MonthCount } from './mining-coverage';

export type MiningJobState = {
  id: string; kind: 'scan' | 'mine'; status: string; stage: string; progress: number; error?: string;
  total: number; processed: number; failedCommits: number; batchIndex: number; batchCount: number;
};
export type MiningOverview = {
  project: { id: string; name: string; status: string };
  history: { totalCommits: number; firstCommitDate?: string; lastCommitDate?: string; monthly: MonthCount[] } | null;
  mined: { count: number; firstDate: string | null; lastDate: string | null; monthly: MonthCount[] };
  remaining: number | null;
  activeJob: MiningJobState | null;
  lastJob: MiningJobState | null;
};
export type MiningEstimate = { inRange: number; alreadyMined: number; toMine: number; batchSize: number; batchCount: number };
export type MineRequest = { mode: 'remaining' } | { mode: 'range'; since: string; until: string; force?: boolean };

export const ACTIVE_STATUSES = ['queued', 'running'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function parseJobState(raw: unknown): MiningJobState | null {
  const job = raw as Record<string, unknown> | null;
  if (!job || typeof job.status !== 'string') return null;
  const id = String(job.id ?? job._id ?? '');
  if (!id) return null;
  return {
    id, kind: job.kind === 'scan' ? 'scan' : 'mine', status: job.status, stage: typeof job.stage === 'string' ? job.stage : '',
    progress: Math.min(100, Math.max(0, num(job.progress))), error: typeof job.error === 'string' ? job.error : undefined,
    total: num(job.total), processed: num(job.processed), failedCommits: num(job.failedCommits), batchIndex: num(job.batchIndex), batchCount: num(job.batchCount),
  };
}

export async function getMiningOverview(projectId: string, signal?: AbortSignal): Promise<MiningOverview> {
  const body = await apiRequest<{ data?: Record<string, any> }>(`/projects/${encodeURIComponent(projectId)}/mining`, { signal });
  const d = body?.data;
  if (!d?.project || !d.mined) throw new Error('The server returned an invalid mining overview.');
  return {
    project: d.project, history: d.history ?? null,
    mined: { count: num(d.mined.count), firstDate: d.mined.firstDate ?? null, lastDate: d.mined.lastDate ?? null, monthly: Array.isArray(d.mined.monthly) ? d.mined.monthly : [] },
    remaining: typeof d.remaining === 'number' ? d.remaining : null,
    activeJob: parseJobState(d.activeJob), lastJob: parseJobState(d.lastJob),
  };
}

export async function getMiningEstimate(projectId: string, since: string, until: string, signal?: AbortSignal): Promise<MiningEstimate> {
  const query = new URLSearchParams({ since, until });
  const body = await apiRequest<{ data?: MiningEstimate }>(`/projects/${encodeURIComponent(projectId)}/mining/estimate?${query}`, { signal });
  if (!body?.data || typeof body.data.toMine !== 'number') throw new Error('The server returned an invalid estimate.');
  return body.data;
}

const post = (path: string, payload?: unknown) => apiRequest<{ data?: Record<string, any> }>(path, {
  method: 'POST', headers: payload ? { 'Content-Type': 'application/json' } : undefined, body: payload ? JSON.stringify(payload) : undefined,
});
export const startScan = (projectId: string) => post(`/projects/${encodeURIComponent(projectId)}/scan`);
export const startMining = (projectId: string, request: MineRequest) => post(`/projects/${encodeURIComponent(projectId)}/mine`, request);
export const cancelMiningJob = (jobId: string) => post(`/projects/jobs/${encodeURIComponent(jobId)}/cancel`);
