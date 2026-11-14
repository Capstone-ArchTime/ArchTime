import { apiRequest } from '../api/client.ts';

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
    ? `${preview.organization.name} already has a workspace for this repository ("${preview.duplicate.name}"). Use that workspace, or delete one of them first.`
    : null;
}

/** The warning to confirm before moving, or null when nobody loses access. */
export function accessWarning(preview: TransferPreview): string | null {
  const n = preview.membersLosingAccess.length;
  if (!n) return null;
  return `${n} member${n === 1 ? '' : 's'} of this workspace ${n === 1 ? 'is' : 'are'} not in ${preview.organization.name} and will lose access: ${preview.membersLosingAccess.map(m => m.name || m.email).join(', ')}. Invite them to the organization to keep them.`;
}

const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/transfer`;

export async function previewTransfer(projectId: string, organizationId: string, signal?: AbortSignal): Promise<TransferPreview> {
  return (await apiRequest<{ data: TransferPreview }>(`${path(projectId)}?organizationId=${encodeURIComponent(organizationId)}`, { signal })).data;
}

export async function transferProject(projectId: string, organizationId: string): Promise<void> {
  await apiRequest(path(projectId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId }) });
}
