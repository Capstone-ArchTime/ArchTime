import { apiRequest } from '@/api/client';

// Learning paths: written by a workspace's mentors, given to its members, followed step by step.
// Server: BE/src/presentation/routes/onboarding.routes.ts. Design: docs/onboarding-paths-design.md.

export type StepKind = 'component' | 'commit' | 'adr' | 'question';
export type PathStatus = 'draft' | 'published';

/**
 * Whether what a step was written against still holds: its own component or decision changed (outdated), or the commit,
 * component or decision is gone (missing).
 */
export type StepAssessment = { status: 'current' | 'outdated' | 'missing'; issues: { code: string; message: string }[] };
export type StepRevision = { commit: string | null; snapshotId: string | null; workspaceRevision: number | null; pinnedAt: string; fingerprint?: string | null };

/** The answer key (correctIndex, explanation) is only present for mentors, or for a learner who has answered it right. */
export type Question = { prompt: string; options: string[]; correctIndex?: number; explanation?: string };

export type PathStep = {
  id: string; kind: StepKind; title: string; body: string;
  componentId?: string; adrId?: string; commitTitle?: string; question?: Question;
  revision: StepRevision; assessment?: StepAssessment;
};
export type StepProgress = { completed: boolean; completedAt: string | null; attempts: number };
export type LearnerStep = PathStep & { progress: StepProgress };
export type Progress = { done: number; total: number; percent: number };

// ── Learners ──

/** The first step not done yet; null once the path is finished. */
export type NextStep = { id: string; title: string; kind: StepKind; index: number };
export type MyPath = Progress & {
  pathId: string; projectId: string; projectName: string | null; title: string; description: string; assignedAt: string; lastActivityAt: string;
  nextStep: NextStep | null;
};
export type LearnerPath = { id: string; projectId: string; title: string; description: string; steps: LearnerStep[] };
export type AnswerResult = { correct: boolean; attempts: number; completed: boolean; correctIndex?: number; explanation?: string; progress: Progress };

// ── Mentors ──

export type PathSummary = {
  id: string; title: string; description: string; status: PathStatus; revision: number; stepCount: number; updatedAt: string;
  assigned: number; finished: number; outdatedSteps: number; missingSteps: number;
};
export type MentorPath = { id: string; projectId: string; title: string; description: string; status: PathStatus; steps: PathStep[]; revision: number; updatedAt: string };
export type LearnerProgress = Progress & {
  userId: string; name: string | null; email: string | null; assignedAt: string; lastActivityAt: string;
  steps: { stepId: string; completed: boolean; completedAt: string | null; attempts: number }[];
};
export type PathProgress = { path: { id: string; title: string; status: PathStatus; steps: { id: string; kind: StepKind; title: string }[] }; learners: LearnerProgress[] };

/** The body of a create or save request; see payloadFromDraft in onboarding-view.ts. */
export type PathPayload = Record<string, unknown>;

export type { ProjectSummary as ManagedProject } from './project-data';
export type ProjectMember = { userId: string; name: string; email: string; role: string; status: string };

type Envelope<T> = { data?: T };
const data = <T>(body: Envelope<T> | undefined, what: string): T => {
  if (!body?.data || typeof body.data !== 'object') throw new Error(`The server returned an invalid ${what}.`);
  return body.data;
};
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/onboarding-paths`;
const one = (projectId: string, pathId: string) => `${base(projectId)}/${encodeURIComponent(pathId)}`;

// ── Learners ──

export async function getMyPaths(signal?: AbortSignal): Promise<MyPath[]> {
  const d = data(await apiRequest<Envelope<{ paths: MyPath[] }>>('/onboarding/me', { signal }), 'list of learning paths');
  if (!Array.isArray(d.paths)) throw new Error('The server returned an invalid list of learning paths.');
  return d.paths;
}

export async function getLearnerPath(projectId: string, pathId: string, signal?: AbortSignal) {
  const d = data(await apiRequest<Envelope<{ path: LearnerPath; progress: Progress }>>(`${one(projectId, pathId)}/mine`, { signal }), 'learning path');
  if (!d.path || !Array.isArray(d.path.steps)) throw new Error('The server returned an invalid learning path.');
  return d;
}

export async function completeStep(projectId: string, pathId: string, stepId: string): Promise<Progress> {
  return data(await apiRequest<Envelope<{ progress: Progress }>>(`${one(projectId, pathId)}/steps/${encodeURIComponent(stepId)}/complete`, json('POST')), 'progress').progress;
}

export async function answerStep(projectId: string, pathId: string, stepId: string, choice: number): Promise<AnswerResult> {
  return data(await apiRequest<Envelope<AnswerResult>>(`${one(projectId, pathId)}/steps/${encodeURIComponent(stepId)}/answer`, json('POST', { choice })), 'answer');
}

// ── Mentors ──

export { getManagedProjects } from './project-data';

export async function listPaths(projectId: string, signal?: AbortSignal): Promise<PathSummary[]> {
  const d = data(await apiRequest<Envelope<{ paths: PathSummary[] }>>(base(projectId), { signal }), 'list of learning paths');
  if (!Array.isArray(d.paths)) throw new Error('The server returned an invalid list of learning paths.');
  return d.paths;
}

export async function getPath(projectId: string, pathId: string, signal?: AbortSignal): Promise<MentorPath> {
  const d = data(await apiRequest<Envelope<{ path: MentorPath }>>(one(projectId, pathId), { signal }), 'learning path');
  if (!d.path || !Array.isArray(d.path.steps)) throw new Error('The server returned an invalid learning path.');
  return d.path;
}

export async function createPath(projectId: string, body: PathPayload): Promise<MentorPath> {
  return data(await apiRequest<Envelope<{ path: MentorPath }>>(base(projectId), json('POST', body)), 'learning path').path;
}

export async function savePath(projectId: string, pathId: string, body: PathPayload): Promise<MentorPath> {
  return data(await apiRequest<Envelope<{ path: MentorPath }>>(one(projectId, pathId), json('PUT', body)), 'learning path').path;
}

export async function deletePath(projectId: string, pathId: string): Promise<void> {
  await apiRequest(one(projectId, pathId), { method: 'DELETE' });
}

export async function getPathProgress(projectId: string, pathId: string, signal?: AbortSignal): Promise<PathProgress> {
  const d = data(await apiRequest<Envelope<PathProgress>>(`${one(projectId, pathId)}/assignments`, { signal }), 'progress');
  if (!Array.isArray(d.learners)) throw new Error('The server returned invalid progress.');
  return d;
}

export async function assignPath(projectId: string, pathId: string, userIds: string[]): Promise<void> {
  await apiRequest(`${one(projectId, pathId)}/assignments`, json('POST', { userIds }));
}

export async function unassignPath(projectId: string, pathId: string, userId: string): Promise<void> {
  await apiRequest(`${one(projectId, pathId)}/assignments/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

