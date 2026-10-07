import { apiRequest } from '@/api/client';

// Models for drawing architectures, their usage and how they compare. Server: BE/src/presentation/routes/llm.routes.ts
// (users) and admin.routes.ts (/admin/llm-*). Formulas: docs/ai-model-metrics-design.md.

export type LlmProvider = 'anthropic' | 'gemini' | 'openai-compatible';
export type HealthStatus = 'unknown' | 'up' | 'degraded' | 'down';
export interface Pricing { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok?: number; currency: string }
export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens?: number; reasoningTokens?: number; totalTokens: number; estimated?: boolean }

export interface UserModelOption {
  id: string; key: string; displayName: string; provider: string; model: string; host: string; external: boolean;
  pricing: Pricing; health: HealthStatus; isDefault: boolean; recommended: boolean;
  score: { value: number; confident: boolean; runs: number; successRate: number; quality: number } | null;
  estimate: { tokens: number; cost: number; basedOnRuns: number } | null;
}
export interface UserModels {
  models: UserModelOption[];
  defaultModelId: string | null;
  recommendedModelId: string | null;
  allowUserModelChoice: boolean;
  mode: 'refine' | 'name-only' | null;
  files: number | null;
  serverDefault: { enabled: boolean; model: string | null; host: string | null; external: boolean } | null;
}

export interface RunQuality {
  score: number; pass: number; V: number; M: number; R: number; E: number; B: number; errors: number; warnings: number; attemptsUsed: number; components: number; movedRatio?: number;
  /** v2: grounding, acyclicity, layering, balance; agreement with the reference and stability vs the previous snapshot (ARI). */
  version?: number; G?: number; C?: number; L?: number; Bal?: number; ungrounded?: string[]; cycles?: number; layerViolations?: number; agreement?: number; stability?: number;
}
export interface LlmRun {
  id: string; project: { id: string; name?: string }; snapshotId?: string; modelId: string | null; modelKey: string; provider: string; model: string;
  purpose: 'user' | 'benchmark'; mode: 'refine' | 'name-only'; filesSent: number; status: 'accepted' | 'fallback' | 'failed' | 'cancelled';
  errorKind?: string; fallbackReason?: string; usage: Usage; latencyMs: number; wallMs: number; cost: { amount: number; currency: string };
  quality: RunQuality; attempts: { n: number; ok: boolean; issueCodes: string[]; inputTokens: number; outputTokens: number; latencyMs: number; errorKind?: string }[];
  feedback: { rating: 0 | 1 } | null; createdAt: string;
}
export interface RunTotals { runs: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }
export interface PageMeta { page: number; limit: number; total: number; totalPages: number }

type Envelope<T> = { data?: T; meta?: PageMeta };
const data = <T>(body: Envelope<T> | undefined, what: string): T => {
  if (!body?.data || typeof body.data !== 'object') throw new Error(`The server returned an invalid ${what}.`);
  return body.data;
};
const query = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

// ── users ──

/** The model a request will use: the user's pick, else the administrator's default. */
export function selectedModel(models: UserModels | null, choice: string | undefined): UserModelOption | undefined {
  if (!models) return undefined;
  return models.models.find(m => m.id === (choice ?? models.defaultModelId ?? undefined));
}

export async function getUserModels(projectId?: string, snapshotId?: string, signal?: AbortSignal): Promise<UserModels> {
  const d = data(await apiRequest<Envelope<UserModels>>(`/llm/models${query({ projectId, snapshotId })}`, { signal }), 'model list');
  if (!Array.isArray(d.models)) throw new Error('The server returned an invalid model list.');
  return d;
}

export async function getMyRuns(params: { projectId?: string; page?: number; limit?: number }, signal?: AbortSignal) {
  const body = await apiRequest<Envelope<{ runs: LlmRun[]; totals: RunTotals }>>(`/llm/runs/me${query(params)}`, { signal });
  const d = data(body, 'run list');
  if (!Array.isArray(d.runs)) throw new Error('The server returned an invalid run list.');
  return { ...d, meta: body.meta ?? { page: 1, limit: d.runs.length, total: d.runs.length, totalPages: 1 } };
}

export async function sendRunFeedback(runId: string, rating: 0 | 1) {
  return data(await apiRequest<Envelope<{ run: LlmRun }>>(`/llm/runs/${encodeURIComponent(runId)}/feedback`, json('POST', { rating })), 'run').run;
}

// ── administrators ──

