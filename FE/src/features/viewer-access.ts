import { apiRequest } from '../api/client.ts';

// What signed-in people outside a public personal workspace may do (UC-16, BR-17). The owner changes it; the server checks
// every rule again. Server: GET / PATCH /projects/:id/viewer-access.

export type ViewerAccess = { publicRead: boolean; allowChat: boolean; dailyLimit: number };
export const DEFAULT_VIEWER_ACCESS: ViewerAccess = { publicRead: true, allowChat: false, dailyLimit: 10 };
export const MAX_DAILY_LIMIT = 200;

export function parseViewerAccess(raw: unknown): ViewerAccess {
  const v = (raw ?? {}) as Record<string, unknown>;
  const limit = Number(v.dailyLimit);
  return {
    publicRead: typeof v.publicRead === 'boolean' ? v.publicRead : DEFAULT_VIEWER_ACCESS.publicRead,
    allowChat: typeof v.allowChat === 'boolean' ? v.allowChat : DEFAULT_VIEWER_ACCESS.allowChat,
    dailyLimit: Number.isInteger(limit) && limit >= 1 ? limit : DEFAULT_VIEWER_ACCESS.dailyLimit,
  };
}

const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/viewer-access`;

export async function getViewerAccess(projectId: string, signal?: AbortSignal): Promise<ViewerAccess> {
  const body = await apiRequest<{ data?: { viewerAccess?: unknown } }>(path(projectId), { signal });
  return parseViewerAccess(body?.data?.viewerAccess);
}

export async function saveViewerAccess(projectId: string, access: ViewerAccess): Promise<ViewerAccess> {
  const body = await apiRequest<{ data?: { viewerAccess?: unknown } }>(path(projectId), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(access),
  });
  return parseViewerAccess(body?.data?.viewerAccess);
}
