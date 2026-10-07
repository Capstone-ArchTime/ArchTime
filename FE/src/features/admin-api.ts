import { apiRequest } from '@/api/client';

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