export interface AdminModel {
  id: string; key: string; displayName: string; provider: LlmProvider; model: string; baseUrl?: string;
  hasApiKey: boolean; apiKeyLast4: string | null;
  options: { effort?: 'low' | 'medium' | 'high'; maxTokens?: number; temperature?: number | null; jsonMode?: boolean; timeoutMs?: number; maxRequestTokens?: number };
  pricing: Pricing; enabled: boolean; visibleToUsers: boolean; isDefault: boolean;
  health: { status: HealthStatus; checkedAt?: string; latencyMs?: number; lastError?: string };
  host: string; external: boolean;
  usage30d: { runs: number; totalTokens: number; cost: number; lastRunAt: string | null };
  createdAt: string; updatedAt: string;
}
export interface AdminModelList {
  models: AdminModel[];
  defaultModelId: string | null;
  allowUserModelChoice: boolean;
  scoring: { preset: ScorePreset; windowDays: number; weights?: ScoreWeights };
  serverConfig: { enabled: boolean; provider: string | null; model: string | null; host: string | null; reason?: string };
}
export interface ModelInput {
  key?: string; displayName: string; provider: LlmProvider; model: string; baseUrl?: string | null; apiKey?: string | null;
  pricing?: Partial<Pricing>; options?: AdminModel['options']; enabled?: boolean; visibleToUsers?: boolean; isDefault?: boolean;
  /** Copy the stored API key of this registered model instead of sending one. */
  apiKeyFrom?: string;
}

export interface DiscoveredModel {
  id: string; name?: string; ownedBy?: string; contextWindow?: number;
  chat: boolean; reason?: string; free: boolean; pricing?: { inputPerMTok: number; outputPerMTok: number }; registered: boolean;
}
/** Asks a provider which models a key can use. The key is used for this request only. */
export const discoverModels = async (input: { provider: LlmProvider; baseUrl?: string; apiKey?: string; fromModelId?: string }) =>
  data(await apiRequest<Envelope<{ models: DiscoveredModel[] }>>('/admin/llm-models/discover', json('POST', input)), 'model list').models;

