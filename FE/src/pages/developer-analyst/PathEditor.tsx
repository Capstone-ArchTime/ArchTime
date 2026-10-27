import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Checkbox, Input, Popconfirm, Radio, Segmented, Select, Skeleton, Tag } from 'antd';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { ApiError } from '@/api/client';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { createPath, getCommitChoices, getPath, getWorkspaceRefs, savePath } from '@/features/onboarding-api';
import type { CommitChoice, MentorPath, StepAssessment, WorkspaceRefs } from '@/features/onboarding-api';
import {
  MAX_STEPS, STEP_KINDS, addOption, assessmentNote, checkDraft, draftFromPath, kindLabel, moveStep, newDraft, newStep, payloadFromDraft,
  problemsByStep, refGone, removeOption,
} from '@/features/onboarding-view';
import type { DraftStep, FieldProblems, PathDraft } from '@/features/onboarding-view';

const NONE: FieldProblems = { path: {}, steps: {} };
const fieldError = (problem: string | undefined) => (problem ? <p role="alert" className="mt-1 text-xs text-red-400">{problem}</p> : null);

type StepEditorProps = {
  index: number; count: number; step: DraftStep; problems: Record<string, string>; assessment?: StepAssessment;
  refs: WorkspaceRefs | null; commits: CommitChoice[];
  onChange: (change: Partial<DraftStep>) => void; onMove: (to: number) => void; onRemove: () => void;
};

