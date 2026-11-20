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
import { defineMessages, message as translate, useMessages } from '@/i18n/define';
import type { Params } from '@/i18n';

const MSG = defineMessages({
  notInDiagram: '{id} (not in the diagram any more)', notInWorkspace: '{id} (not in the workspace any more)', notInHistory: '{hash} (no longer in the history)',
  step: 'Step {n}', kindOf: 'Kind of step {n}', new: 'New', moveUp: 'Move step {n} up', moveDown: 'Move step {n} down', removeTitle: 'Remove step {n}?',
  removeBody: 'People who have this path lose their progress on this step.', remove: 'Remove', removeStep: 'Remove step {n}',
  chooseOtherComponent: 'Choose another component below, or remove this step.', chooseOtherAdr: 'Choose another design decision below, or remove this step.',
  chooseOtherCommit: 'Choose another commit below to bring this step up to date.', checked: 'I have checked this step against the current version: mark it up to date when I save', updateMap: 'Update this step to the current map when I save',
  titleOf: 'Title of step {n}', titlePlaceholder: 'Title, for example: How billing is split from orders', notesOf: 'Notes for step {n}', notesPlaceholder: 'What should the learner read or look at, and why does it matter?',
  componentOf: 'Component of step {n}', chooseComponent: 'Choose a component', noComponents: 'This workspace has no components in its diagram yet',
  adrOf: 'Design decision of step {n}', chooseAdr: 'Choose a design decision', noAdrs: 'This workspace has no design decisions yet',
  commitOf: 'Commit of step {n}', chooseCommit: 'Choose a commit', noCommits: 'No commits have been mined in this workspace yet',
  questionOf: 'Question of step {n}', question: 'The question', answers: 'Answers: select the right one', answerRight: 'Answer {i} of step {n} is the right one', answerOf: 'Answer {i} of step {n}', answer: 'Answer {i}',
  removeAnswer: 'Remove answer {i} of step {n}', addAnswer: 'Add an answer', explanationOf: 'Explanation of step {n}', explanation: 'Why that answer is right (shown after the learner answers correctly)',
  loadFailed: 'Could not load this learning path.', needsAttention: 'Some fields need attention before this can be saved.', created: 'Learning path created.', saved: 'Learning path saved.',
  saveFailed: 'Could not save the learning path. Please retry.', loadLatestTitle: 'Load the latest version?', loadLatestBody: 'Your unsaved changes will be discarded. Copy anything you want to keep before continuing.',
  discardLoad: 'Discard and load latest', managePaths: 'Manage paths', newTitle: 'New learning path', editTitle: 'Edit learning path',
  description: 'Steps explain components, commits and design decisions of this workspace, and check understanding with questions.', onlyMaintainers: 'Only owners and maintainers of a workspace can write its learning paths.', retry: 'Retry',
  conflictTitle: 'Not saved: someone else changed this path', conflictKept: '{conflict} Your changes are kept here but were not saved.', loadLatest: 'Load latest version', about: 'About this path',
  title: 'Title', titleExample: 'For example: Week 1, the billing core', descriptionLabel: 'Description', descriptionPlaceholder: 'Who is this for, and what will they know afterwards?',
  whoSees: 'Who can see it', draftOnly: 'Draft: only you', publishedGiven: 'Published: people it is given to', steps: 'Steps', stepsOf: '{n} of {max}', addStep: 'Add a step',
  noSteps: 'No steps yet. Add a component, a commit, a design decision or a question to start.', notSaved: 'Not saved yet.', revision: 'Revision {n}', unsaved: ' · unsaved changes', savedTag: ' · saved',
  discard: 'Discard changes', create: 'Create path', save: 'Save',
}, {
  notInDiagram: '{id} (không còn trong sơ đồ)', notInWorkspace: '{id} (không còn trong không gian làm việc)', notInHistory: '{hash} (không còn trong lịch sử)',
  step: 'Bước {n}', kindOf: 'Loại của bước {n}', new: 'Mới', moveUp: 'Đưa bước {n} lên', moveDown: 'Đưa bước {n} xuống', removeTitle: 'Xoá bước {n}?',
  removeBody: 'Người đã được giao lộ trình sẽ mất tiến độ ở bước này.', remove: 'Xoá', removeStep: 'Xoá bước {n}',
  chooseOtherComponent: 'Hãy chọn thành phần khác bên dưới, hoặc xoá bước này.', chooseOtherAdr: 'Hãy chọn quyết định thiết kế khác bên dưới, hoặc xoá bước này.',
  chooseOtherCommit: 'Hãy chọn commit khác bên dưới để cập nhật bước này.', checked: 'Tôi đã đối chiếu bước này với phiên bản hiện tại: đánh dấu là mới khi lưu', updateMap: 'Cập nhật bước này theo bản đồ hiện tại khi lưu',
  titleOf: 'Tiêu đề bước {n}', titlePlaceholder: 'Tiêu đề, ví dụ: Thanh toán được tách khỏi đơn hàng thế nào', notesOf: 'Ghi chú cho bước {n}', notesPlaceholder: 'Người học nên đọc hoặc xem gì, và vì sao điều đó quan trọng?',
  componentOf: 'Thành phần của bước {n}', chooseComponent: 'Chọn một thành phần', noComponents: 'Sơ đồ của không gian làm việc này chưa có thành phần nào',
  adrOf: 'Quyết định thiết kế của bước {n}', chooseAdr: 'Chọn một quyết định thiết kế', noAdrs: 'Không gian làm việc này chưa có quyết định thiết kế nào',
  commitOf: 'Commit của bước {n}', chooseCommit: 'Chọn một commit', noCommits: 'Không gian làm việc này chưa có commit nào đã mining',
  questionOf: 'Câu hỏi của bước {n}', question: 'Câu hỏi', answers: 'Đáp án: chọn đáp án đúng', answerRight: 'Đáp án {i} của bước {n} là đáp án đúng', answerOf: 'Đáp án {i} của bước {n}', answer: 'Đáp án {i}',
  removeAnswer: 'Xoá đáp án {i} của bước {n}', addAnswer: 'Thêm đáp án', explanationOf: 'Giải thích của bước {n}', explanation: 'Vì sao đáp án đó đúng (hiện sau khi người học trả lời đúng)',
  loadFailed: 'Không tải được lộ trình học này.', needsAttention: 'Một số trường cần sửa trước khi lưu.', created: 'Đã tạo lộ trình học.', saved: 'Đã lưu lộ trình học.',
  saveFailed: 'Không lưu được lộ trình học. Vui lòng thử lại.', loadLatestTitle: 'Tải phiên bản mới nhất?', loadLatestBody: 'Các thay đổi chưa lưu sẽ bị bỏ. Hãy sao chép những gì bạn muốn giữ trước khi tiếp tục.',
  discardLoad: 'Bỏ thay đổi và tải bản mới nhất', managePaths: 'Quản lý lộ trình', newTitle: 'Lộ trình học mới', editTitle: 'Sửa lộ trình học',
  description: 'Các bước giải thích thành phần, commit và quyết định thiết kế của không gian làm việc này, và kiểm tra mức hiểu bằng câu hỏi.', onlyMaintainers: 'Chỉ chủ sở hữu và người bảo trì mới viết được lộ trình học của không gian làm việc.', retry: 'Thử lại',
  conflictTitle: 'Chưa lưu: người khác đã sửa lộ trình này', conflictKept: '{conflict} Thay đổi của bạn vẫn được giữ ở đây nhưng chưa được lưu.', loadLatest: 'Tải phiên bản mới nhất', about: 'Về lộ trình này',
  title: 'Tiêu đề', titleExample: 'Ví dụ: Tuần 1, lõi thanh toán', descriptionLabel: 'Mô tả', descriptionPlaceholder: 'Lộ trình dành cho ai, và họ sẽ biết gì sau đó?',
  whoSees: 'Ai thấy được', draftOnly: 'Bản nháp: chỉ bạn', publishedGiven: 'Đã xuất bản: người được giao', steps: 'Các bước', stepsOf: '{n} / {max}', addStep: 'Thêm bước',
  noSteps: 'Chưa có bước nào. Hãy thêm một thành phần, commit, quyết định thiết kế hoặc câu hỏi để bắt đầu.', notSaved: 'Chưa lưu.', revision: 'Phiên bản {n}', unsaved: ' · có thay đổi chưa lưu', savedTag: ' · đã lưu',
  discard: 'Bỏ thay đổi', create: 'Tạo lộ trình', save: 'Lưu',
});
const tx = (key: Parameters<typeof translate<typeof MSG.en>>[1], params?: Params) => translate(MSG, key, params);

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
    ...(step.componentId && !components.some(c => c.id === step.componentId) ? [{ value: step.componentId, label: tx('notInDiagram', { id: step.componentId }) }] : []),
  ];
  const decisionOptions = [
    ...decisions.map(d => ({ value: d.id, label: `ADR-${String(d.number).padStart(3, '0')} · ${d.title} (${d.status})` })),
    ...(step.adrId && !decisions.some(d => d.id === step.adrId) ? [{ value: step.adrId, label: tx('notInWorkspace', { id: step.adrId }) }] : []),
  ];
  const commitOptions = [
    ...commits.map(c => ({ value: c.hash, label: `${c.hash.slice(0, 7)} · ${c.title}` })),
    ...(step.commit && !commits.some(c => c.hash === step.commit) ? [{ value: step.commit, label: tx('notInHistory', { hash: step.commit.slice(0, 7) }) }] : []),
  ];

  return <section className={`${featurePanel} space-y-3`} aria-label={tx('step', { n })}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-[var(--at-muted)]">{n}.</span>
        {step.id
          ? <Tag>{kindLabel(step.kind)}</Tag>
          : <Select size="small" aria-label={tx('kindOf', { n })} value={step.kind} onChange={kind => onChange({ kind })} options={STEP_KINDS.map(k => ({ value: k.kind, label: k.label }))} className="w-40" />}
        {!step.id && <Tag color="blue">{tx('new')}</Tag>}
      </div>
      <div className="flex gap-1">
        <Button size="small" icon={<ArrowUp size={14} />} aria-label={tx('moveUp', { n })} disabled={index === 0} onClick={() => onMove(index - 1)} />
        <Button size="small" icon={<ArrowDown size={14} />} aria-label={tx('moveDown', { n })} disabled={index === count - 1} onClick={() => onMove(index + 1)} />
        <Popconfirm title={tx('removeTitle', { n })} description={step.id ? tx('removeBody') : undefined} okText={tx('remove')} okButtonProps={{ danger: true }} onConfirm={onRemove}>
          <Button size="small" danger icon={<Trash2 size={14} />} aria-label={tx('removeStep', { n })} />
        </Popconfirm>
      </div>
    </div>

    {note && <Alert type={note.level} showIcon title={note.text}
      description={refGone(assessment)
        ? tx(step.kind === 'component' ? 'chooseOtherComponent' : 'chooseOtherAdr')
        : step.kind === 'commit' && note.level === 'error' ? tx('chooseOtherCommit') : (
          <Checkbox checked={step.repin} onChange={e => onChange({ repin: e.target.checked })}>
            {step.kind === 'component' || step.kind === 'adr' ? tx('checked') : tx('updateMap')}
          </Checkbox>)} />}

    <div>
      <Input aria-label={tx('titleOf', { n })} placeholder={tx('titlePlaceholder')} maxLength={120} value={step.title} status={problems.title ? 'error' : undefined} onChange={e => onChange({ title: e.target.value })} />
      {fieldError(problems.title)}
    </div>
    <div>
      <Input.TextArea aria-label={tx('notesOf', { n })} placeholder={tx('notesPlaceholder')} rows={3} maxLength={4000} value={step.body} onChange={e => onChange({ body: e.target.value })} />
      {fieldError(problems.body)}
    </div>

    {step.kind === 'component' && <div>
      <Select showSearch optionFilterProp="label" className="w-full" aria-label={tx('componentOf', { n })} placeholder={components.length ? tx('chooseComponent') : tx('noComponents')}
        value={step.componentId || undefined} onChange={componentId => onChange({ componentId })} options={componentOptions} status={problems.componentId ? 'error' : undefined} />
      {fieldError(problems.componentId)}
    </div>}
    {step.kind === 'adr' && <div>
      <Select showSearch optionFilterProp="label" className="w-full" aria-label={tx('adrOf', { n })} placeholder={decisions.length ? tx('chooseAdr') : tx('noAdrs')}
        value={step.adrId || undefined} onChange={adrId => onChange({ adrId })} options={decisionOptions} status={problems.adrId ? 'error' : undefined} />
      {fieldError(problems.adrId)}
    </div>}
    {step.kind === 'commit' && <div>
      <Select showSearch optionFilterProp="label" className="w-full" aria-label={tx('commitOf', { n })} placeholder={commits.length ? tx('chooseCommit') : tx('noCommits')}
        value={step.commit || undefined} onChange={commit => onChange({ commit })} options={commitOptions} status={problems.commit ? 'error' : undefined} />
      {fieldError(problems.commit)}
    </div>}

    {step.kind === 'question' && <div className="space-y-3">
      <div>
        <Input.TextArea aria-label={tx('questionOf', { n })} placeholder={tx('question')} rows={2} maxLength={500} value={q.prompt} status={problems['question.prompt'] ? 'error' : undefined} onChange={e => setQuestion({ prompt: e.target.value })} />
        {fieldError(problems['question.prompt'])}
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs text-[var(--at-muted)]">{tx('answers')}</legend>
        <Radio.Group value={q.correctIndex} onChange={e => setQuestion({ correctIndex: e.target.value as number })} className="flex w-full flex-col gap-2">
          {q.options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <Radio value={i} aria-label={tx('answerRight', { i: i + 1, n })} />
              <Input aria-label={tx('answerOf', { i: i + 1, n })} placeholder={tx('answer', { i: i + 1 })} maxLength={200} value={option} onChange={e => setQuestion({ options: q.options.map((o, j) => (j === i ? e.target.value : o)) })} />
              <Button size="small" icon={<Trash2 size={14} />} aria-label={tx('removeAnswer', { i: i + 1, n })} disabled={q.options.length <= 2} onClick={() => onChange({ question: removeOption(q, i) })} />
            </div>
          ))}
        </Radio.Group>
        {fieldError(Object.entries(problems).find(([key]) => key.startsWith('question.options'))?.[1] ?? problems['question.correctIndex'])}
        <Button size="small" icon={<Plus size={14} />} disabled={q.options.length >= 6} onClick={() => onChange({ question: addOption(q) })}>{tx('addAnswer')}</Button>
      </fieldset>
      <Input.TextArea aria-label={tx('explanationOf', { n })} placeholder={tx('explanation')} rows={2} maxLength={1000} value={q.explanation} onChange={e => setQuestion({ explanation: e.target.value })} />
    </div>}
  </section>;
}

