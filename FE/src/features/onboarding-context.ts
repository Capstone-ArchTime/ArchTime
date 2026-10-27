import type { DecisionSource, MyPath, StepKind, WorkspaceDecision, WorkspaceRefs } from './onboarding-api';
import { evidenceHref } from './chat-answer.ts';

// What a learner sees around a step (the component's neighbours, the decisions about it, an ADR's sources) and the
// question the "Ask the AI mentor" button starts with. Kept out of the components so it can be tested without them.

export const adrLabel = (number: number): string => `ADR-${String(number).padStart(3, '0')}`;

export type Neighbour = { id: string; name: string; label: string };
export type DecisionLink = { id: string; label: string; title: string };
export type ComponentContext = {
  component: WorkspaceRefs['components'][number];
  /** Components that depend on this one. */
  incoming: Neighbour[];
  /** Components this one depends on. */
  outgoing: Neighbour[];
  /** The Accepted decisions about this component, in ADR order. */
  decisions: DecisionLink[];
};

const byName = (a: Neighbour, b: Neighbour) => a.name.localeCompare(b.name) || a.label.localeCompare(b.label);

/** The component a step is about, with its dependencies both ways and the Accepted ADRs about it; null when it is gone. */
export function componentContext(refs: WorkspaceRefs, componentId: string | undefined): ComponentContext | null {
  const component = refs.components.find(c => c.id === componentId);
  if (!component) return null;
  // A dependency on a component that was since removed still reads, by its id.
  const name = (id: string) => refs.components.find(c => c.id === id)?.name ?? id;
  return {
    component,
    incoming: refs.dependencies.filter(d => d.target === component.id).map(d => ({ id: d.source, name: name(d.source), label: d.label ?? '' })).sort(byName),
    outgoing: refs.dependencies.filter(d => d.source === component.id).map(d => ({ id: d.target, name: name(d.target), label: d.label ?? '' })).sort(byName),
    decisions: refs.decisions
      .filter(d => d.status === 'Accepted' && d.componentIds.includes(component.id))
      .sort((a, b) => a.number - b.number)
      .map(d => ({ id: d.id, label: adrLabel(d.number), title: d.title })),
  };
}

export type SourceItem = {
  kind: DecisionSource['kind'];
  /** What kind of source it is, in words, with the short hash for a commit. */
  label: string;
  title: string;
  date: string | null;
  /** Only commits link anywhere: the approval queue is for maintainers, and evidence and snapshots have no page by id. */
  href: string | null;
};

const SOURCE_LABEL: Record<DecisionSource['kind'], string> = { commit: 'Commit', snapshot: 'Snapshot', evidence: 'Evidence', approval: 'Approved request' };

export function sourceItems(projectId: string, sources: readonly DecisionSource[]): SourceItem[] {
  return sources.map(source => {
    const hash = source.kind === 'commit' ? source.ref.slice(0, 7) : '';
    return {
      kind: source.kind,
      label: hash ? `${SOURCE_LABEL.commit} ${hash}` : SOURCE_LABEL[source.kind] ?? source.kind,
      title: source.title,
      date: source.date ?? null,
      href: hash ? evidenceHref(projectId, hash) : null,
    };
  });
}

export type DecisionContext = { decision: WorkspaceDecision; label: string; components: { id: string; name: string }[]; sources: SourceItem[] };

/** The decision an ADR step is about, with the components it concerns and its sources; null when it is gone. */
export function decisionContext(projectId: string, refs: WorkspaceRefs, adrId: string | undefined): DecisionContext | null {
  const decision = refs.decisions.find(d => d.id === adrId);
  if (!decision) return null;
  return {
    decision,
    label: adrLabel(decision.number),
    components: decision.componentIds.map(id => ({ id, name: refs.components.find(c => c.id === id)?.name ?? id })),
    sources: sourceItems(projectId, decision.sources),
  };
}

// ── Asking the AI mentor ──

export const MENTOR_QUESTION_MAX = 4000;

/** What a step is about, as far as the question needs it. */
export type MentorSubject = {
  kind: StepKind;
  title: string;
  componentName?: string;
  decision?: { label: string; title: string };
  commit?: { hash: string; title?: string };
  prompt?: string;
};

/** A first question for the AI mentor about one step; the learner edits it before sending. */
export function mentorQuestion(subject: MentorSubject): string {
  const text = (() => {
    if (subject.kind === 'component') {
      const name = subject.componentName ?? subject.title;
      return `What does the ${name} component do in this workspace? What does it depend on, what depends on it, and how has it changed over the commit history?`;
    }
    if (subject.kind === 'adr') {
      const what = subject.decision ? `${subject.decision.label} "${subject.decision.title}"` : `the design decision "${subject.title}"`;
      return `Why was ${what} decided? Which commits and components does it concern, and what are its consequences?`;
    }
    if (subject.kind === 'commit') {
      const hash = subject.commit?.hash.slice(0, 7);
      if (!hash) return `What changed in the architecture in the commit "${subject.title}", and why?`;
      return `What changed in the architecture in commit ${hash}${subject.commit?.title ? ` ("${subject.commit.title}")` : ''}, and why?`;
    }
    // A check question: ask for help thinking it through, not for the answer.
    return `Help me understand what this question is about, without telling me the answer: ${subject.prompt ?? subject.title}`;
  })();
  return text.slice(0, MENTOR_QUESTION_MAX);
}

/** The AI Insights page for a workspace, with the question filled in but not sent. */
export function mentorHref(projectId: string, question: string): string {
  return `/insights?${new URLSearchParams({ projectId, q: question.slice(0, MENTOR_QUESTION_MAX) }).toString()}`;
}

/** What /insights was opened with; the question is cut to what the chat box takes. */
export function readMentorParams(search: string): { projectId: string | null; question: string } {
  const params = new URLSearchParams(search);
  return { projectId: params.get('projectId') || null, question: (params.get('q') ?? '').slice(0, MENTOR_QUESTION_MAX) };
}

/**
 * The workspace Insights opens on and the question it starts with. A question from a learning step names that workspace's
 * components and decisions, so when that workspace is not in the list the question is dropped and a note says why, rather
 * than quietly sending it to another workspace.
 */
export function openingWorkspace(
  list: readonly { id: string }[],
  opened: { projectId: string | null; question: string },
): { projectId: string; question: string; note: string } {
  const first = list[0]?.id ?? '';
  if (!opened.projectId) return { projectId: first, question: opened.question, note: '' };
  if (list.some(p => p.id === opened.projectId)) return { projectId: opened.projectId, question: opened.question, note: '' };
  return {
    projectId: first,
    question: '',
    note: opened.question
      ? 'The workspace of that learning step is not available to you here, so its question was not filled in.'
      : 'That workspace is not available to you here.',
  };
}

// ── Continue learning ──

/** The path to pick up: the most recently touched one not finished yet (the server lists them in that order); null when none. */
export function pathToContinue(paths: readonly MyPath[]): { path: MyPath; others: number } | null {
  const open = paths.filter(path => path.nextStep);
  return open.length ? { path: open[0], others: open.length - 1 } : null;
}

/** The learner's page of a path, opened at one step when given. */
export function learningHref(projectId: string, pathId: string, stepId?: string): string {
  const base = `/learning/${encodeURIComponent(projectId)}/${encodeURIComponent(pathId)}`;
  return stepId ? `${base}?step=${encodeURIComponent(stepId)}` : base;
}
