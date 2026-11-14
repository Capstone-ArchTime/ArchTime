// Turns the server's audit records and system settings into what the administrators' console shows.
// The server sends { action, userId, targetType, targetId, details, ipAddress, createdAt } per audit event and
// { settings: { maxConcurrentJobs, maxRepoSizeMb, … } } for the settings; the pages read the shapes below.

export interface AdminAuditLog {
  id: string;
  /** Group used by the Event filter: invitation, role_change, security, configuration, login, logout, organization, workspace, other. */
  type: string;
  /** The server's action code, e.g. USER_ROLE_CHANGE. */
  action: string;
  /** Who did it: name or email when known, else the account id, else "System". */
  actor: string;
  target?: string;
  description: string;
  ip?: string;
  timestamp: string;
}

export interface AdminSettings {
  maxConcurrentJobs: number;
  maxRepoSizeMb: number;
  updatedAt?: string;
}

export const AUDIT_TYPES = ['invitation', 'role_change', 'security', 'configuration', 'login', 'logout', 'organization', 'workspace'] as const;

const TYPE_BY_ACTION: Record<string, string> = {
  USER_INVITE: 'invitation',
  USER_ROLE_CHANGE: 'role_change',
  USER_SUSPEND: 'security', USER_REACTIVATE: 'security',
  API_KEY_CREATE: 'security', API_KEY_REVOKE: 'security',
  ORGANIZATION_CREDENTIAL_CREATE: 'security', ORGANIZATION_CREDENTIAL_ROTATE: 'security', ORGANIZATION_CREDENTIAL_DELETE: 'security',
  SETTINGS_UPDATE: 'configuration',
  LLM_MODEL_CREATE: 'configuration', LLM_MODEL_UPDATE: 'configuration', LLM_MODEL_DELETE: 'configuration', LLM_MODEL_TEST: 'configuration', LLM_BENCHMARK_START: 'configuration',
  USER_LOGIN: 'login',
  USER_LOGOUT_ALL: 'logout',
  ORGANIZATION_CREATE: 'organization', ORGANIZATION_MEMBER_ADD: 'organization', ORGANIZATION_MEMBER_REMOVE: 'organization',
  PROJECT_CREATE: 'workspace', PROJECT_DELETE: 'workspace', JOB_CANCEL: 'workspace',
};

const SENTENCE: Record<string, string> = {
  USER_LOGIN: 'Signed in',
  USER_INVITE: 'Invited a user',
  USER_ROLE_CHANGE: 'Changed an account role',
  USER_SUSPEND: 'Suspended an account',
  USER_REACTIVATE: 'Reactivated an account',
  USER_LOGOUT_ALL: 'Signed out of all devices',
  ORGANIZATION_CREATE: 'Created an organization',
  ORGANIZATION_MEMBER_ADD: 'Added a member to an organization',
  ORGANIZATION_MEMBER_REMOVE: 'Removed a member from an organization',
  ORGANIZATION_CREDENTIAL_CREATE: 'Added an organization credential',
  ORGANIZATION_CREDENTIAL_ROTATE: 'Rotated an organization credential',
  ORGANIZATION_CREDENTIAL_DELETE: 'Deleted an organization credential',
  PROJECT_CREATE: 'Created a workspace',
  PROJECT_DELETE: 'Deleted a workspace',
  JOB_CANCEL: 'Cancelled a mining job',
  SETTINGS_UPDATE: 'Updated the system settings',
  API_KEY_CREATE: 'Created an API key',
  API_KEY_REVOKE: 'Revoked an API key',
  LLM_MODEL_CREATE: 'Added an AI model',
  LLM_MODEL_UPDATE: 'Updated an AI model',
  LLM_MODEL_DELETE: 'Removed an AI model',
  LLM_MODEL_TEST: 'Checked an AI model',
  LLM_BENCHMARK_START: 'Started an AI model benchmark',
};

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** "USER_ROLE_CHANGE" → "User role change", for actions this console does not know yet. */
function humanize(action: string) {
  const words = action.toLowerCase().replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown action';
}

