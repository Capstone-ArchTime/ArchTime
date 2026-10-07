import { apiRequest } from '@/api/client';
import { getAdminModels, getLlmUsage, getUserModels, setDefaultAdminModel } from '@/features/llm-api';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'developer-analyst' | 'project-maintainer' | 'system-administrator';
  status: 'active' | 'suspended' | 'invited';
  lastActive?: string;
  createdAt?: string;
}

export interface AdminUsersResponse {
  data: {
    users: AdminUser[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface AdminAuditLog {
  id: string;
  type: string;
  actor: string;
  target?: string;
  description: string;
  ip?: string;
  timestamp: string;
}

export interface AdminAuditLogsResponse {
  data: {
    logs: AdminAuditLog[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface AdminSettings {
  maxConcurrentJobs: number;
  maxRepoSizeGb: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AdminSettingsResponse {
  data: AdminSettings;
}

export interface AdminMetrics {
  cpu?: number;
  memory?: number;
  storage?: number;
  queueCapacity?: number;
}

export interface AdminMetricsResponse {
  data: AdminMetrics;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
}

export interface ServicesStatusResponse {
  data: {
    services: ServiceStatus[];
  };
}

export async function getAdminUsers(
  params?: { query?: string; role?: string; status?: string; page?: number; limit?: number },
  signal?: AbortSignal
): Promise<AdminUsersResponse> {
  const searchParams = new URLSearchParams();
  if (params?.query) searchParams.set('query', params.query);
  if (params?.role && params.role !== 'all') searchParams.set('role', params.role);
  if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return apiRequest<AdminUsersResponse>(`/admin/users${qs ? `?${qs}` : ''}`, { signal });
}

export async function inviteUser(
  data: { name: string; email: string; role: string },
  signal?: AbortSignal
): Promise<{ data: { user: AdminUser } }> {
  return apiRequest('/admin/users/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export async function updateUserRole(
  userId: string,
  role: string,
  signal?: AbortSignal
): Promise<{ data: { user: AdminUser } }> {
  return apiRequest(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
    signal,
  });
}

export async function suspendUser(
  userId: string,
  reason?: string,
  signal?: AbortSignal
): Promise<{ data: { user: AdminUser } }> {
  return apiRequest(`/admin/users/${userId}/suspend`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
    signal,
  });
}

export async function reactivateUser(
  userId: string,
  signal?: AbortSignal
): Promise<{ data: { user: AdminUser } }> {
  return apiRequest(`/admin/users/${userId}/reactivate`, {
    method: 'PATCH',
    signal,
  });
}

export async function getAdminAuditLogs(
  params?: { query?: string; type?: string; from?: string; to?: string; page?: number; limit?: number },
  signal?: AbortSignal
): Promise<AdminAuditLogsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.query) searchParams.set('query', params.query);
  if (params?.type && params.type !== 'all') searchParams.set('type', params.type);
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return apiRequest<AdminAuditLogsResponse>(`/admin/audit-logs${qs ? `?${qs}` : ''}`, { signal });
}

export async function getAdminSettings(signal?: AbortSignal): Promise<AdminSettingsResponse> {
  return apiRequest<AdminSettingsResponse>('/admin/settings', { signal });
}

export async function updateAdminSettings(
  settings: Partial<AdminSettings>,
  signal?: AbortSignal
): Promise<AdminSettingsResponse> {
  return apiRequest('/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    signal,
  });
}

export async function getAdminMetrics(signal?: AbortSignal): Promise<AdminMetricsResponse> {
  return apiRequest<AdminMetricsResponse>('/admin/metrics', { signal });
}

export async function getServicesStatus(signal?: AbortSignal): Promise<ServicesStatusResponse> {
  return apiRequest<ServicesStatusResponse>('/admin/services/status', { signal });
}

// AI Model Health
// Backed by the model registry and run records (see features/llm-api.ts and docs/ai-model-metrics-design.md).
export interface AIModelUsage {
  /** Registry id; null for the model configured in the server's .env when no model is registered. */
  id: string | null;
  /** Name shown in the UI (the model's display name). */
  model: string;
  provider: string;
  /** Tokens used this month. */
  tokensUsed: number;
  /** There is no token quota per model; 0 means none. */
  tokensLimit: number;
  /** Cost this month, at the prices set under AI Models. */
  costUsd: number;
  requestsToday: number;
  /** Average model latency of this month's runs; the last health check when there were none. */
  avgLatencyMs: number;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  lastChecked: string;
}

export interface AIModelsHealthResponse {
  data: {
    models: AIModelUsage[];
    defaultModel: string;
    totalCostUsd: number;
    totalTokensUsed: number;
  };
}

export interface AIModelConfig {
  model: string;
  provider: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface AIModelsConfigResponse {
  data: {
    models: AIModelConfig[];
  };
}

const HEALTH: Record<string, AIModelUsage['status']> = { up: 'healthy', degraded: 'degraded', down: 'down', unknown: 'unknown' };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const usageKey = (key: unknown) => {
  const k = key as { modelId?: string | null; model?: string } | null;
  return k?.modelId ? k.modelId : `env:${k?.model ?? ''}`;
};

/** Every model with this month's tokens and cost and today's request count. Administrators only. */
export async function getAIModelsHealth(signal?: AbortSignal): Promise<AIModelsHealthResponse> {
  const now = new Date();
  const monthStart = isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const [list, month, today] = await Promise.all([
    getAdminModels(signal),
    getLlmUsage({ from: monthStart, groupBy: 'model' }, signal),
    getLlmUsage({ from: isoDay(now), groupBy: 'model' }, signal),
  ]);
  const monthBy = new Map(month.rows.map(r => [usageKey(r.key), r]));
  const todayBy = new Map(today.rows.map(r => [usageKey(r.key), r]));
  const models: AIModelUsage[] = list.models.map(m => {
    const u = monthBy.get(m.id);
    return {
      id: m.id, model: m.displayName, provider: m.provider,
      tokensUsed: u?.totalTokens ?? 0, tokensLimit: 0, costUsd: u?.cost ?? 0,
      requestsToday: todayBy.get(m.id)?.runs ?? 0,
      avgLatencyMs: Math.round(u?.avgLatencyMs ?? m.health?.latencyMs ?? 0),
      status: HEALTH[m.health?.status ?? 'unknown'] ?? 'unknown',
      lastChecked: m.health?.checkedAt ?? '',
    };
  });
  // Nothing registered yet: the server's configured model is what every request uses.
  if (!models.length && list.serverConfig.enabled && list.serverConfig.model) {
    const u = monthBy.get(`env:${list.serverConfig.model}`);
    models.push({
      id: null, model: list.serverConfig.model, provider: list.serverConfig.provider ?? '',
      tokensUsed: u?.totalTokens ?? 0, tokensLimit: 0, costUsd: u?.cost ?? 0,
      requestsToday: todayBy.get(`env:${list.serverConfig.model}`)?.runs ?? 0,
      avgLatencyMs: Math.round(u?.avgLatencyMs ?? 0), status: 'unknown', lastChecked: '',
    });
  }
  const defaultModel = list.models.find(m => m.id === list.defaultModelId) ?? list.models.find(m => m.isDefault);
  return {
    data: {
      models,
      defaultModel: defaultModel?.displayName ?? list.serverConfig.model ?? '',
      totalCostUsd: month.totals.cost ?? 0,
      totalTokensUsed: month.totals.totalTokens ?? 0,
    },
  };
}

/** The models the signed-in user may pick, with the default flagged. Works for every role. */
export async function getAIModelsConfig(signal?: AbortSignal): Promise<AIModelsConfigResponse> {
  const list = await getUserModels(undefined, undefined, signal);
  const models: AIModelConfig[] = list.models.map(m => ({ model: m.displayName, provider: m.provider, enabled: true, isDefault: m.id === list.defaultModelId }));
  if (!models.length && list.serverDefault?.enabled && list.serverDefault.model) {
    models.push({ model: list.serverDefault.model, provider: '', enabled: true, isDefault: true });
  }
  return { data: { models } };
}

/** Makes a registered model the default. `model` is its id, key or display name. */
export async function setDefaultAIModel(model: string, signal?: AbortSignal): Promise<void> {
  const list = await getAdminModels(signal);
  const target = list.models.find(m => m.id === model || m.key === model || m.displayName === model);
  if (!target) throw new Error(`"${model}" is not a registered model. Add it under AI Models first.`);
  await setDefaultAdminModel(target.id);
}