/** One step of the path: what it points at, what the mentor says about it, and (for questions) the answers. */
function StepEditor({ index, count, step, problems, assessment, refs, commits, onChange, onMove, onRemove }: StepEditorProps) {
  const n = index + 1;
  const note = assessmentNote(assessment);
  const q = step.question;
  const setQuestion = (change: Partial<typeof q>) => onChange({ question: { ...q, ...change } });

  const components = refs?.components ?? [];
  const decisions = refs?.decisions ?? [];
  const componentOptions = [
    ...components.map(c => ({ value: c.id, label: `${c.name} (${c.kind})` })),
    ...(step.componentId && !components.some(c => c.id === step.componentId) ? [{ value: step.componentId, label: `${step.componentId} (not in the diagram any more)` }] : []),
  ];
  const decisionOptions = [
    ...decisions.map(d => ({ value: d.id, label: `ADR-${String(d.number).padStart(3, '0')} · ${d.title} (${d.status})` })),
    ...(step.adrId && !decisions.some(d => d.id === step.adrId) ? [{ value: step.adrId, label: `${step.adrId} (not in the workspace any more)` }] : []),
  ];
  const commitOptions = [
    ...commits.map(c => ({ value: c.hash, label: `${c.hash.slice(0, 7)} · ${c.title}` })),
    ...(step.commit && !commits.some(c => c.hash === step.commit) ? [{ value: step.commit, label: `${step.commit.slice(0, 7)} (no longer in the history)` }] : []),
  ];

  return <section className={`${featurePanel} space-y-3`} aria-label={`Step ${n}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-[#94a3b8]">{n}.</span>
        {step.id
          ? <Tag>{kindLabel(step.kind)}</Tag>
          : <Select size="small" aria-label={`Kind of step ${n}`} value={step.kind} onChange={kind => onChange({ kind })} options={STEP_KINDS.map(k => ({ value: k.kind, label: k.label }))} className="w-40" />}
        {!step.id && <Tag color="blue">New</Tag>}
      </div>
      <div className="flex gap-1">
        <Button size="small" icon={<ArrowUp size={14} />} aria-label={`Move step ${n} up`} disabled={index === 0} onClick={() => onMove(index - 1)} />
        <Button size="small" icon={<ArrowDown size={14} />} aria-label={`Move step ${n} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)} />
        <Popconfirm title={`Remove step ${n}?`} description={step.id ? 'People who have this path lose their progress on this step.' : undefined} okText="Remove" okButtonProps={{ danger: true }} onConfirm={onRemove}>
          <Button size="small" danger icon={<Trash2 size={14} />} aria-label={`Remove step ${n}`} />
        </Popconfirm>
      </div>
    </div>

    {note && <Alert type={note.level} showIcon title={note.text}
      description={refGone(assessment)
        ? `Choose another ${step.kind === 'component' ? 'component' : 'design decision'} below, or remove this step.`
        : step.kind === 'commit' && note.level === 'error' ? 'Choose another commit below to bring this step up to date.' : (
          <Checkbox checked={step.repin} onChange={e => onChange({ repin: e.target.checked })}>
            {step.kind === 'component' || step.kind === 'adr' ? 'I have checked this step against the current version: mark it up to date when I save' : 'Update this step to the current map when I save'}
          </Checkbox>)} />}

    <div>
      <Input aria-label={`Title of step ${n}`} placeholder="Title, for example: How billing is split from orders" maxLength={120} value={step.title} status={problems.title ? 'error' : undefined} onChange={e => onChange({ title: e.target.value })} />
      {fieldError(problems.title)}
    </div>
    <div>
      <Input.TextArea aria-label={`Notes for step ${n}`} placeholder="What should the learner read or look at, and why does it matter?" rows={3} maxLength={4000} value={step.body} onChange={e => onChange({ body: e.target.value })} />
      {fieldError(problems.body)}
    </div>

    {step.kind === 'component' && <div>
      <Select showSearch optionFilterProp="label" className="w-full" aria-label={`Component of step ${n}`} placeholder={components.length ? 'Choose a component' : 'This workspace has no components in its diagram yet'}
        value={step.componentId || undefined} onChange={componentId => onChange({ componentId })} options={componentOptions} status={problems.componentId ? 'error' : undefined} />
      {fieldError(problems.componentId)}
    </div>}
    {step.kind === 'adr' && <div>
      <Select showSearch optionFilterProp="label" className="w-full" aria-label={`Design decision of step ${n}`} placeholder={decisions.length ? 'Choose a design decision' : 'This workspace has no design decisions yet'}
        value={step.adrId || undefined} onChange={adrId => onChange({ adrId })} options={decisionOptions} status={problems.adrId ? 'error' : undefined} />
      {fieldError(problems.adrId)}
    </div>}
    {step.kind === 'commit' && <div>
      <Select showSearch optionFilterProp="label" className="w-full" aria-label={`Commit of step ${n}`} placeholder={commits.length ? 'Choose a commit' : 'No commits have been mined in this workspace yet'}
        value={step.commit || undefined} onChange={commit => onChange({ commit })} options={commitOptions} status={problems.commit ? 'error' : undefined} />
      {fieldError(problems.commit)}
    </div>}

    {step.kind === 'question' && <div className="space-y-3">
      <div>
        <Input.TextArea aria-label={`Question of step ${n}`} placeholder="The question" rows={2} maxLength={500} value={q.prompt} status={problems['question.prompt'] ? 'error' : undefined} onChange={e => setQuestion({ prompt: e.target.value })} />
        {fieldError(problems['question.prompt'])}
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs text-[#94a3b8]">Answers: select the right one</legend>
        <Radio.Group value={q.correctIndex} onChange={e => setQuestion({ correctIndex: e.target.value as number })} className="flex w-full flex-col gap-2">
          {q.options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <Radio value={i} aria-label={`Answer ${i + 1} of step ${n} is the right one`} />
              <Input aria-label={`Answer ${i + 1} of step ${n}`} placeholder={`Answer ${i + 1}`} maxLength={200} value={option} onChange={e => setQuestion({ options: q.options.map((o, j) => (j === i ? e.target.value : o)) })} />
              <Button size="small" icon={<Trash2 size={14} />} aria-label={`Remove answer ${i + 1} of step ${n}`} disabled={q.options.length <= 2} onClick={() => onChange({ question: removeOption(q, i) })} />
            </div>
          ))}
        </Radio.Group>
        {fieldError(Object.entries(problems).find(([key]) => key.startsWith('question.options'))?.[1] ?? problems['question.correctIndex'])}
        <Button size="small" icon={<Plus size={14} />} disabled={q.options.length >= 6} onClick={() => onChange({ question: addOption(q) })}>Add an answer</Button>
      </fieldset>
      <Input.TextArea aria-label={`Explanation of step ${n}`} placeholder="Why that answer is right (shown after the learner answers correctly)" rows={2} maxLength={1000} value={q.explanation} onChange={e => setQuestion({ explanation: e.target.value })} />
    </div>}
  </section>;
}