/** A short detail after the sentence, from the fields the server records for that action. */
function detailOf(action: string, details: Record<string, unknown>, people: Map<string, string>): string | undefined {
  const person = (id: unknown) => (str(id) ? people.get(String(id)) ?? undefined : undefined);
  const parts: string[] = [];
  const name = str(details.name) ?? str(details.displayName) ?? str(details.email);
  if (name) parts.push(name);
  const member = person(details.memberUserId) ?? person(details.targetUserId);
  if (member) parts.push(member);
  if (action === 'USER_ROLE_CHANGE' && str(details.newRole)) parts.push(`${str(details.oldRole) ? `${str(details.oldRole)} → ` : 'to '}${str(details.newRole)}`);
  else if (str(details.role)) parts.push(`as ${str(details.role)}`);
  if (str(details.reason)) parts.push(`reason: ${str(details.reason)}`);
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * One audit event as the console shows it. `people` maps account ids to a readable name, so the actor and the
 * people an event is about read as names instead of ids.
 */
export function toAuditLog(raw: unknown, people: Map<string, string> = new Map()): AdminAuditLog {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const action = str(r.action) ?? str(r.type) ?? '';
  const details = (r.details && typeof r.details === 'object' ? r.details : {}) as Record<string, unknown>;
  const userId = str(r.userId);
  const actor = (userId && people.get(userId)) ?? str(r.userEmail) ?? str(r.actor) ?? userId ?? 'System';
  const targetType = str(r.targetType);
  const targetId = str(r.targetId);
  // An event about an account names that account (unless the details already name someone, as invitations do).
  const targetPerson = targetType === 'user' && targetId ? people.get(targetId) : undefined;
  const ownDetail = detailOf(action, details, people);
  const detail = targetPerson && !ownDetail?.includes(targetPerson) ? [targetPerson, ownDetail].filter(Boolean).join(' · ') : ownDetail;
  const sentence = SENTENCE[action] ?? humanize(action);
  return {
    id: str(r.id) ?? str(r._id) ?? `${action}-${String(r.createdAt ?? '')}`,
    type: TYPE_BY_ACTION[action] ?? 'other',
    action,
    actor,
    target: targetType ? `${targetType}${targetPerson ? ` ${targetPerson}` : targetId ? ` ${targetId}` : ''}` : undefined,
    description: str(r.description) ?? (detail ? `${sentence}: ${detail}` : sentence),
    ip: str(r.ipAddress) ?? str(r.ip),
    timestamp: str(r.createdAt) ?? str(r.timestamp) ?? '',
  };
}

/** Keeps the events of one Event group (or all) whose actor, description or action contains the search text. */
export function filterAuditLogs(logs: AdminAuditLog[], { type, query }: { type?: string; query?: string }): AdminAuditLog[] {
  const q = query?.trim().toLowerCase();
  return logs.filter(log => (!type || type === 'all' || log.type === type)
    && (!q || [log.actor, log.description, log.action].some(text => text.toLowerCase().includes(q))));
}

/**
 * The date range of the From/To pickers (yyyy-mm-dd, local days) as the instants the server compares with:
 * From is the start of that day, To the end of it, so events on the To day are included.
 */
export function auditRange(from?: string, to?: string): { from?: string; to?: string } {
  const at = (day: string, time: string) => { const d = new Date(`${day}T${time}`); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); };
  return { from: from ? at(from, '00:00:00') : undefined, to: to ? at(to, '23:59:59.999') : undefined };
}

/** The settings the Repository & Extraction page edits, from the server's { settings: {...} } (or a bare object). */
export function toAdminSettings(raw: unknown): AdminSettings {
  const outer = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (outer.settings && typeof outer.settings === 'object' ? outer.settings : outer) as Record<string, unknown>;
  const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return {
    maxConcurrentJobs: num(s.maxConcurrentJobs, 5),
    maxRepoSizeMb: num(s.maxRepoSizeMb, 500),
    updatedAt: str(s.updatedAt),
  };
}
