import type { AnswerResult, LearnerProgress, MentorPath, PathPayload, PathStatus, PathSummary, Progress, StepAssessment, StepKind } from './onboarding-api';

// What the learning-path pages show and send, kept out of the components so it can be tested without rendering them.

export const STEP_KINDS: { kind: StepKind; label: string; hint: string }[] = [
  { kind: 'component', label: 'Component', hint: 'Explain one component of the architecture' },
  { kind: 'commit', label: 'Commit', hint: 'Walk through one mined commit and its evidence' },
  { kind: 'adr', label: 'Design decision', hint: 'Read one design decision (ADR)' },
  { kind: 'question', label: 'Question', hint: 'Check understanding with a multiple-choice question' },
];
export const kindLabel = (kind: StepKind): string => STEP_KINDS.find(k => k.kind === kind)?.label ?? kind;

export const QUESTION_LIMITS = { minOptions: 2, maxOptions: 6 } as const;
export const MAX_STEPS = 50;

// ── What the reader is told ──

/** A note for a step that may no longer hold; null when it does. */
export function assessmentNote(assessment: StepAssessment | undefined): { level: 'warning' | 'error'; text: string } | null {
  if (!assessment || assessment.status === 'current') return null;
  if (assessment.status === 'outdated') return { level: 'warning', text: 'The architecture map changed after this step was written, so it may describe an older map.' };
  const gone = assessment.issues.filter(issue => issue.code !== 'MAP_CHANGED').map(issue => issue.message);
  return { level: 'error', text: gone.length ? gone.join(' ') : 'What this step was written about is no longer in the repository.' };
}

export const progressText = (progress: Progress): string => `${progress.done} of ${progress.total} step${progress.total === 1 ? '' : 's'}`;

/** What a learner is told after answering a question. */
export function answerFeedback(result: Pick<AnswerResult, 'correct' | 'attempts'>): { type: 'success' | 'error'; text: string } {
  if (result.correct) return { type: 'success', text: result.attempts === 1 ? 'Correct, on the first try.' : `Correct, after ${result.attempts} tries.` };
  return { type: 'error', text: 'Not quite. Read the step again and try another answer.' };
}

/** The first step that is not done yet, or -1 when the path is finished. */
export function firstOpenStep(steps: readonly { progress: { completed: boolean } }[]): number {
  return steps.findIndex(step => !step.progress.completed);
}

export function pathStatusTag(status: PathStatus): { color: string; label: string } {
  return status === 'published' ? { color: 'green', label: 'Published' } : { color: 'default', label: 'Draft' };
}

/** How many steps of a path a mentor should look at, in words; empty when none. */
export function attentionText(path: Pick<PathSummary, 'outdatedSteps' | 'missingSteps'>): string {
  const parts: string[] = [];
  if (path.missingSteps) parts.push(`${path.missingSteps} step${path.missingSteps === 1 ? '' : 's'} point at a commit that is gone`);
  if (path.outdatedSteps) parts.push(`${path.outdatedSteps} may be out of date`);
  return parts.join(', ');
}

export type LearnerState = 'not started' | 'in progress' | 'finished';
export function learnerState(progress: Pick<LearnerProgress, 'done' | 'total'>): LearnerState {
  if (progress.total > 0 && progress.done >= progress.total) return 'finished';
  return progress.done > 0 ? 'in progress' : 'not started';
}

/** Questions answered wrongly more than once point at a step that may be unclear. */
export const struggled = (attempts: number, completed: boolean): boolean => attempts >= 3 && !completed;

// ── The editor's draft ──

export type DraftQuestion = { prompt: string; options: string[]; correctIndex: number; explanation: string };
export type DraftStep = {
  /** Only for React: it keeps a step's card in place when the steps are moved. */
  key: string;
  /** The step's id on the server; missing for a step that has not been saved yet. */
  id?: string;
  kind: StepKind; title: string; body: string;
  componentId: string; adrId: string; commit: string;
  question: DraftQuestion;
  /** Pin the step to the current revision again when saving. */
  repin: boolean;
};
export type PathDraft = { title: string; description: string; status: PathStatus; steps: DraftStep[]; expectedRevision?: number };

const blankQuestion = (): DraftQuestion => ({ prompt: '', options: ['', ''], correctIndex: 0, explanation: '' });

export const newDraft = (): PathDraft => ({ title: '', description: '', status: 'draft', steps: [] });

export function newStep(kind: StepKind, key: string): DraftStep {
  return { key, kind, title: '', body: '', componentId: '', adrId: '', commit: '', question: blankQuestion(), repin: false };
}

/** A saved path as an editable draft; saving it sends back the revision it was loaded at. */
export function draftFromPath(path: MentorPath, keyOf: (index: number) => string): PathDraft {
  return {
    title: path.title,
    description: path.description,
    status: path.status,
    expectedRevision: path.revision,
    steps: path.steps.map((step, i) => ({
      key: keyOf(i), id: step.id, kind: step.kind, title: step.title, body: step.body,
      componentId: step.componentId ?? '', adrId: step.adrId ?? '',
      commit: step.kind === 'commit' ? step.revision.commit ?? '' : '',
      question: step.question
        ? { prompt: step.question.prompt, options: [...step.question.options], correctIndex: step.question.correctIndex ?? 0, explanation: step.question.explanation ?? '' }
        : blankQuestion(),
      repin: false,
    })),
  };
}

