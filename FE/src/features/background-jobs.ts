import { useSyncExternalStore } from 'react';
import { apiRequest } from '../api/client.ts';
import { localizeStage, translate, translateOr } from '../i18n/index.ts';

// Work that runs on the server while the person does something else: reading the commit history, mining, the
// architecture map, the conformance check. One shared copy for the whole app: the header shows what is running, and
// whoever started a job is told when it ends, on whatever page they are. The server is asked again only while
// something is queued or running.

export type JobKind = 'scan' | 'mine' | 'abstract' | 'conformance' | string;
export interface TrackedJob {
  id: string;
  projectId: string;
  project: string;
  kind: JobKind;
  status: string;
  stage: string;
  progress: number;
  /** Started by the signed-in person: only those jobs bring a notice when they end. */
  mine: boolean;
}

export const ACTIVE = ['queued', 'running'];

/**
 * Which workspaces have a job running, and of what kind: it changes when a job starts or ends, not on every progress
 * tick. Pages that list workspaces reload when it changes, so a card says "Mining" as soon as mining starts.
 */
export function activeJobsKey(jobs: readonly Pick<TrackedJob, 'projectId' | 'kind' | 'status'>[]): string {
  return [...new Set(jobs.filter(job => ACTIVE.includes(job.status)).map(job => `${job.projectId}:${job.kind}`))].sort().join('|');
}
const POLL_MS = 3000;

export const KIND_LABEL: Record<string, string> = {
  scan: 'Reading the commit history',
  mine: 'Mining',
  abstract: 'Building the architecture map',
  conformance: 'Conformance check',
};
/** The kind of job in the page language (KIND_LABEL keeps the English names). */
export const kindLabel = (kind: string) => translateOr(`job.kind.${kind}`, KIND_LABEL[kind] ?? translate('job.kind.other'));

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const idOf = (v: unknown) => (v && typeof v === 'object' ? text((v as { _id?: unknown; id?: unknown })._id ?? (v as { id?: unknown }).id) : text(v));

/** The jobs as GET /projects/jobs returns them (project and requester populated); anything malformed is left out. */
export function parseTrackedJobs(body: unknown, myUserId: string | undefined): TrackedJob[] {
  const rows = (body as { data?: { jobs?: unknown } } | null)?.data?.jobs;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw): TrackedJob[] => {
    if (!raw || typeof raw !== 'object') return [];
    const j = raw as Record<string, unknown>;
    const id = text(j.id ?? j._id);
    if (!id || !text(j.status)) return [];
    const project = j.projectId as { name?: unknown } | string | null;
    const progress = typeof j.progress === 'number' && Number.isFinite(j.progress) ? Math.min(100, Math.max(0, j.progress)) : 0;
    return [{
      id, projectId: idOf(j.projectId), project: typeof project === 'object' && project && typeof project.name === 'string' ? project.name : 'a workspace',
      kind: text(j.kind) || 'mine', status: text(j.status), stage: text(j.stage), progress,
      mine: !!myUserId && idOf(j.requestedBy) === myUserId,
    }];
  });
}

/**
 * The person's own jobs that were queued or running before and have ended now. `started` holds the jobs the person
 * has just started here: a short one can end before it is ever seen running, and still deserves its notice.
 */
export function endedJobs(before: TrackedJob[], now: TrackedJob[], started: ReadonlySet<string> = new Set()): TrackedJob[] {
  const wasActive = new Set(before.filter(j => j.mine && ACTIVE.includes(j.status)).map(j => j.id));
  return now.filter(j => (wasActive.has(j.id) || started.has(j.id)) && !ACTIVE.includes(j.status));
}

/** Where to look at the result of a job. */
export function jobLink(job: Pick<TrackedJob, 'kind' | 'projectId'>): string {
  const project = encodeURIComponent(job.projectId);
  if (job.kind === 'conformance') return `/project-maintainer/conformance?project=${project}`;
  if (job.kind === 'abstract') return `/workspace/${project}`;
  return '/projects';
}

/** The notice for a job that ended. */
export function jobNotice(job: TrackedJob): { kind: 'success' | 'warning' | 'error'; title: string; description: string } {
  const what = `${kindLabel(job.kind)} · ${job.project}`;
  if (job.status === 'completed') return { kind: 'success', title: translate('job.done', { what }), description: (job.stage && localizeStage(job.stage)) || translate('job.finished') };
  if (job.status === 'cancelled') return { kind: 'warning', title: translate('job.stopped', { what }), description: (job.stage && localizeStage(job.stage)) || translate('job.stoppedKept') };
  return { kind: 'error', title: translate('job.failed', { what }), description: localizeStage(job.stage.replace(/^Failed:\s*/, '')) || translate('job.failedBody') };
}

// ── The shared store ─────────────────────────────────────────────────────────────────────────────────────────────────

let jobs: TrackedJob[] = [];
let me: string | undefined;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
let onEnded: ((ended: TrackedJob[]) => void) | null = null;

const started = new Set<string>();

function publish(next: TrackedJob[]) {
  const ended = endedJobs(jobs, next, started);
  ended.forEach(j => started.delete(j.id));
  jobs = next;
  listeners.forEach(l => l());
  if (ended.length) onEnded?.(ended);
}

/** Asks the server now, and keeps asking every few seconds while something is queued or running. */
export function refreshJobs(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  inFlight ??= apiRequest<unknown>('/projects/jobs?limit=20')
    .then(body => publish(parseTrackedJobs(body, me)))
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
      if (jobs.some(j => ACTIVE.includes(j.status))) timer = setTimeout(() => { void refreshJobs(); }, POLL_MS);
    });
  return inFlight;
}

/** Call after starting a job, with its id: the header picks it up at once, and its end is told even if it is quick. */
export function trackJobs(jobId?: unknown) {
  if (typeof jobId === 'string' && jobId) started.add(jobId);
  void refreshJobs();
}

/** Who is signed in (to tell their own jobs apart) and what to do when one of them ends. */
export function configureJobs(userId: string | undefined, ended: ((ended: TrackedJob[]) => void) | null) {
  if (userId !== me) { me = userId; jobs = []; started.clear(); }
  onEnded = ended;
}

export function useBackgroundJobs(): TrackedJob[] {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => jobs, () => jobs);
}
