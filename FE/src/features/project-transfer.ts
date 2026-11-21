import { apiRequest } from '../api/client.ts';
import { hx } from './helper-messages.ts';

// Moving a personal workspace into an organization (RF-11, UC-29). Its history, evidence, diagram and paths go with it;
// the server answers what the move would do first: MSG18 when the organization already has the repository, and who
// would lose access (organization workspaces are visible to organization members only).

export interface TransferPreview {
  project: { id: string; name: string; repoUrl: string };
  organization: { id: string; name: string };
  duplicate: { id: string; name: string } | null;
  membersLosingAccess: { userId: string; name: string; email: string; role: string }[];
}

/** Why the move cannot go ahead, worded for people (MSG18); null when it can. */
export function transferBlocker(preview: TransferPreview): string | null {
  return preview.duplicate
    ? hx('duplicate', { org: preview.organization.name, name: preview.duplicate.name })
    : null;
}

/** The warning to confirm before moving, or null when nobody loses access. */
export function accessWarning(preview: TransferPreview): string | null {
  const n = preview.membersLosingAccess.length;
  if (!n) return null;
  return hx('losing', { count: n, org: preview.organization.name, names: preview.membersLosingAccess.map(m => m.name || m.email).join(', ') });
}

const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/transfer`;

export async function previewTransfer(projectId: string, organizationId: string, signal?: AbortSignal): Promise<TransferPreview> {
  return (await apiRequest<{ data: TransferPreview }>(`${path(projectId)}?organizationId=${encodeURIComponent(organizationId)}`, { signal })).data;
}

export async function transferProject(projectId: string, organizationId: string): Promise<void> {
  await apiRequest(path(projectId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId }) });
}
