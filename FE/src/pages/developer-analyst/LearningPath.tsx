import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Collapse, Progress, Radio, Skeleton, Tag } from 'antd';
import { ArrowLeft, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import FeaturePage from '@/components/FeaturePage';
import { evidenceHref } from '@/features/chat-answer';
import { answerStep, completeStep, getLearnerPath, getWorkspaceRefs } from '@/features/onboarding-api';
import type { AnswerResult, LearnerPath, LearnerStep, Progress as PathProgress, WorkspaceRefs } from '@/features/onboarding-api';
import { componentContext, decisionContext, mentorHref, mentorQuestion } from '@/features/onboarding-context';
import type { MentorSubject, Neighbour } from '@/features/onboarding-context';
import { answerFeedback, assessmentNote, firstOpenStep, kindLabel, progressText, refGone } from '@/features/onboarding-view';

const reference = 'border border-[#242527] bg-[#0d1217] p-3 text-sm space-y-2';
const heading = 'text-[10px] font-mono uppercase tracking-widest text-[#94a3b8]';
const link = 'text-[#93c5fd] hover:text-[#bfdbfe] hover:underline';
const anchor = (stepId: string) => `learning-step-${stepId}`;

/** A labelled block of an ADR's text; nothing when the ADR leaves it empty. */
function Section({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return <div><p className={heading}>{title}</p><p className="text-sm text-slate-300 whitespace-pre-wrap">{text}</p></div>;
}

/** One path given to the signed-in person, step by step: read, look, answer, mark done. Only their own progress is ever shown. */
export default function LearningPath() {
  const { projectId = '', pathId = '' } = useParams();
  const [params] = useSearchParams();
  const wantedStep = params.get('step');
  const { message } = App.useApp();
  const [loaded, setLoaded] = useState<{ path: LearnerPath; progress: PathProgress } | null>(null);
  const [refs, setRefs] = useState<WorkspaceRefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /** A step to bring into view once it has been opened (from ?step= or from a link to another step). */
  const scrollTo = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getLearnerPath(projectId, pathId, controller.signal),
      // The workspace behind the ids is a convenience: without it the steps still read.
      getWorkspaceRefs(projectId, controller.signal).catch(() => null),
    ]).then(([learner, workspace]) => {
      setLoaded(learner);
      setRefs(workspace);
      const asked = learner.path.steps.find(step => step.id === wantedStep);
      const first = firstOpenStep(learner.path.steps);
      const start = asked ?? learner.path.steps[first];
      setOpen(start ? [start.id] : []);
      if (asked) scrollTo.current = asked.id;
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this learning path.');
    });
    return () => controller.abort();
  }, [projectId, pathId, wantedStep, attempt]);

  useEffect(() => {
    const id = scrollTo.current;
    if (!id || !open.includes(id)) return;
    scrollTo.current = null;
    document.getElementById(anchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [open, loaded]);

  /** Opens another step of this path (a decision or component that has its own step) and brings it into view. */
  function openStep(stepId: string) {
    scrollTo.current = stepId;
    setOpen(prev => (prev.includes(stepId) ? [...prev] : [...prev, stepId]));
  }

  /** Applies a change to one step, and opens the next one still to do when this one has just been finished. */
  function update(stepId: string, progress: PathProgress, change: (step: LearnerStep) => LearnerStep, finished: boolean) {
    setLoaded(prev => {
      if (!prev) return prev;
      const steps = prev.path.steps.map(step => (step.id === stepId ? change(step) : step));
      if (finished) {
        const next = firstOpenStep(steps);
        setOpen(next >= 0 ? [steps[next].id] : []);
      }
      return { progress, path: { ...prev.path, steps } };
    });
  }

  async function markDone(step: LearnerStep) {
    setBusy(step.id);
    try {
      const progress = await completeStep(projectId, pathId, step.id);
      update(step.id, progress, s => ({ ...s, progress: { ...s.progress, completed: true, completedAt: s.progress.completedAt ?? new Date().toISOString() } }), true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not save your progress. Please retry.');
    } finally {
      setBusy(null);
    }
  }

  async function check(step: LearnerStep) {
    const choice = choices[step.id];
    if (choice === undefined) return;
    setBusy(step.id);
    try {
      const result = await answerStep(projectId, pathId, step.id, choice);
      setResults(prev => ({ ...prev, [step.id]: result }));
      update(step.id, result.progress, s => ({
        ...s,
        progress: { completed: result.completed, attempts: result.attempts, completedAt: result.completed ? s.progress.completedAt ?? new Date().toISOString() : s.progress.completedAt },
        question: s.question && result.correct ? { ...s.question, correctIndex: result.correctIndex, explanation: result.explanation } : s.question,
      }), result.correct);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not check your answer. Please retry.');
    } finally {
      setBusy(null);
    }
  }

  const back = <Link to="/learning" className="inline-flex items-center gap-1 text-sm text-[#93c5fd]"><ArrowLeft size={14} aria-hidden="true" />My learning</Link>;

  if (error) {
    return <FeaturePage title="Learning path" description="" demo={false} actions={back}>
      <Alert type="error" showIcon title={error} action={<Button onClick={() => { setError(null); setAttempt(a => a + 1); }}>Retry</Button>} />
    </FeaturePage>;
  }
  if (!loaded) return <FeaturePage title="Learning path" description="" demo={false} actions={back}><Skeleton active paragraph={{ rows: 6 }} /></FeaturePage>;

  const { path, progress } = loaded;
  const finished = progress.total > 0 && progress.done === progress.total;
  const stepNumber = (stepId: string) => path.steps.findIndex(s => s.id === stepId) + 1;

  /** A name that opens the step about it when this path has one, else plain text. */
  function toStep(stepId: string | undefined, text: ReactNode) {
    if (!stepId) return <span className="text-[#f4f4f6]">{text}</span>;
    return <button type="button" className={link} onClick={() => openStep(stepId)} title={`Open step ${stepNumber(stepId)}`}>{text}</button>;
  }
  const componentStep = (componentId: string) => path.steps.find(s => s.kind === 'component' && s.componentId === componentId)?.id;
  const decisionStep = (adrId: string) => path.steps.find(s => s.kind === 'adr' && s.adrId === adrId)?.id;

  function neighbours(title: string, list: Neighbour[], empty: string) {
    return <div>
      <p className={heading}>{title}</p>
      {list.length
        ? <ul className="mt-1 space-y-0.5">{list.map((n, i) => <li key={`${n.id}-${i}`}>{toStep(componentStep(n.id), n.name)}{n.label && <span className="text-[#94a3b8]"> · {n.label}</span>}</li>)}</ul>
        : <p className="text-[#94a3b8]">{empty}</p>}
    </div>;
  }

  function details(step: LearnerStep) {
    const hash = step.revision.commit ? step.revision.commit.slice(0, 7) : '';
    if (step.kind === 'component') {
      const context = refs ? componentContext(refs, step.componentId) : null;
      const map = <Link to={`/architecture#project=${encodeURIComponent(projectId)}`} className={`text-xs ${link}`}>Open the architecture map</Link>;
      if (!context) {
        // When the server already flagged the component as removed, the alert above says so; only the map link is left here.
        if (refGone(step.assessment)) return <div className={reference}>{map}</div>;
        return <div className={reference}><p className="font-medium">{refs ? 'This component is no longer in the diagram.' : 'A component of the architecture'}</p>{map}</div>;
      }
      const { component, incoming, outgoing, decisions } = context;
      return <div className={reference}>
        <p className="font-medium">{component.name}<Tag className="ml-2">{component.kind}</Tag></p>
        <p className="text-slate-300 whitespace-pre-wrap">{component.description || <span className="text-[#94a3b8]">No description yet.</span>}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {neighbours('Depends on', outgoing, 'Nothing: it calls no other component.')}
          {neighbours('Used by', incoming, 'No other component depends on it.')}
        </div>
        <div>
          <p className={heading}>Accepted design decisions about it</p>
          {decisions.length
            ? <ul className="mt-1 space-y-0.5">{decisions.map(d => <li key={d.id}>{toStep(decisionStep(d.id), <><span className="font-mono">{d.label}</span> · {d.title}</>)}</li>)}</ul>
            : <p className="text-[#94a3b8]">None recorded yet.</p>}
        </div>
        {map}
      </div>;
    }
    if (step.kind === 'commit') {
      return <div className={reference}>
        <p className="font-medium"><span className="font-mono text-[#93c5fd]">{hash}</span>{step.commitTitle ? ` · ${step.commitTitle}` : ''}</p>
        {hash && <Link to={evidenceHref(projectId, hash)} className={`text-xs ${link}`}>See what this commit changed</Link>}
      </div>;
    }
    if (step.kind === 'adr') {
      const context = refs ? decisionContext(projectId, refs, step.adrId) : null;
      if (!context) {
        if (refGone(step.assessment)) return null;
        return <div className={reference}><p className="font-medium">{refs ? 'This decision is no longer in the workspace.' : 'A design decision'}</p></div>;
      }
      const { decision, label, components, sources } = context;
      return <div className={reference}>
        <p className="font-medium"><span className="font-mono">{label}</span> · {decision.title}<Tag className="ml-2" color={decision.status === 'Accepted' ? 'green' : decision.status === 'Deprecated' ? 'default' : 'gold'}>{decision.status}</Tag></p>
        <Section title="Context" text={decision.context} />
        <Section title="Decision" text={decision.decision} />
        <Section title="Alternatives considered" text={decision.alternatives} />
        <Section title="Consequences" text={decision.consequences} />
        {components.length > 0 && <div>
          <p className={heading}>Components it concerns</p>
          <p>{components.map((c, i) => <span key={c.id}>{i > 0 && ', '}{toStep(componentStep(c.id), c.name)}</span>)}</p>
        </div>}
        <div>
          <p className={heading}>What it rests on</p>
          {sources.length
            ? <ul className="mt-1 space-y-0.5">{sources.map((s, i) => <li key={`${s.kind}-${i}`}>
              {s.href ? <Link to={s.href} className={`font-mono ${link}`}>{s.label}</Link> : <span className="text-slate-300">{s.label}</span>}
              {s.title && <span className="text-slate-300"> · {s.title}</span>}
              {s.date && <span className="text-[#94a3b8]"> · {new Date(s.date).toLocaleDateString()}</span>}
            </li>)}</ul>
            : <p className="text-[#94a3b8]">No commits or evidence attached yet.</p>}
        </div>
      </div>;
    }
    return null;
  }

  /** What the AI mentor is asked about this step, from what the page knows of it. */
  function subject(step: LearnerStep): MentorSubject {
    const component = step.kind === 'component' && refs ? refs.components.find(c => c.id === step.componentId) : undefined;
    const decision = step.kind === 'adr' && refs ? decisionContext(projectId, refs, step.adrId) : null;
    return {
      kind: step.kind, title: step.title,
      ...(component ? { componentName: component.name } : {}),
      ...(decision ? { decision: { label: decision.label, title: decision.decision.title } } : {}),
      ...(step.kind === 'commit' && step.revision.commit ? { commit: { hash: step.revision.commit, title: step.commitTitle } } : {}),
      ...(step.question ? { prompt: step.question.prompt } : {}),
    };
  }

  function action(step: LearnerStep) {
    const done = step.progress.completed;
    if (step.kind !== 'question' || !step.question) {
      return done
        ? <p className="text-sm text-green-400">Done{step.progress.completedAt ? ` on ${new Date(step.progress.completedAt).toLocaleDateString()}` : ''}.</p>
        : <Button type="primary" loading={busy === step.id} onClick={() => void markDone(step)}>Mark as done</Button>;
    }
    const question = step.question;
    const result = results[step.id];
    return <div className="space-y-3">
      <p className="font-medium">{question.prompt}</p>
      <Radio.Group value={choices[step.id]} disabled={done || busy === step.id} onChange={e => setChoices(prev => ({ ...prev, [step.id]: e.target.value as number }))} className="flex flex-col gap-2">
        {question.options.map((option, i) => (
          <Radio key={i} value={i}>{option}{done && question.correctIndex === i && <CheckCircle2 size={14} className="inline ml-2 text-green-500" aria-label="The right answer" />}</Radio>
        ))}
      </Radio.Group>
      {!done && <Button type="primary" disabled={choices[step.id] === undefined} loading={busy === step.id} onClick={() => void check(step)}>Check my answer</Button>}
      {result && !(done && !result.correct) && <Alert type={answerFeedback(result).type} showIcon title={answerFeedback(result).text} />}
      {!result && !done && step.progress.attempts > 0 && <p className="text-xs text-[#94a3b8]">You have tried {step.progress.attempts} time{step.progress.attempts === 1 ? '' : 's'} so far.</p>}
      {done && question.explanation && <Alert type="success" showIcon title="Why" description={<span className="whitespace-pre-wrap">{question.explanation}</span>} />}
    </div>;
  }

  return <FeaturePage title={path.title} description={path.description || 'A learning path from your mentors.'} demo={false} actions={back}>
    <div className="border border-[#242527] bg-[#11161b] p-5 space-y-2" aria-label="Your progress on this path">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#94a3b8]">Your progress</p><p className="text-sm font-mono">{progressText(progress)}</p></div>
      <Progress percent={progress.percent} status={finished ? 'success' : 'active'} />
    </div>
    {finished && <Alert type="success" showIcon title="You finished this path" description="You can open any step again to review it." />}
    <Collapse
      activeKey={open}
      onChange={keys => setOpen(Array.isArray(keys) ? keys : [keys])}
      items={path.steps.map((step, i) => {
        const note = assessmentNote(step.assessment);
        return {
          key: step.id,
          label: <span id={anchor(step.id)} className="flex flex-wrap items-center gap-2 scroll-mt-4">
            {step.progress.completed ? <CheckCircle2 size={18} className="text-green-500" aria-label="Done" /> : <Circle size={18} className="text-[#94a3b8]" aria-label="Not done yet" />}
            <span className="font-medium">{i + 1}. {step.title}</span>
            <Tag>{kindLabel(step.kind)}</Tag>
            {note && <Tag color={note.level === 'error' ? 'red' : 'orange'}>{note.level === 'error' ? 'Source gone' : 'May be outdated'}</Tag>}
          </span>,
          children: <div className="space-y-3">
            {note && <Alert type={note.level} showIcon title={note.text} />}
            {step.body && <p className="text-sm whitespace-pre-wrap">{step.body}</p>}
            {details(step)}
            <div className="flex flex-wrap items-start justify-between gap-3">
              {action(step)}
              <Link to={mentorHref(projectId, mentorQuestion(subject(step)))}>
                <Button icon={<Sparkles size={14} aria-hidden="true" />}>Ask the AI mentor about this</Button>
              </Link>
            </div>
          </div>,
        };
      })}
    />
  </FeaturePage>;
}
