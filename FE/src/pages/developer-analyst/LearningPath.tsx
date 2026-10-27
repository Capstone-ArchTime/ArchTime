import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, App, Button, Collapse, Progress, Radio, Skeleton, Tag } from 'antd';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import FeaturePage from '@/components/FeaturePage';
import { evidenceHref } from '@/features/chat-answer';
import { answerStep, completeStep, getLearnerPath, getWorkspaceRefs } from '@/features/onboarding-api';
import type { AnswerResult, LearnerPath, LearnerStep, Progress as PathProgress, WorkspaceRefs } from '@/features/onboarding-api';
import { answerFeedback, assessmentNote, firstOpenStep, kindLabel, progressText } from '@/features/onboarding-view';

const reference = 'border border-[#242527] bg-[#0d1217] p-3 text-sm space-y-1';

/** One path given to the signed-in person, step by step: read, look, answer, mark done. Only their own progress is ever shown. */
export default function LearningPath() {
  const { projectId = '', pathId = '' } = useParams();
  const { message } = App.useApp();
  const [loaded, setLoaded] = useState<{ path: LearnerPath; progress: PathProgress } | null>(null);
  const [refs, setRefs] = useState<WorkspaceRefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getLearnerPath(projectId, pathId, controller.signal),
      // The names behind the ids are a convenience: without them the steps still read.
      getWorkspaceRefs(projectId, controller.signal).catch(() => null),
    ]).then(([learner, workspace]) => {
      setLoaded(learner);
      setRefs(workspace);
      const first = firstOpenStep(learner.path.steps);
      setOpen(first >= 0 ? [learner.path.steps[first].id] : []);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this learning path.');
    });
    return () => controller.abort();
  }, [projectId, pathId, attempt]);

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

  function details(step: LearnerStep) {
    const hash = step.revision.commit ? step.revision.commit.slice(0, 7) : '';
    if (step.kind === 'component') {
      const component = refs?.components.find(c => c.id === step.componentId);
      return <div className={reference}>
        <p className="font-medium">{component ? component.name : refs ? 'This component is no longer in the diagram.' : 'A component of the architecture'}</p>
        {component && <p className="text-xs text-[#94a3b8]">{component.kind}{component.description ? ` · ${component.description}` : ''}</p>}
        <Link to={`/architecture#project=${encodeURIComponent(projectId)}`} className="text-xs text-[#93c5fd]">Open the architecture map</Link>
      </div>;
    }
    if (step.kind === 'commit') {
      return <div className={reference}>
        <p className="font-medium"><span className="font-mono text-[#93c5fd]">{hash}</span>{step.commitTitle ? ` · ${step.commitTitle}` : ''}</p>
        {hash && <Link to={evidenceHref(projectId, hash)} className="text-xs text-[#93c5fd]">See what this commit changed</Link>}
      </div>;
    }
    if (step.kind === 'adr') {
      const decision = refs?.decisions.find(d => d.id === step.adrId);
      return <div className={reference}>
        <p className="font-medium">{decision ? `ADR-${String(decision.number).padStart(3, '0')} · ${decision.title}` : refs ? 'This decision is no longer in the workspace.' : 'A design decision'}{decision && <Tag className="ml-2">{decision.status}</Tag>}</p>
        {decision?.context && <p className="text-xs text-[#94a3b8] whitespace-pre-wrap"><b>Context.</b> {decision.context}</p>}
        {decision?.decision && <p className="text-xs text-[#94a3b8] whitespace-pre-wrap"><b>Decision.</b> {decision.decision}</p>}
        {decision?.consequences && <p className="text-xs text-[#94a3b8] whitespace-pre-wrap"><b>Consequences.</b> {decision.consequences}</p>}
      </div>;
    }
    return null;
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
          label: <span className="flex flex-wrap items-center gap-2">
            {step.progress.completed ? <CheckCircle2 size={18} className="text-green-500" aria-label="Done" /> : <Circle size={18} className="text-[#94a3b8]" aria-label="Not done yet" />}
            <span className="font-medium">{i + 1}. {step.title}</span>
            <Tag>{kindLabel(step.kind)}</Tag>
            {note && <Tag color={note.level === 'error' ? 'red' : 'orange'}>{note.level === 'error' ? 'Source gone' : 'May be outdated'}</Tag>}
          </span>,
          children: <div className="space-y-3">
            {note && <Alert type={note.level} showIcon title={note.text} />}
            {step.body && <p className="text-sm whitespace-pre-wrap">{step.body}</p>}
            {details(step)}
            {action(step)}
          </div>,
        };
      })}
    />
  </FeaturePage>;
}