/** The people who can be given a path: the active members of the workspace, its owner included. */
export async function getAssignableMembers(projectId: string, signal?: AbortSignal): Promise<ProjectMember[]> {
  const d = data(await apiRequest<Envelope<{ members: ProjectMember[] }>>(`/projects/${encodeURIComponent(projectId)}/members`, { signal }), 'list of members');
  if (!Array.isArray(d.members)) throw new Error('The server returned an invalid list of members.');
  return d.members.filter(m => m.status === 'active' && !!m.userId);
}

/** What an ADR rests on: a commit (full hash), a snapshot, an evidence record or an approval request (ids). */
export type DecisionSource = { kind: 'commit' | 'snapshot' | 'evidence' | 'approval'; ref: string; title: string; date?: string; note?: string };
export type WorkspaceDecision = {
  id: string; number: number; title: string; status: string; context: string; decision: string; alternatives: string; consequences: string;
  componentIds: string[]; sources: DecisionSource[];
};
/** What a step can point at, read from the workspace the path belongs to (anyone who can read the workspace may). */
export type WorkspaceRefs = {
  components: { id: string; name: string; kind: string; description: string }[];
  dependencies: { id: string; source: string; target: string; label: string }[];
  decisions: WorkspaceDecision[];
};
type RawWorkspace = { diagram?: { components?: WorkspaceRefs['components']; dependencies?: WorkspaceRefs['dependencies'] }; decisions?: Partial<WorkspaceDecision>[] };
export async function getWorkspaceRefs(projectId: string, signal?: AbortSignal): Promise<WorkspaceRefs> {
  const d = data(await apiRequest<Envelope<{ workspace?: RawWorkspace }>>(`/projects/${encodeURIComponent(projectId)}/workspace`, { signal }), 'workspace');
  return {
    components: d.workspace?.diagram?.components ?? [],
    dependencies: d.workspace?.diagram?.dependencies ?? [],
    // Older decisions may lack the newer fields; the pages read them as empty.
    decisions: (d.workspace?.decisions ?? []).map(raw => ({
      id: raw.id ?? '', number: raw.number ?? 0, title: raw.title ?? '', status: raw.status ?? '', context: raw.context ?? '', decision: raw.decision ?? '',
      alternatives: raw.alternatives ?? '', consequences: raw.consequences ?? '', componentIds: raw.componentIds ?? [], sources: raw.sources ?? [],
    })),
  };
}

/** The mined commits of a workspace, newest first, without their dependency graphs. */
export type CommitChoice = { hash: string; title: string; date: string };
export async function getCommitChoices(projectId: string, signal?: AbortSignal): Promise<CommitChoice[]> {
  const d = data(await apiRequest<Envelope<{ snapshots: { hash: string; fullHash?: string; title: string; date: string; missingSince?: string | null }[] }>>(`/projects/${encodeURIComponent(projectId)}/snapshots?summary=1&page=1&limit=100`, { signal }), 'list of commits');
  if (!Array.isArray(d.snapshots)) throw new Error('The server returned an invalid list of commits.');
  return d.snapshots.filter(s => !s.missingSince).map(s => ({ hash: s.fullHash ?? s.hash, title: s.title.split('\n')[0], date: s.date }));
}
