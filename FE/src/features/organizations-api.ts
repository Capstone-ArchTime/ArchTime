import { apiRequest } from '../api/client.ts';

// Organizations, their members and their repository credentials.
// Server: BE/src/presentation/routes/organization.routes.ts. The server checks every rule below again; the checks here
// only spare a round trip and decide which buttons to show.

export type OrganizationRole = 'owner' | 'member';
export type CredentialProvider = 'github' | 'gitlab' | 'bitbucket' | 'other';

export type Organization = { id: string; name: string; description: string; myRole: OrganizationRole; memberCount: number; createdAt: string | null };
/** `invited`: the person has not accepted yet and has no access (UC-28). Only owners see invited rows. */
export type MemberStatus = 'invited' | 'active';
export type OrganizationMember = { id: string; userId: string; name: string; email: string; role: OrganizationRole; status: MemberStatus; createdAt: string | null };
export type OrganizationInvitation = { organizationId: string; organizationName: string; role: OrganizationRole; invitedBy: string | null; invitedAt: string | null };
export type Credential = {
  id: string; name: string; provider: CredentialProvider; last4: string; usedBy: number;
  rotatedAt: string | null; lastUsedAt: string | null; createdAt: string | null;
};

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 500;
export const CREDENTIAL_NAME_MAX = 80;
export const TOKEN_MIN = 8;
export const TOKEN_MAX = 1024;
export const PROVIDERS: { value: CredentialProvider; label: string }[] = [
  { value: 'github', label: 'GitHub' }, { value: 'gitlab', label: 'GitLab' }, { value: 'bitbucket', label: 'Bitbucket' }, { value: 'other', label: 'Other' },
];

type Envelope<T> = { data?: T };
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const date = (v: unknown) => (typeof v === 'string' && v ? v : null);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const base = (orgId: string) => `/organizations/${encodeURIComponent(orgId)}`;

function pick<T>(body: Envelope<Record<string, unknown>> | undefined, key: string, what: string): T {
  const value = body?.data?.[key];
  if (value === undefined || value === null) throw new Error(`The server returned an invalid ${what}.`);
  return value as T;
}

const toOrganization = (o: any): Organization => ({
  id: str(o.id), name: str(o.name), description: str(o.description), myRole: o.myRole === 'owner' ? 'owner' : 'member',
  memberCount: Number(o.memberCount) || 0, createdAt: date(o.createdAt),
});
const toMember = (m: any): OrganizationMember => ({
  id: str(m.id), userId: str(m.userId), name: str(m.name), email: str(m.email), role: m.role === 'owner' ? 'owner' : 'member',
  status: m.status === 'invited' ? 'invited' : 'active', createdAt: date(m.createdAt),
});
const toCredential = (c: any): Credential => ({
  id: str(c.id), name: str(c.name), provider: (PROVIDERS.some(p => p.value === c.provider) ? c.provider : 'other') as CredentialProvider,
  last4: str(c.last4), usedBy: Number(c.usedBy) || 0, rotatedAt: date(c.rotatedAt), lastUsedAt: date(c.lastUsedAt), createdAt: date(c.createdAt),
});

// ── Organizations ──

export async function listOrganizations(signal?: AbortSignal): Promise<Organization[]> {
  const list = pick<unknown[]>(await apiRequest('/organizations', { signal }), 'organizations', 'list of organizations');
  if (!Array.isArray(list)) throw new Error('The server returned an invalid list of organizations.');
  return list.map(toOrganization);
}

export async function getOrganization(orgId: string, signal?: AbortSignal): Promise<Organization> {
  return toOrganization(pick(await apiRequest(base(orgId), { signal }), 'organization', 'organization'));
}

export async function createOrganization(input: { name: string; description?: string }): Promise<Organization> {
  return toOrganization(pick(await apiRequest('/organizations', json('POST', input)), 'organization', 'organization'));
}

/** Owners only. Returns the organization without the caller's role, so the caller keeps the role it already knows. */
export async function updateOrganization(orgId: string, patch: { name?: string; description?: string }): Promise<Pick<Organization, 'name' | 'description'>> {
  const o = pick<any>(await apiRequest(base(orgId), json('PATCH', patch)), 'organization', 'organization');
  return { name: str(o.name), description: str(o.description) };
}

