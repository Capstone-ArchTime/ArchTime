import { apiRequest } from '../api/client.ts';

// Organizations as a System Administrator sees them (GET /api/admin/organizations): metadata only. The server never
// sends a project's repository address, description, code, evidence, maps or decisions here, and nothing on this page
// links into an organization's workspaces.

export type AdminPerson = { userId: string; name: string | null; email: string | null };
export type AdminOrganization = {
  id: string; name: string; description: string | null; createdAt: string;
  createdBy: AdminPerson; owners: AdminPerson[]; memberCount: number; projectCount: number;
  /** RF-14: suspended by a System Administrator, with when, by whom and why. */
  status: 'active' | 'suspended';
  suspension: { at: string; by: AdminPerson; reason: string } | null;
};
export type AdminOrganizationProject = { id: string; name: string; status: string; visibility: string; totalCommits: number | null; createdAt: string };
export type AdminOrganizationDetail = AdminOrganization & {
  members: (AdminPerson & { role: string; joinedAt: string })[];
  projects: AdminOrganizationProject[];
};
export type Page<T> = { items: T[]; total: number; page: number; limit: number };

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
const person = (v: unknown): AdminPerson => {
  const p = (v ?? {}) as Record<string, unknown>;
  return { userId: text(p.userId), name: text(p.name) || null, email: text(p.email) || null };
};

export function toAdminOrganization(raw: unknown): AdminOrganization {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: text(o.id), name: text(o.name), description: text(o.description) || null, createdAt: text(o.createdAt),
    createdBy: person(o.createdBy), owners: Array.isArray(o.owners) ? o.owners.map(person) : [],
    memberCount: count(o.memberCount), projectCount: count(o.projectCount),
    ...suspensionOf(o),
  };
}

function suspensionOf(o: Record<string, unknown>): Pick<AdminOrganization, 'status' | 'suspension'> {
  const s = o.suspension as Record<string, unknown> | null | undefined;
  // A server that sends status "suspended" without the details still reads as suspended.
  const suspended = o.status === 'suspended' || !!s;
  return { status: suspended ? 'suspended' : 'active', suspension: suspended && s ? { at: text(s.at), by: person(s.by), reason: text(s.reason) } : null };
}

/** The reason a suspension needs, as the server checks it. */
export const SUSPENSION_REASON = { min: 5, max: 500 } as const;
export function suspensionReasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length < SUSPENSION_REASON.min) return `Give a reason of at least ${SUSPENSION_REASON.min} characters.`;
  if (length > SUSPENSION_REASON.max) return `Keep the reason under ${SUSPENSION_REASON.max} characters.`;
  return null;
}

export function toAdminOrganizationDetail(raw: unknown): AdminOrganizationDetail {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    ...toAdminOrganization(raw),
    members: (Array.isArray(o.members) ? o.members : []).map(m => ({ ...person(m), role: text((m as Record<string, unknown>)?.role), joinedAt: text((m as Record<string, unknown>)?.joinedAt) })),
    // Only the listed fields are kept, whatever else a response may carry.
    projects: (Array.isArray(o.projects) ? o.projects : []).map(p => {
      const r = (p ?? {}) as Record<string, unknown>;
      return { id: text(r.id), name: text(r.name), status: text(r.status), visibility: text(r.visibility), totalCommits: Number.isInteger(r.totalCommits) ? (r.totalCommits as number) : null, createdAt: text(r.createdAt) };
    }),
  };
}

/** "Olivia Owner <olivia@acme.io>", or whatever part is known. */
export function personLabel(p: AdminPerson): string {
  if (p.name && p.email) return `${p.name} <${p.email}>`;
  return p.name ?? p.email ?? 'Deleted account';
}

export async function listAdminOrganizations(params: { search?: string; page: number; limit: number }, signal?: AbortSignal): Promise<Page<AdminOrganization>> {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search?.trim()) qs.set('search', params.search.trim());
  const res = await apiRequest<{ data?: { organizations?: unknown[] }; meta?: { total?: number; page?: number; limit?: number } }>(`/admin/organizations?${qs}`, { signal });
  if (!Array.isArray(res?.data?.organizations)) throw new Error('The server returned an invalid organization list.');
  return {
    items: res.data.organizations.map(toAdminOrganization),
    total: count(res.meta?.total), page: count(res.meta?.page) || params.page, limit: count(res.meta?.limit) || params.limit,
  };
}

export async function getAdminOrganization(id: string, signal?: AbortSignal): Promise<AdminOrganizationDetail> {
  const res = await apiRequest<{ data?: { organization?: unknown } }>(`/admin/organizations/${encodeURIComponent(id)}`, { signal });
  if (!res?.data?.organization) throw new Error('The server returned an invalid organization.');
  return toAdminOrganizationDetail(res.data.organization);
}

/** RF-14, UC-25: closes every workspace of the organization until it is reactivated. Nothing is deleted. */
export async function suspendOrganization(id: string, reason: string): Promise<AdminOrganizationDetail> {
  const res = await apiRequest<{ data?: { organization?: unknown } }>(`/admin/organizations/${encodeURIComponent(id)}/suspend`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
  if (!res?.data?.organization) throw new Error('The server did not confirm the suspension.');
  return toAdminOrganizationDetail(res.data.organization);
}

export async function reactivateOrganization(id: string): Promise<AdminOrganizationDetail> {
  const res = await apiRequest<{ data?: { organization?: unknown } }>(`/admin/organizations/${encodeURIComponent(id)}/reactivate`, { method: 'POST' });
  if (!res?.data?.organization) throw new Error('The server did not confirm the reactivation.');
  return toAdminOrganizationDetail(res.data.organization);
}