/** Providers with a ready-made configuration. Free tiers change; the hint says what was true when this was written. */
export interface ProviderPreset { id: string; label: string; provider: LlmProvider; baseUrl?: string; keyUrl?: string; keyOptional?: boolean; hint: string }
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'groq', label: 'Groq', provider: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', hint: 'Free tier with rate limits. Very fast Llama, Qwen and gpt-oss models.' },
  { id: 'gemini', label: 'Google Gemini', provider: 'gemini', keyUrl: 'https://aistudio.google.com/apikey', hint: 'Free tier with daily limits (Google AI Studio key).' },
  { id: 'openrouter', label: 'OpenRouter', provider: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', hint: 'Hundreds of models; those ending in ":free" cost nothing.' },
  { id: 'cerebras', label: 'Cerebras', provider: 'openai-compatible', baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai', hint: 'Free tier with rate limits.' },
  { id: 'mistral', label: 'Mistral', provider: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys', hint: 'Free "Experiment" plan.' },
  { id: 'ollama', label: 'Ollama (this machine)', provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', keyOptional: true, hint: 'Free and private: nothing leaves this machine. Pull a model first, e.g. "ollama pull llama3.1".' },
  { id: 'anthropic', label: 'Anthropic Claude', provider: 'anthropic', keyUrl: 'https://console.anthropic.com/settings/keys', hint: 'Paid (prepaid credit).' },
  { id: 'custom', label: 'Other OpenAI-compatible server', provider: 'openai-compatible', keyOptional: true, hint: 'Any server that speaks /v1/chat/completions. Base URL usually ends with /v1.' },
];
export const presetFor = (provider: string, baseUrl?: string) =>
  PROVIDER_PRESETS.find(p => p.provider === provider && (p.baseUrl ?? '') === (baseUrl ?? '').replace(/\/+$/, '')) ?? PROVIDER_PRESETS.find(p => p.provider === provider && provider !== 'openai-compatible');

export const getAdminModels = async (signal?: AbortSignal) => data(await apiRequest<Envelope<AdminModelList>>('/admin/llm-models', { signal }), 'model list');
export const createAdminModel = async (input: ModelInput) => data(await apiRequest<Envelope<{ model: AdminModel }>>('/admin/llm-models', json('POST', input)), 'model').model;
export const updateAdminModel = async (id: string, input: Partial<ModelInput>) => data(await apiRequest<Envelope<{ model: AdminModel }>>(`/admin/llm-models/${id}`, json('PATCH', input)), 'model').model;
export const deleteAdminModel = async (id: string) => data(await apiRequest<Envelope<{ deleted: boolean; archived: boolean }>>(`/admin/llm-models/${id}`, { method: 'DELETE' }), 'result');
export const setDefaultAdminModel = async (id: string) => data(await apiRequest<Envelope<{ model: AdminModel }>>(`/admin/llm-models/${id}/default`, json('POST')), 'model').model;

export interface HealthResult { status: HealthStatus; latencyMs: number; usage: Usage | null; error?: string; checkedAt: string }
export const testAdminModel = async (id: string) => data(await apiRequest<Envelope<HealthResult>>(`/admin/llm-models/${id}/test`, json('POST')), 'health check');
export const testAllAdminModels = async () => data(await apiRequest<Envelope<{ results: (HealthResult & { id: string })[] }>>('/admin/llm-models/test-all', json('POST')), 'health check').results;

export async function updateLlmSettings(patch: { allowUserModelChoice?: boolean; scoring?: { preset?: ScorePreset; windowDays?: number; weights?: ScoreWeights } }) {
  return apiRequest('/admin/settings', json('PUT', patch));
}

export type ScorePreset = 'balanced' | 'quality' | 'budget' | 'custom';
export interface ScoreWeights { quality: number; stability: number; latency: number; cost: number; tokens: number }
export interface UsageRow { key: unknown; runs: number; accepted: number; failed: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number; avgLatencyMs: number; user?: { id: string; name?: string; email?: string } }
export interface UsageReport { totals: Omit<UsageRow, 'key' | 'user'>; groupBy: 'day' | 'model' | 'user'; rows: UsageRow[] }
export const getLlmUsage = async (params: { from?: string; to?: string; modelId?: string; userId?: string; groupBy?: 'day' | 'model' | 'user' }, signal?: AbortSignal) =>
  data(await apiRequest<Envelope<UsageReport>>(`/admin/llm-usage${query(params)}`, { signal }), 'usage report');

export interface ModelStats {
  n: number; accepted: number; successRate: number; firstPassRate: number; providerErrorRate: number; qualityMean: number;
  latencyPer100: number; tokensPer100: number; latencyP95Ms: number; latencyCV: number; costPerSuccess: number | null; totalCost: number; totalTokens: number;
  groundingMean?: number | null; agreementMean?: number | null; stabilityMean?: number | null;
}
export interface LeaderboardRow {
  id: string; modelId: string | null; key: string; displayName: string; provider: string; model: string; enabled: boolean; health: HealthStatus;
  stats: ModelStats; score: number; components: ScoreWeights; confident: boolean; eligible: boolean; reasons: string[]; recommended: boolean;
}
export interface Leaderboard { windowDays: number; mode: string | null; purpose: string; preset: ScorePreset; weights: ScoreWeights; rows: LeaderboardRow[]; recommendedModelId: string | null }
export const getLeaderboard = async (params: { mode?: string; windowDays?: number; purpose?: string; preset?: string }, signal?: AbortSignal) =>
  data(await apiRequest<Envelope<Leaderboard>>(`/admin/llm-models/leaderboard${query(params)}`, { signal }), 'leaderboard');

export interface BenchmarkTarget { id: string; name: string; snapshots: { id: string; hash: string; title: string; date: string; files: number }[] }
export interface BenchmarkSummary { id: string; projectId: string; projectName: string | null; snapshotId: string; startedAt: string; runs: number; models: string[]; jobId?: string }
export interface BenchmarkDetail {
  id: string; projectId: string; snapshotId: string;
  runs: Pick<LlmRun, 'id' | 'modelId' | 'model' | 'provider' | 'status' | 'usage' | 'latencyMs' | 'cost' | 'quality' | 'fallbackReason' | 'createdAt'>[];
  leaderboard: Leaderboard;
}
export const getBenchmarkTargets = async (signal?: AbortSignal) => data(await apiRequest<Envelope<{ projects: BenchmarkTarget[] }>>('/admin/llm-benchmarks/targets', { signal }), 'project list').projects;
export const getBenchmarks = async (signal?: AbortSignal) => data(await apiRequest<Envelope<{ benchmarks: BenchmarkSummary[] }>>('/admin/llm-benchmarks', { signal }), 'benchmark list').benchmarks;
export const getBenchmark = async (id: string, signal?: AbortSignal) => data(await apiRequest<Envelope<BenchmarkDetail>>(`/admin/llm-benchmarks/${encodeURIComponent(id)}`, { signal }), 'benchmark');
export const startBenchmark = async (input: { projectId: string; snapshotId: string; modelIds: string[] }) =>
  data(await apiRequest<Envelope<{ jobId: string; benchmarkId: string }>>('/admin/llm-benchmarks', json('POST', input)), 'benchmark');

// ── formatting ──

export const formatTokens = (n: number | undefined | null) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '–');
export const formatCompactTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n)));
export function formatCost(amount: number | undefined | null, currency = 'USD') {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '–';
  if (amount === 0) return 'Free';
  const digits = amount < 0.01 ? 4 : amount < 1 ? 3 : 2;
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toFixed(digits)}`;
}
export const formatMs = (ms: number | undefined | null) => (typeof ms !== 'number' || !Number.isFinite(ms) ? '–' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
export const formatPercent = (x: number | undefined | null) => (typeof x === 'number' && Number.isFinite(x) ? `${Math.round(x * 100)}%` : '–');
export const healthColor: Record<HealthStatus, string> = { up: 'green', degraded: 'orange', down: 'red', unknown: 'default' };
export const statusColor: Record<LlmRun['status'], string> = { accepted: 'green', fallback: 'orange', failed: 'red', cancelled: 'default' };
export const statusLabel: Record<LlmRun['status'], string> = { accepted: 'Accepted', fallback: 'Fell back', failed: 'Failed', cancelled: 'Cancelled' };
