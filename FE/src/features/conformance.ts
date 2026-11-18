import { apiRequest } from '../api/client.ts';

// The conformance check (RF-08, UC-40, UC-41): how the code of each snapshot after the baseline departs from the
// confirmed component diagram. The server computes everything; this module reads it and words it for people.

export type FindingType = 'forbidden-dependency' | 'missing-required-dependency' | 'undeclared-dependency' | 'convention';
export type DecisionKind = 'fix' | 'accept' | 'dismiss';

export interface Finding {
  id: string;
  snapshotId: string;
  snapshotHash: string;
  commitDate: string;
  key: string;
  type: FindingType;
  ruleId: string | null;
  ruleName: string | null;
  severity: 'error' | 'warning';
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  imports: { from: string; to: string }[];
  importCount: number;
  files: string[];
  decision: { kind: DecisionKind; note: string; by: string; at: string; inheritedFrom?: string | null } | null;
  explanation: { text: string; model: string; at: string } | null;
  outdated: boolean;
}

export interface Check {
  snapshotId: string;
  snapshotHash: string;
  commitDate: string;
  checkedAt: string;
  counts: { findings: number; errors: number; warnings: number; unmappedFiles: number; files: number };
  unresolvedRules: string[];
  stale: boolean;
}

export interface Overview {
  confirmed: boolean;
  baselineCommit: string | null;
  componentsWithoutPaths: string[];
  checks: Check[];
}

export const FINDING_TYPES: Record<FindingType, { label: string; help: string }> = {
  'forbidden-dependency': { label: 'Forbidden dependency', help: 'A rule forbids this dependency, and the code has it.' },
  'missing-required-dependency': { label: 'Missing required dependency', help: 'A rule requires this dependency, and the code does not have it.' },
  'undeclared-dependency': { label: 'Undeclared dependency', help: 'The code has this dependency, but the confirmed diagram does not declare it.' },
  convention: { label: 'Commit convention', help: 'The commit message is not "type(scope): summary" with Task: and Arch-Change:, or its Arch-Change differs from the dependencies the commit really changed.' },
};

export const DECISIONS: Record<DecisionKind, { label: string; verb: string; color: string; help: string; needsNote: boolean }> = {
  fix: { label: 'To fix', verb: 'Fix', color: 'red', help: 'A real departure: the code is to be changed.', needsNote: false },
  accept: { label: 'Accepted', verb: 'Accept', color: 'blue', help: 'Intended: the diagram should follow, through an architecture change request. Carries over to later commits.', needsNote: true },
  dismiss: { label: 'Dismissed', verb: 'Dismiss', color: 'default', help: 'Not a real problem (a false positive, generated code). Carries over to later commits.', needsNote: true },
};

/** One line saying what the finding is, for lists and screen readers. */
export function findingTitle(f: Pick<Finding, 'type' | 'sourceName' | 'targetName' | 'ruleName'>): string {
  // A convention finding (T5) carries its whole sentence.
  if (f.type === 'convention') return f.ruleName ?? 'The commit does not follow the commit convention';
  const pair = `${f.sourceName} → ${f.targetName}`;
  if (f.type === 'forbidden-dependency') return `${pair} is forbidden${f.ruleName ? ` by "${f.ruleName}"` : ''}`;
  if (f.type === 'missing-required-dependency') return `${pair} is required${f.ruleName ? ` by "${f.ruleName}"` : ''} but missing`;
  return `${pair} is not in the diagram`;
}

/** The check to show first: the newest commit checked. */
export const latestCheck = (checks: Check[]): Check | null =>
  checks.reduce<Check | null>((best, c) => (!best || Date.parse(c.commitDate) > Date.parse(best.commitDate) ? c : best), null);

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/conformance`;
const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function fetchOverview(projectId: string, signal?: AbortSignal): Promise<Overview> {
  const res = await apiRequest<{ data: Overview }>(base(projectId), { signal });
  return res.data;
}

export async function fetchFindings(projectId: string, query: { snapshotId?: string; status?: 'open' | 'decided' }, signal?: AbortSignal): Promise<Finding[]> {
  const params = new URLSearchParams();
  if (query.snapshotId) params.set('snapshotId', query.snapshotId);
  if (query.status) params.set('status', query.status);
  const res = await apiRequest<{ data: { findings: Finding[] } }>(`${base(projectId)}/findings?${params}`, { signal });
  return res.data.findings;
}

/** Checking many snapshots can take a while: allow two minutes. */
export async function runCheck(projectId: string, force = false): Promise<{ checked: { hash: string; findings: number }[]; skipped: number }> {
  const res = await apiRequest<{ data: { checked: { hash: string; findings: number }[]; skipped: number } }>(base(projectId), { method: 'POST', ...json({ force }) }, 120_000);
  return res.data;
}

/** `problems`: what the e-mail lists (the same finding in several commits counts once). */
export interface NotifyResult { findings: number; problems?: number; sent: number; recipients: number }

/** E-mails the new findings now (same rules as the automatic e-mail after a fetch or mine: each finding once). */
export async function notifyFindings(projectId: string): Promise<NotifyResult> {
  return (await apiRequest<{ data: NotifyResult }>(`${base(projectId)}/notify`, { method: 'POST' })).data;
}

/** What to tell the maintainer after pressing "E-mail new findings". */
export function notifyMessage(r: NotifyResult): { kind: 'success' | 'info' | 'warning' | 'error'; text: string } {
  const n = r.problems ?? r.findings;
  const findings = `${n} new finding${n === 1 ? '' : 's'}`;
  if (!r.findings) return { kind: 'info', text: 'Nothing new to e-mail: every open finding was already e-mailed, or has been decided.' };
  if (!r.recipients) return { kind: 'warning', text: `${findings}, but nobody can receive them: the owner and maintainers need an active account with a verified e-mail. They will be e-mailed once someone can.` };
  if (!r.sent) return { kind: 'error', text: `The e-mail about ${findings} could not be sent. Check the server's e-mail (SMTP) settings; they will be e-mailed on the next try.` };
  const people = `${r.sent === r.recipients ? r.recipients : `${r.sent} of ${r.recipients}`} ${r.recipients === 1 ? 'person' : 'people'}`;
  return { kind: 'success', text: `E-mailed ${findings} to ${people}.` };
}

export async function decideFinding(projectId: string, findingId: string, decision: DecisionKind | 'reopen', note = ''): Promise<Finding> {
  const res = await apiRequest<{ data: { finding: Finding } }>(`${base(projectId)}/findings/${encodeURIComponent(findingId)}/decision`, { method: 'PUT', ...json({ decision, note }) });
  return res.data.finding;
}

export async function explainFinding(projectId: string, findingId: string, refresh = false): Promise<Finding> {
  const res = await apiRequest<{ data: { finding: Finding } }>(`${base(projectId)}/findings/${encodeURIComponent(findingId)}/explanation`, { method: 'POST', ...json({ refresh }) }, 90_000);
  return res.data.finding;
}