/** Writing or editing one learning path of a workspace: its steps, what each points at, and whether people can see it yet. */
export default function PathEditor() {
  const { projectId = '', pathId } = useParams();
  const isNew = !pathId;
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const keys = useRef(0);
  const nextKey = useCallback(() => `step-${++keys.current}`, []);

  const [draft, setDraft] = useState<PathDraft | null>(isNew ? newDraft() : null);
  const [savedAs, setSavedAs] = useState<string>(() => JSON.stringify(payloadFromDraft(newDraft())));
  const [serverPath, setServerPath] = useState<MentorPath | null>(null);
  const [refs, setRefs] = useState<WorkspaceRefs | null>(null);
  const [commits, setCommits] = useState<CommitChoice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [problems, setProblems] = useState<FieldProblems>(NONE);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const adopt = useCallback((path: MentorPath) => {
    const loaded = draftFromPath(path, () => nextKey());
    setServerPath(path);
    setDraft(loaded);
    setSavedAs(JSON.stringify(payloadFromDraft(loaded)));
    setConflict(null);
    setProblems(NONE);
  }, [nextKey]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      pathId ? getPath(projectId, pathId, controller.signal) : Promise.resolve(null),
      getWorkspaceRefs(projectId, controller.signal),
      getCommitChoices(projectId, controller.signal).catch(() => [] as CommitChoice[]),
    ]).then(([path, workspace, commitList]) => {
      setRefs(workspace);
      setCommits(commitList);
      if (path) adopt(path);
    }).catch(cause => {
      if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Could not load this learning path.');
    });
    return () => controller.abort();
  }, [projectId, pathId, attempt, adopt]);

  const dirty = !!draft && JSON.stringify(payloadFromDraft(draft)) !== savedAs;
  useUnsavedChanges(dirty);

  // After creating, leave for the saved path's own page once the draft counts as saved (so the unsaved-changes guard stays quiet).
  useEffect(() => { if (createdId) navigate(`/learning/manage/${encodeURIComponent(projectId)}/${encodeURIComponent(createdId)}`, { replace: true }); }, [createdId, navigate, projectId]);

  const change = (patch: Partial<PathDraft>) => setDraft(d => d && { ...d, ...patch });
  const changeStep = (index: number, patch: Partial<DraftStep>) => setDraft(d => d && { ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const addStep = (kind: DraftStep['kind']) => setDraft(d => d && { ...d, steps: [...d.steps, newStep(kind, nextKey())] });

  async function save() {
    if (!draft) return;
    const local = problemsByStep(checkDraft(draft));
    if (Object.keys(local.path).length || Object.keys(local.steps).length) {
      setProblems(local);
      message.error('Some fields need attention before this can be saved.');
      return;
    }
    setProblems(NONE);
    setSaving(true);
    try {
      const body = payloadFromDraft(draft);
      if (isNew) {
        const created = await createPath(projectId, body);
        setSavedAs(JSON.stringify(body));
        message.success('Learning path created.');
        setCreatedId(created.id);
      } else {
        adopt(await savePath(projectId, pathId!, body));
        message.success('Learning path saved.');
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setConflict(cause.message);
      else if (cause instanceof ApiError && cause.fields) { setProblems(problemsByStep(cause.fields)); message.error(cause.message); }
      else message.error(cause instanceof Error ? cause.message : 'Could not save the learning path. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  function loadLatest() {
    const reload = () => { setConflict(null); setAttempt(a => a + 1); };
    if (!dirty) { reload(); return; }
    modal.confirm({ title: 'Load the latest version?', content: 'Your unsaved changes will be discarded. Copy anything you want to keep before continuing.', okText: 'Discard and load latest', okButtonProps: { danger: true }, onOk: reload });
  }

  const back = <Link to={`/learning?tab=manage&workspace=${encodeURIComponent(projectId)}`} className="inline-flex items-center gap-1 text-sm text-[#93c5fd]"><ArrowLeft size={14} aria-hidden="true" />Manage paths</Link>;
  const title = isNew ? 'New learning path' : 'Edit learning path';
  const description = 'Steps explain components, commits and design decisions of this workspace, and check understanding with questions.';

  if (loadError) {
    return <FeaturePage title={title} description={description} demo={false} actions={back}>
      <Alert type="error" showIcon title={loadError} description="Only owners and maintainers of a workspace can write its learning paths." action={<Button onClick={() => { setLoadError(null); setAttempt(a => a + 1); }}>Retry</Button>} />
    </FeaturePage>;
  }
  if (!draft) return <FeaturePage title={title} description={description} demo={false} actions={back}><Skeleton active paragraph={{ rows: 8 }} /></FeaturePage>;

  return <FeaturePage title={title} description={description} demo={false} actions={back}>
    {conflict && <Alert type="error" showIcon title="Not saved: someone else changed this path" description={<div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><span>{conflict} Your changes are kept here but were not saved.</span><Button size="small" danger onClick={loadLatest}>Load latest version</Button></div>} />}

    <section className={`${featurePanel} space-y-4`} aria-label="About this path">
      <div>
        <label htmlFor="path-title" className="mb-1 block text-xs text-[#94a3b8]">Title</label>
        <Input id="path-title" placeholder="For example: Week 1, the billing core" maxLength={120} value={draft.title} status={problems.path.title ? 'error' : undefined} onChange={e => change({ title: e.target.value })} />
        {fieldError(problems.path.title)}
      </div>
      <div>
        <label htmlFor="path-description" className="mb-1 block text-xs text-[#94a3b8]">Description</label>
        <Input.TextArea id="path-description" placeholder="Who is this for, and what will they know afterwards?" rows={3} maxLength={2000} value={draft.description} onChange={e => change({ description: e.target.value })} />
        {fieldError(problems.path.description)}
      </div>
      <div>
        <p className="mb-1 text-xs text-[#94a3b8]">Who can see it</p>
        <Segmented value={draft.status} onChange={v => change({ status: v as PathDraft['status'] })} options={[{ value: 'draft', label: 'Draft: only you' }, { value: 'published', label: 'Published: people it is given to' }]} />
        {fieldError(problems.path.status)}
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">Steps <span className="text-sm font-normal text-[#94a3b8]">{draft.steps.length} of {MAX_STEPS}</span></h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Add a step">
        {STEP_KINDS.map(k => <Button key={k.kind} icon={<Plus size={14} />} title={k.hint} disabled={draft.steps.length >= MAX_STEPS} onClick={() => addStep(k.kind)}>{k.label}</Button>)}
      </div>
    </div>
    {fieldError(problems.path.steps)}

    {!draft.steps.length && <div className={`${featurePanel} text-sm text-[#94a3b8]`}>No steps yet. Add a component, a commit, a design decision or a question to start.</div>}
    {draft.steps.map((step, i) => (
      <div key={step.key}>
        <StepEditor index={i} count={draft.steps.length} step={step} problems={problems.steps[i] ?? {}} assessment={serverPath?.steps.find(s => s.id === step.id)?.assessment}
          refs={refs} commits={commits} onChange={patch => changeStep(i, patch)} onMove={to => setDraft(d => d && { ...d, steps: moveStep(d.steps, i, to) })}
          onRemove={() => setDraft(d => d && { ...d, steps: d.steps.filter((_, j) => j !== i) })} />
      </div>
    ))}

    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border border-[#242527] bg-[#0b0f13] p-3">
      <p className="text-xs text-[#94a3b8]">{isNew ? 'Not saved yet.' : `Revision ${serverPath?.revision ?? ''}${dirty ? ' · unsaved changes' : ' · saved'}`}</p>
      <div className="flex gap-2">
        {!isNew && <Button disabled={!dirty || saving} onClick={() => serverPath && adopt(serverPath)}>Discard changes</Button>}
        <Button type="primary" loading={saving} disabled={!isNew && !dirty} onClick={() => void save()}>{isNew ? 'Create path' : 'Save'}</Button>
      </div>
    </div>
  </FeaturePage>;
}