/** The request body for a draft: each step carries only what its kind uses. */
export function payloadFromDraft(draft: PathDraft): PathPayload {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    status: draft.status,
    ...(draft.expectedRevision !== undefined ? { expectedRevision: draft.expectedRevision } : {}),
    steps: draft.steps.map(step => ({
      ...(step.id ? { id: step.id } : {}),
      kind: step.kind,
      title: step.title.trim(),
      body: step.body.trim(),
      ...(step.repin ? { repin: true } : {}),
      ...(step.kind === 'component' ? { componentId: step.componentId } : {}),
      ...(step.kind === 'adr' ? { adrId: step.adrId } : {}),
      ...(step.kind === 'commit' && step.commit.trim() ? { commit: step.commit.trim() } : {}),
      ...(step.kind === 'question'
        ? { question: { prompt: step.question.prompt.trim(), options: step.question.options.map(option => option.trim()), correctIndex: step.question.correctIndex, explanation: step.question.explanation.trim() } }
        : {}),
    })),
  };
}

/** A copy of the list with the step at `from` moved to `to` (both clamped to the list). */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  const copy = [...steps];
  if (from < 0 || from >= copy.length) return copy;
  const target = Math.min(Math.max(to, 0), copy.length - 1);
  const [moved] = copy.splice(from, 1);
  copy.splice(target, 0, moved);
  return copy;
}

export function addOption(question: DraftQuestion): DraftQuestion {
  return question.options.length >= QUESTION_LIMITS.maxOptions ? question : { ...question, options: [...question.options, ''] };
}

/** Removes an answer; the right answer stays the same one unless it is the one removed (then the first). */
export function removeOption(question: DraftQuestion, index: number): DraftQuestion {
  if (question.options.length <= QUESTION_LIMITS.minOptions || index < 0 || index >= question.options.length) return question;
  const correctIndex = index === question.correctIndex ? 0 : index < question.correctIndex ? question.correctIndex - 1 : question.correctIndex;
  return { ...question, options: question.options.filter((_, i) => i !== index), correctIndex };
}

// ── Problems, by field, in the same names the server uses ──

const REF_FIELD: Partial<Record<StepKind, 'componentId' | 'adrId'>> = { component: 'componentId', adr: 'adrId' };

/** What is missing in a draft, named like the server's `fields` (for example "steps[2].title"); the server checks everything again. */
export function checkDraft(draft: PathDraft): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!draft.title.trim()) problems.title = 'Give the path a title.';
  if (draft.status === 'published' && !draft.steps.length) problems.steps = 'A published path needs at least one step.';
  if (draft.steps.length > MAX_STEPS) problems.steps = `At most ${MAX_STEPS} steps.`;
  draft.steps.forEach((step, i) => {
    const at = (name: string) => `steps[${i}].${name}`;
    if (!step.title.trim()) problems[at('title')] = 'Give the step a title.';
    const ref = REF_FIELD[step.kind];
    if (ref && !step[ref]) problems[at(ref)] = step.kind === 'component' ? 'Choose a component.' : 'Choose a design decision.';
    if (step.kind === 'commit' && !step.commit.trim() && !step.id) problems[at('commit')] = 'Choose a commit.';
    if (step.kind === 'question') {
      const q = step.question;
      if (!q.prompt.trim()) problems[at('question.prompt')] = 'Write the question.';
      const options = q.options.map(option => option.trim());
      if (options.some(option => !option)) problems[at('question.options')] = 'Fill in every answer, or remove the empty ones.';
      else if (new Set(options.map(option => option.toLowerCase())).size !== options.length) problems[at('question.options')] = 'Two answers are the same.';
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length) problems[at('question.correctIndex')] = 'Mark the right answer.';
    }
  });
  return problems;
}

export type FieldProblems = { path: Record<string, string>; steps: Record<number, Record<string, string>> };

/** Splits problems named "title", "steps[2].title", "steps[3].question.options[1]" into the path's own and each step's. */
export function problemsByStep(fields: Record<string, string> | undefined): FieldProblems {
  const result: FieldProblems = { path: {}, steps: {} };
  for (const [name, problem] of Object.entries(fields ?? {})) {
    const match = /^steps\[(\d+)\](?:\.(.+))?$/.exec(name);
    if (!match) { result.path[name] = problem; continue; }
    const index = Number(match[1]);
    (result.steps[index] ??= {})[match[2] ?? '_'] = problem;
  }
  return result;
}

/** All the problems of one step in one list, for a summary line on its card. */
export const stepProblemList = (problems: FieldProblems, index: number): string[] => Object.values(problems.steps[index] ?? {});
