import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Collapse, Progress, Radio, Skeleton, Tag, Tooltip } from 'antd';
import { MAP_KIND, canonicalSummary } from '@/features/canonical-map';
import { ArrowLeft, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import FeaturePage from '@/components/FeaturePage';
import { evidenceHref } from '@/features/chat-answer';
import { answerStep, completeStep, getLearnerPath, getWorkspaceRefs } from '@/features/onboarding-api';
import type { AnswerResult, LearnerPath, LearnerStep, Progress as PathProgress, WorkspaceRefs } from '@/features/onboarding-api';
import { componentContext, decisionContext, mentorHref, mentorQuestion } from '@/features/onboarding-context';
import type { MentorSubject, Neighbour } from '@/features/onboarding-context';
import { answerFeedback, assessmentNote, firstOpenStep, kindLabel, progressText, refGone } from '@/features/onboarding-view';
import { formatDate } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load this learning path.', saveFailed: 'Could not save your progress. Please retry.', checkFailed: 'Could not check your answer. Please retry.',
  myLearning: 'My learning', learningPath: 'Learning path', retry: 'Retry', openStep: 'Open step {n}', openMap: 'Open the architecture map',
  componentGone: 'This component is no longer in the diagram.', aComponent: 'A component of the architecture', noDescription: 'No description yet.',
  dependsOn: 'Depends on', dependsNone: 'Nothing: it calls no other component.', usedBy: 'Used by', usedNone: 'No other component depends on it.',
  decisionsAbout: 'Accepted design decisions about it', noneYet: 'None recorded yet.', seeCommit: 'See what this commit changed',
  decisionGone: 'This decision is no longer in the workspace.', aDecision: 'A design decision', context: 'Context', decision: 'Decision', alternatives: 'Alternatives considered', consequences: 'Consequences',
  concerns: 'Components it concerns', restsOn: 'What it rests on', noSources: 'No commits or evidence attached yet.',
  done: 'Done.', doneOn: 'Done on {date}.', markDone: 'Mark as done', rightAnswer: 'The right answer', checkAnswer: 'Check my answer',
  tried: 'You have tried {count} times so far.', tried_one: 'You have tried 1 time so far.', why: 'Why', defaultDescription: 'A learning path from your mentors.',
  progressLabel: 'Your progress on this path', progress: 'Your progress', whichArch: 'Which architecture these steps refer to', draftDiagram: 'Draft component diagram',
  confirmed: 'The components in these steps are the reference architecture. {summary}', unconfirmed: 'The components in these steps come from a diagram no maintainer has confirmed yet; ask your mentor if something looks off.',
  finishedTitle: 'You finished this path', finishedBody: 'You can open any step again to review it.', stepDone: 'Done', notDone: 'Not done yet', sourceGone: 'Source gone', outdated: 'May be outdated',
  askMentor: 'Ask the AI mentor about this',
}, {
  loadFailed: 'Không tải được lộ trình học này.', saveFailed: 'Không lưu được tiến độ. Vui lòng thử lại.', checkFailed: 'Không kiểm tra được câu trả lời. Vui lòng thử lại.',
  myLearning: 'Việc học của tôi', learningPath: 'Lộ trình học', retry: 'Thử lại', openStep: 'Mở bước {n}', openMap: 'Mở bản đồ kiến trúc',
  componentGone: 'Thành phần này không còn trong sơ đồ.', aComponent: 'Một thành phần của kiến trúc', noDescription: 'Chưa có mô tả.',
  dependsOn: 'Phụ thuộc vào', dependsNone: 'Không có: nó không gọi thành phần nào khác.', usedBy: 'Được dùng bởi', usedNone: 'Không thành phần nào khác phụ thuộc vào nó.',
  decisionsAbout: 'Các quyết định thiết kế đã chấp nhận về nó', noneYet: 'Chưa ghi nhận.', seeCommit: 'Xem commit này đã thay đổi gì',
  decisionGone: 'Quyết định này không còn trong không gian làm việc.', aDecision: 'Một quyết định thiết kế', context: 'Bối cảnh', decision: 'Quyết định', alternatives: 'Các phương án đã cân nhắc', consequences: 'Hệ quả',
  concerns: 'Các thành phần liên quan', restsOn: 'Căn cứ của nó', noSources: 'Chưa đính kèm commit hay bằng chứng nào.',
  done: 'Đã xong.', doneOn: 'Đã xong ngày {date}.', markDone: 'Đánh dấu đã xong', rightAnswer: 'Đáp án đúng', checkAnswer: 'Kiểm tra câu trả lời',
  tried: 'Bạn đã thử {count} lần.', why: 'Vì sao', defaultDescription: 'Một lộ trình học từ mentor của bạn.',
  progressLabel: 'Tiến độ của bạn trên lộ trình này', progress: 'Tiến độ của bạn', whichArch: 'Kiến trúc mà các bước này nói tới', draftDiagram: 'Sơ đồ thành phần nháp',
  confirmed: 'Các thành phần trong các bước này là kiến trúc tham chiếu. {summary}', unconfirmed: 'Các thành phần trong các bước này lấy từ sơ đồ chưa được người bảo trì xác nhận; hãy hỏi mentor nếu thấy điều gì không đúng.',
  finishedTitle: 'Bạn đã hoàn thành lộ trình này', finishedBody: 'Bạn có thể mở lại bất kỳ bước nào để ôn tập.', stepDone: 'Đã xong', notDone: 'Chưa xong', sourceGone: 'Nguồn đã mất', outdated: 'Có thể đã cũ',
  askMentor: 'Hỏi mentor AI về bước này',
});