// ── Members ──

export async function listMembers(orgId: string, signal?: AbortSignal): Promise<OrganizationMember[]> {
  const list = pick<unknown[]>(await apiRequest(`${base(orgId)}/members`, { signal }), 'members', 'list of members');
  return (Array.isArray(list) ? list : []).map(toMember);
}

/** Invites an existing account by email; it becomes a member after accepting. People without an account have to register first. */
export async function addMember(orgId: string, input: { email: string; role: OrganizationRole }): Promise<OrganizationMember> {
  return toMember(pick(await apiRequest(`${base(orgId)}/members`, json('POST', input)), 'member', 'member'));
}

export async function updateMemberRole(orgId: string, memberId: string, role: OrganizationRole): Promise<void> {
  await apiRequest(`${base(orgId)}/members/${encodeURIComponent(memberId)}`, json('PATCH', { role }));
}

/** Removes a member (owners), or leaves (anyone, with their own membership id). Their roles in the organization's workspaces go too. */
export async function removeMember(orgId: string, memberId: string): Promise<{ removedProjectMemberships: number; cancelledInvitations: number }> {
  const body = await apiRequest<Envelope<{ removedProjectMemberships?: number; cancelledInvitations?: number }>>(`${base(orgId)}/members/${encodeURIComponent(memberId)}`, json('DELETE'));
  return {
    removedProjectMemberships: Number(body?.data?.removedProjectMemberships) || 0,
    cancelledInvitations: Number(body?.data?.cancelledInvitations) || 0,
  };
}

// ── AI cost per workspace (owners, UC-30) ──

export type AiCostRow = { projectId: string; projectName: string; runs: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number; currency: string };
export type AiCostReport = { projects: AiCostRow[]; total: Omit<AiCostRow, 'projectId' | 'projectName'> };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toCost = (r: any): Omit<AiCostRow, 'projectId' | 'projectName'> => ({
  runs: num(r?.runs), inputTokens: num(r?.inputTokens), outputTokens: num(r?.outputTokens), totalTokens: num(r?.totalTokens),
  cost: num(r?.cost), currency: str(r?.currency) || 'USD',
});