/** Writing or editing one learning path of a workspace: its steps, what each points at, and whether people can see it yet. */
export default function PathEditor() {
  const { projectId = '', pathId } = useParams();
  const isNew = !pathId;
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const m = useMessages(MSG);
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
      if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : tx('loadFailed'));
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
      message.error(m('needsAttention'));
      return;
    }
    setProblems(NONE);
    setSaving(true);
    try {
      const body = payloadFromDraft(draft);
      if (isNew) {
        const created = await createPath(projectId, body);
        setSavedAs(JSON.stringify(body));
        message.success(m('created'));
        setCreatedId(created.id);
      } else {
        adopt(await savePath(projectId, pathId!, body));
        message.success(m('saved'));
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setConflict(cause.message);
      else if (cause instanceof ApiError && cause.fields) { setProblems(problemsByStep(cause.fields)); message.error(cause.message); }
      else message.error(cause instanceof Error ? cause.message : m('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function loadLatest() {
    const reload = () => { setConflict(null); setAttempt(a => a + 1); };
    if (!dirty) { reload(); return; }
    modal.confirm({ title: m('loadLatestTitle'), content: m('loadLatestBody'), okText: m('discardLoad'), okButtonProps: { danger: true }, onOk: reload });
  }

  const back = <Link to={`/learning?tab=manage&workspace=${encodeURIComponent(projectId)}`} className="inline-flex items-center gap-1 text-sm text-[var(--at-link)]"><ArrowLeft size={14} aria-hidden="true" />{m('managePaths')}</Link>;
  const title = isNew ? m('newTitle') : m('editTitle');
  const description = m('description');

  if (loadError) {
    return <FeaturePage title={title} description={description} demo={false} actions={back}>
      <Alert type="error" showIcon title={loadError} description={m('onlyMaintainers')} action={<Button onClick={() => { setLoadError(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />
    </FeaturePage>;
  }
  if (!draft) return <FeaturePage title={title} description={description} demo={false} actions={back}><Skeleton active paragraph={{ rows: 8 }} /></FeaturePage>;

  return <FeaturePage title={title} description={description} demo={false} actions={back}>
    {conflict && <Alert type="error" showIcon title={m('conflictTitle')} description={<div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><span>{m('conflictKept', { conflict })}</span><Button size="small" danger onClick={loadLatest}>{m('loadLatest')}</Button></div>} />}

    <section className={`${featurePanel} space-y-4`} aria-label={m('about')}>
      <div>
        <label htmlFor="path-title" className="mb-1 block text-xs text-[var(--at-muted)]">{m('title')}</label>
        <Input id="path-title" placeholder={m('titleExample')} maxLength={120} value={draft.title} status={problems.path.title ? 'error' : undefined} onChange={e => change({ title: e.target.value })} />
        {fieldError(problems.path.title)}
      </div>
      <div>
        <label htmlFor="path-description" className="mb-1 block text-xs text-[var(--at-muted)]">{m('descriptionLabel')}</label>
        <Input.TextArea id="path-description" placeholder={m('descriptionPlaceholder')} rows={3} maxLength={2000} value={draft.description} onChange={e => change({ description: e.target.value })} />
        {fieldError(problems.path.description)}
      </div>
      <div>
        <p className="mb-1 text-xs text-[var(--at-muted)]">{m('whoSees')}</p>
        <Segmented value={draft.status} onChange={v => change({ status: v as PathDraft['status'] })} options={[{ value: 'draft', label: m('draftOnly') }, { value: 'published', label: m('publishedGiven') }]} />
        {fieldError(problems.path.status)}
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">{m('steps')} <span className="text-sm font-normal text-[var(--at-muted)]">{m('stepsOf', { n: draft.steps.length, max: MAX_STEPS })}</span></h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label={m('addStep')}>
        {STEP_KINDS.map(k => <Button key={k.kind} icon={<Plus size={14} />} title={k.hint} disabled={draft.steps.length >= MAX_STEPS} onClick={() => addStep(k.kind)}>{k.label}</Button>)}
      </div>
    </div>
    {fieldError(problems.path.steps)}

    {!draft.steps.length && <div className={`${featurePanel} text-sm text-[var(--at-muted)]`}>{m('noSteps')}</div>}
    {draft.steps.map((step, i) => (
      <div key={step.key}>
        <StepEditor index={i} count={draft.steps.length} step={step} problems={problems.steps[i] ?? {}} assessment={serverPath?.steps.find(s => s.id === step.id)?.assessment}
          refs={refs} commits={commits} onChange={patch => changeStep(i, patch)} onMove={to => setDraft(d => d && { ...d, steps: moveStep(d.steps, i, to) })}
          onRemove={() => setDraft(d => d && { ...d, steps: d.steps.filter((_, j) => j !== i) })} />
      </div>
    ))}

    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border border-[var(--at-line)] bg-[var(--at-panel-2)] p-3">
      <p className="text-xs text-[var(--at-muted)]">{isNew ? m('notSaved') : `${m('revision', { n: serverPath?.revision ?? '' })}${dirty ? m('unsaved') : m('savedTag')}`}</p>
      <div className="flex gap-2">
        {!isNew && <Button disabled={!dirty || saving} onClick={() => serverPath && adopt(serverPath)}>{m('discard')}</Button>}
        <Button type="primary" loading={saving} disabled={!isNew && !dirty} onClick={() => void save()}>{isNew ? m('create') : m('save')}</Button>
      </div>
    </div>
  </FeaturePage>;
}
