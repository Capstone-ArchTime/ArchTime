import { apiRequest } from '../api/client.ts';
import { cx } from './conformance-messages.ts';

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

/** The latest background check of the workspace. */
export interface CheckJob { id: string; status: string; progress: number; stage: string; error: string | null; finishedAt: string | null }

export interface Overview {
  confirmed: boolean;
  baselineCommit: string | null;
  componentsWithoutPaths: string[];
  checks: Check[];
  /** Null when no background check was ever started (or the server is older). */
  job?: CheckJob | null;
}

// Labels are read when shown, so they follow the chosen language.
const typeOf = (label: 'forbidden' | 'missing' | 'undeclared' | 'convention') => ({ get label() { return cx(label); }, get help() { return cx(`${label}Help`); } });
export const FINDING_TYPES: Record<FindingType, { readonly label: string; readonly help: string }> = {
  'forbidden-dependency': typeOf('forbidden'),
  'missing-required-dependency': typeOf('missing'),
  'undeclared-dependency': typeOf('undeclared'),
  convention: typeOf('convention'),
};

const decisionOf = (kind: DecisionKind, color: string, needsNote: boolean) => ({
  color, needsNote, get label() { return cx(kind); }, get verb() { return cx(`${kind}Verb`); }, get help() { return cx(`${kind}Help`); },
});
export const DECISIONS: Record<DecisionKind, { readonly label: string; readonly verb: string; color: string; readonly help: string; needsNote: boolean }> = {
  fix: decisionOf('fix', 'red', false),
  accept: decisionOf('accept', 'blue', true),
  dismiss: decisionOf('dismiss', 'default', true),
};

/** One line saying what the finding is, for lists and screen readers. */
export function findingTitle(f: Pick<Finding, 'type' | 'sourceName' | 'targetName' | 'ruleName'>): string {
  // A convention finding (T5) carries its whole sentence.
  if (f.type === 'convention') return f.ruleName ?? cx('noConvention');
  const pair = `${f.sourceName} → ${f.targetName}`;
  const by = f.ruleName ? cx('byRule', { rule: f.ruleName }) : '';
  if (f.type === 'forbidden-dependency') return cx('isForbidden', { pair, by });
  if (f.type === 'missing-required-dependency') return cx('isMissing', { pair, by });
  return cx('notInDiagram', { pair });
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

/** Starts the check as a background job on the server and answers at once; follow it through `Overview.job`. */
export async function runCheck(projectId: string, force = false): Promise<{ jobId: string }> {
  const res = await apiRequest<{ data: { jobId: string } }>(base(projectId), { method: 'POST', ...json({ force }) });
  return res.data;
}

export const isRunning = (job: CheckJob | null | undefined): job is CheckJob => !!job && (job.status === 'queued' || job.status === 'running');

/** Why a check could not start, in words: another job for the workspace is the usual reason. */
export function startProblem(error: unknown): string {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : '';
  if (status === 409 && /already queued or running/i.test(message)) {
    return cx('otherJob');
  }
  return message || cx('cannotStart');
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
  const findings = cx('newFindings', { count: n });
  if (!r.findings) return { kind: 'info', text: cx('nothingNew') };
  if (!r.recipients) return { kind: 'warning', text: cx('nobody', { findings }) };
  if (!r.sent) return { kind: 'error', text: cx('notSent', { findings }) };
  const people = r.sent === r.recipients ? cx('people', { count: r.recipients }) : cx('someOf', { sent: r.sent, count: r.recipients });
  return { kind: 'success', text: cx('mailed', { findings, people }) };
}

export async function decideFinding(projectId: string, findingId: string, decision: DecisionKind | 'reopen', note = ''): Promise<Finding> {
  const res = await apiRequest<{ data: { finding: Finding } }>(`${base(projectId)}/findings/${encodeURIComponent(findingId)}/decision`, { method: 'PUT', ...json({ decision, note }) });
  return res.data.finding;
}

export async function explainFinding(projectId: string, findingId: string, refresh = false): Promise<Finding> {
  const res = await apiRequest<{ data: { finding: Finding } }>(`${base(projectId)}/findings/${encodeURIComponent(findingId)}/explanation`, { method: 'POST', ...json({ refresh }) }, 90_000);
  return res.data.finding;
}