/** `from` and `to` are days (YYYY-MM-DD); both are optional and inclusive. */
export async function getAiCost(orgId: string, period: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<AiCostReport> {
  const q = new URLSearchParams();
  if (period.from) q.set('from', period.from);
  if (period.to) q.set('to', period.to);
  const body = await apiRequest<Envelope<{ projects?: unknown[]; total?: unknown }>>(`${base(orgId)}/ai-cost${q.size ? `?${q}` : ''}`, { signal });
  const projects = Array.isArray(body?.data?.projects) ? body.data.projects : [];
  return {
    projects: projects.map((p: any) => ({ projectId: str(p.projectId), projectName: str(p.projectName), ...toCost(p) })),
    total: toCost(body?.data?.total),
  };
}

// ── Invitations to the signed-in account ──

export async function listMyInvitations(signal?: AbortSignal): Promise<OrganizationInvitation[]> {
  const list = pick<unknown[]>(await apiRequest('/organizations/invitations', { signal }), 'invitations', 'list of invitations');
  return (Array.isArray(list) ? list : []).map((i: any) => ({
    organizationId: str(i.organizationId), organizationName: str(i.organizationName), role: i.role === 'owner' ? 'owner' : 'member',
    invitedBy: typeof i.invitedBy === 'string' && i.invitedBy ? i.invitedBy : null, invitedAt: date(i.invitedAt),
  }));
}

export async function answerInvitation(orgId: string, accept: boolean): Promise<void> {
  await apiRequest(`${base(orgId)}/invitation/${accept ? 'accept' : 'decline'}`, json('POST'));
}

// ── Credentials (owners only) ──

export async function listCredentials(orgId: string, signal?: AbortSignal): Promise<Credential[]> {
  const list = pick<unknown[]>(await apiRequest(`${base(orgId)}/credentials`, { signal }), 'credentials', 'list of credentials');
  return (Array.isArray(list) ? list : []).map(toCredential);
}

export async function createCredential(orgId: string, input: { name: string; provider: CredentialProvider; token: string }): Promise<Credential> {
  return toCredential(pick(await apiRequest(`${base(orgId)}/credentials`, json('POST', input)), 'credential', 'credential'));
}

export async function rotateCredential(orgId: string, credentialId: string, token: string): Promise<Credential> {
  return toCredential(pick(await apiRequest(`${base(orgId)}/credentials/${encodeURIComponent(credentialId)}`, json('PUT', { token })), 'credential', 'credential'));
}

export async function deleteCredential(orgId: string, credentialId: string): Promise<void> {
  await apiRequest(`${base(orgId)}/credentials/${encodeURIComponent(credentialId)}`, json('DELETE'));
}

// ── Checks shared with the forms ──

export function checkOrganizationName(value: string): string | null {
  const n = value.trim().length;
  return n < NAME_MIN || n > NAME_MAX ? `Use ${NAME_MIN} to ${NAME_MAX} characters.` : null;
}

export function checkDescription(value: string): string | null {
  return value.trim().length > DESCRIPTION_MAX ? `Use at most ${DESCRIPTION_MAX} characters.` : null;
}

export function checkEmail(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : 'Enter a valid email address.';
}

export function checkCredentialName(value: string): string | null {
  const n = value.trim().length;
  return n < 1 || n > CREDENTIAL_NAME_MAX ? `Use 1 to ${CREDENTIAL_NAME_MAX} characters.` : null;
}

export function checkToken(value: string): string | null {
  const t = value.trim();
  if (/\s/.test(t)) return 'A token has no spaces.';
  return t.length < TOKEN_MIN || value.length > TOKEN_MAX ? `Use ${TOKEN_MIN} to ${TOKEN_MAX} characters.` : null;
}

/** The only owner cannot be demoted or removed: an organization always keeps one. */
export const isLastOwner = (members: OrganizationMember[], member: OrganizationMember) =>
  member.status !== 'invited' && member.role === 'owner' && members.filter(m => m.role === 'owner' && m.status !== 'invited').length <= 1;

export interface MemberActions { changeRole: boolean; remove: boolean; leave: boolean; reason?: string }

/** What the signed-in account may do to a member row. */
export function memberActions(members: OrganizationMember[], member: OrganizationMember, me: { userId: string; role: OrganizationRole }): MemberActions {
  const self = member.userId === me.userId;
  const last = isLastOwner(members, member);
  const reason = last ? 'An organization needs at least one owner. Make someone else an owner first.' : undefined;
  return {
    changeRole: me.role === 'owner' && !last,
    remove: me.role === 'owner' && !self && !last,
    leave: self && !last,
    ...(reason ? { reason } : {}),
  };
}

/** Where a new workspace can go: the personal space, or an organization the account owns (only owners add workspaces). */
export function workspaceSpaces(organizations: Organization[]): { value: string; label: string }[] {
  return [
    { value: '', label: 'Personal space' },
    ...organizations.filter(o => o.myRole === 'owner').sort((a, b) => a.name.localeCompare(b.name)).map(o => ({ value: o.id, label: o.name })),
  ];
}

export interface RegistrationInput {
  name: string; description: string; repoUrl: string; visibility: 'public' | 'private';
  /** '' for the personal space. */
  organizationId: string;
  /** How a private repository is cloned: a personal token, or one of the organization's credentials. */
  access: 'token' | 'credential';
  token: string;
  credentialId: string;
}

/**
 * The POST /projects body for the form, or the first problem with it. Mirrors the server: a credential needs an
 * organization, a private repository needs a token or a credential, and never both.
 */
export function buildRegistration(input: RegistrationInput): { body: Record<string, string> } | { problem: string } {
  if (!input.name.trim() || !input.repoUrl.trim()) return { problem: 'Workspace name and repository URL are required.' };
  const body: Record<string, string> = { name: input.name.trim(), description: input.description.trim(), repoUrl: input.repoUrl.trim(), visibility: input.visibility };
  if (input.organizationId) body.organizationId = input.organizationId;
  if (input.visibility === 'private') {
    if (input.organizationId && input.access === 'credential') {
      if (!input.credentialId) return { problem: 'Choose one of the organization\'s credentials, or use a personal token.' };
      body.credentialId = input.credentialId;
    } else {
      if (!input.token.trim()) return { problem: 'A personal access token is required for a private repository.' };
      body.token = input.token.trim();
    }
  }
  return { body };
}