const reference = 'border border-[var(--at-line)] bg-[var(--at-panel-2)] p-3 text-sm space-y-2';
const heading = 'text-[10px] font-mono uppercase tracking-widest text-[var(--at-muted)]';
const link = 'text-[var(--at-link)] hover:text-[var(--at-link-hover)] hover:underline';
const anchor = (stepId: string) => `learning-step-${stepId}`;

/** A labelled block of an ADR's text; nothing when the ADR leaves it empty. */
function Section({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return <div><p className={heading}>{title}</p><p className="text-sm text-[var(--at-muted)] whitespace-pre-wrap">{text}</p></div>;
}

/** One path given to the signed-in person, step by step: read, look, answer, mark done. Only their own progress is ever shown. */
export default function LearningPath() {
  const { projectId = '', pathId = '' } = useParams();
  const [params] = useSearchParams();
  const wantedStep = params.get('step');
  const { message } = App.useApp();
  const m = useMessages(MSG);
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
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'loadFailed'));
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
      message.error(cause instanceof Error ? cause.message : m('saveFailed'));
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
      message.error(cause instanceof Error ? cause.message : m('checkFailed'));
    } finally {
      setBusy(null);
    }
  }

  const back = <Link to="/learning" className="inline-flex items-center gap-1 text-sm text-[var(--at-link)]"><ArrowLeft size={14} aria-hidden="true" />{m('myLearning')}</Link>;

  if (error) {
    return <FeaturePage title={m('learningPath')} description="" demo={false} actions={back}>
      <Alert type="error" showIcon title={error} action={<Button onClick={() => { setError(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />
    </FeaturePage>;
  }
  if (!loaded) return <FeaturePage title={m('learningPath')} description="" demo={false} actions={back}><Skeleton active paragraph={{ rows: 6 }} /></FeaturePage>;

  const { path, progress } = loaded;
  const finished = progress.total > 0 && progress.done === progress.total;
  const stepNumber = (stepId: string) => path.steps.findIndex(s => s.id === stepId) + 1;

  /** A name that opens the step about it when this path has one, else plain text. */
  function toStep(stepId: string | undefined, text: ReactNode) {
    if (!stepId) return <span className="text-[var(--at-text)]">{text}</span>;
    return <button type="button" className={link} onClick={() => openStep(stepId)} title={m('openStep', { n: stepNumber(stepId) })}>{text}</button>;
  }
  const componentStep = (componentId: string) => path.steps.find(s => s.kind === 'component' && s.componentId === componentId)?.id;
  const decisionStep = (adrId: string) => path.steps.find(s => s.kind === 'adr' && s.adrId === adrId)?.id;

  function neighbours(title: string, list: Neighbour[], empty: string) {
    return <div>
      <p className={heading}>{title}</p>
      {list.length
        ? <ul className="mt-1 space-y-0.5">{list.map((n, i) => <li key={`${n.id}-${i}`}>{toStep(componentStep(n.id), n.name)}{n.label && <span className="text-[var(--at-muted)]"> · {n.label}</span>}</li>)}</ul>
        : <p className="text-[var(--at-muted)]">{empty}</p>}
    </div>;
  }

  function details(step: LearnerStep) {
    const hash = step.revision.commit ? step.revision.commit.slice(0, 7) : '';
    if (step.kind === 'component') {
      const context = refs ? componentContext(refs, step.componentId) : null;
      const map = <Link to={`/architecture#project=${encodeURIComponent(projectId)}`} className={`text-xs ${link}`}>{m('openMap')}</Link>;
      if (!context) {
        // When the server already flagged the component as removed, the alert above says so; only the map link is left here.
        if (refGone(step.assessment)) return <div className={reference}>{map}</div>;
        return <div className={reference}><p className="font-medium">{refs ? m('componentGone') : m('aComponent')}</p>{map}</div>;
      }
      const { component, incoming, outgoing, decisions } = context;
      return <div className={reference}>
        <p className="font-medium">{component.name}<Tag className="ml-2">{component.kind}</Tag></p>
        <p className="text-[var(--at-muted)] whitespace-pre-wrap">{component.description || <span className="text-[var(--at-muted)]">{m('noDescription')}</span>}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {neighbours(m('dependsOn'), outgoing, m('dependsNone'))}
          {neighbours(m('usedBy'), incoming, m('usedNone'))}
        </div>
        <div>
          <p className={heading}>{m('decisionsAbout')}</p>
          {decisions.length
            ? <ul className="mt-1 space-y-0.5">{decisions.map(d => <li key={d.id}>{toStep(decisionStep(d.id), <><span className="font-mono">{d.label}</span> · {d.title}</>)}</li>)}</ul>
            : <p className="text-[var(--at-muted)]">{m('noneYet')}</p>}
        </div>
        {map}
      </div>;
    }
    if (step.kind === 'commit') {
      return <div className={reference}>
        <p className="font-medium"><span className="font-mono text-[var(--at-link)]">{hash}</span>{step.commitTitle ? ` · ${step.commitTitle}` : ''}</p>
        {hash && <Link to={evidenceHref(projectId, hash)} className={`text-xs ${link}`}>{m('seeCommit')}</Link>}
      </div>;
    }
    if (step.kind === 'adr') {
      const context = refs ? decisionContext(projectId, refs, step.adrId) : null;
      if (!context) {
        if (refGone(step.assessment)) return null;
        return <div className={reference}><p className="font-medium">{refs ? m('decisionGone') : m('aDecision')}</p></div>;
      }
      const { decision, label, components, sources } = context;
      return <div className={reference}>
        <p className="font-medium"><span className="font-mono">{label}</span> · {decision.title}<Tag className="ml-2" color={decision.status === 'Accepted' ? 'green' : decision.status === 'Deprecated' ? 'default' : 'gold'}>{decision.status}</Tag></p>
        <Section title={m('context')} text={decision.context} />
        <Section title={m('decision')} text={decision.decision} />
        <Section title={m('alternatives')} text={decision.alternatives} />
        <Section title={m('consequences')} text={decision.consequences} />
        {components.length > 0 && <div>
          <p className={heading}>{m('concerns')}</p>
          <p>{components.map((c, i) => <span key={c.id}>{i > 0 && ', '}{toStep(componentStep(c.id), c.name)}</span>)}</p>
        </div>}
        <div>
          <p className={heading}>{m('restsOn')}</p>
          {sources.length
            ? <ul className="mt-1 space-y-0.5">{sources.map((s, i) => <li key={`${s.kind}-${i}`}>
              {s.href ? <Link to={s.href} className={`font-mono ${link}`}>{s.label}</Link> : <span className="text-[var(--at-muted)]">{s.label}</span>}
              {s.title && <span className="text-[var(--at-muted)]"> · {s.title}</span>}
              {s.date && <span className="text-[var(--at-muted)]"> · {formatDate(s.date)}</span>}
            </li>)}</ul>
            : <p className="text-[var(--at-muted)]">{m('noSources')}</p>}
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
        ? <p className="text-sm text-[var(--at-success)]">{step.progress.completedAt ? m('doneOn', { date: formatDate(step.progress.completedAt) }) : m('done')}</p>
        : <Button type="primary" loading={busy === step.id} onClick={() => void markDone(step)}>{m('markDone')}</Button>;
    }
    const question = step.question;
    const result = results[step.id];
    return <div className="space-y-3">
      <p className="font-medium">{question.prompt}</p>
      <Radio.Group value={choices[step.id]} disabled={done || busy === step.id} onChange={e => setChoices(prev => ({ ...prev, [step.id]: e.target.value as number }))} className="flex flex-col gap-2">
        {question.options.map((option, i) => (
          <Radio key={i} value={i}>{option}{done && question.correctIndex === i && <CheckCircle2 size={14} className="inline ml-2 text-[var(--at-success)]" aria-label={m('rightAnswer')} />}</Radio>
        ))}
      </Radio.Group>
      {!done && <Button type="primary" disabled={choices[step.id] === undefined} loading={busy === step.id} onClick={() => void check(step)}>{m('checkAnswer')}</Button>}
      {result && !(done && !result.correct) && <Alert type={answerFeedback(result).type} showIcon title={answerFeedback(result).text} />}
      {!result && !done && step.progress.attempts > 0 && <p className="text-xs text-[var(--at-muted)]">{m('tried', { count: step.progress.attempts })}</p>}
      {done && question.explanation && <Alert type="success" showIcon title={m('why')} description={<span className="whitespace-pre-wrap">{question.explanation}</span>} />}
    </div>;
  }

  return <FeaturePage title={path.title} description={path.description || m('defaultDescription')} demo={false} actions={back}>
    <div className="border border-[var(--at-line)] bg-[var(--at-panel)] p-5 space-y-2" aria-label={m('progressLabel')}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[var(--at-muted)]">{m('progress')}</p><p className="text-sm font-mono">{progressText(progress)}</p></div>
      <Progress percent={progress.percent} status={finished ? 'success' : 'active'} />
    </div>
    {refs?.canonical && <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--at-muted)]" aria-label={m('whichArch')}>
      <Tooltip title={MAP_KIND.canonical.description}>
        <Tag color={refs.canonical.confirmed ? MAP_KIND.canonical.color : 'gold'}>{refs.canonical.confirmed ? MAP_KIND.canonical.label : m('draftDiagram')}</Tag>
      </Tooltip>
      <span>{refs.canonical.confirmed
        ? m('confirmed', { summary: canonicalSummary(refs.canonical) })
        : m('unconfirmed')}</span>
    </div>}
    {finished && <Alert type="success" showIcon title={m('finishedTitle')} description={m('finishedBody')} />}
    <Collapse
      activeKey={open}
      onChange={keys => setOpen(Array.isArray(keys) ? keys : [keys])}
      items={path.steps.map((step, i) => {
        const note = assessmentNote(step.assessment);
        return {
          key: step.id,
          label: <span id={anchor(step.id)} className="flex flex-wrap items-center gap-2 scroll-mt-4">
            {step.progress.completed ? <CheckCircle2 size={18} className="text-[var(--at-success)]" aria-label={m('stepDone')} /> : <Circle size={18} className="text-[var(--at-muted)]" aria-label={m('notDone')} />}
            <span className="font-medium">{i + 1}. {step.title}</span>
            <Tag>{kindLabel(step.kind)}</Tag>
            {note && <Tag color={note.level === 'error' ? 'red' : 'orange'}>{note.level === 'error' ? m('sourceGone') : m('outdated')}</Tag>}
          </span>,
          children: <div className="space-y-3">
            {note && <Alert type={note.level} showIcon title={note.text} />}
            {step.body && <p className="text-sm whitespace-pre-wrap">{step.body}</p>}
            {details(step)}
            <div className="flex flex-wrap items-start justify-between gap-3">
              {action(step)}
              <Link to={mentorHref(projectId, mentorQuestion(subject(step)))}>
                <Button icon={<Sparkles size={14} aria-hidden="true" />}>{m('askMentor')}</Button>
              </Link>
            </div>
          </div>,
        };
      })}
    />
  </FeaturePage>;
}
