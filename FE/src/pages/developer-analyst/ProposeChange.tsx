import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Spin, Tag } from 'antd';
import { GitPullRequest, Plus } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PageHeader from '@/components/PageHeader';
import { featurePanel } from '@/components/FeaturePage';
import { ManagedWorkspaces } from '@/pages/project-maintainer/managed';
import { pickWorkspace } from '@/pages/project-maintainer/managed-access';
import { useAuth } from '@/auth/auth-context';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { fetchServerWorkspace } from '@/features/workspace-sync';
import type { Component, Dependency, Diagram } from '@/features/workspace-sync';
import type { ProjectSummary } from '@/features/project-data';
import { buildProposal, checkProposal, diagramChanges, listMyProposals, proposeChange, withoutComponent } from '@/features/proposal';
import type { MyProposal, ProposedDiagram } from '@/features/proposal';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  title: 'Propose a change', intro: 'Suggest a change to the confirmed component diagram; a maintainer approves or rejects it.', workspace: 'Workspace',
  details: 'You edit a copy of the confirmed diagram here. Nothing changes until a maintainer approves the proposal in the Approval Queue; approving it applies your diagram, confirms it and moves the baseline.',
  loading: 'Loading the diagram…', loadFailed: 'Could not load the diagram.', retry: 'Retry',
  maintainer: 'You maintain this workspace, so you can change its diagram directly.', openDiagram: 'Open Component Diagram',
  notConfirmed: 'This workspace has no confirmed diagram yet. A maintainer confirms one first; proposals change a confirmed diagram.',
  components: 'Components', dependencies: 'Dependencies', addComponent: 'Add component', addDependency: 'Add dependency', edit: 'Edit', remove: 'Remove',
  removeComponent: 'Remove {name} and its dependencies?', noComponents: 'No components.', noDependencies: 'No dependencies.',
  changes: 'Your changes', noChanges: 'No changes yet: edit the components or dependencies above.', reset: 'Start again from the confirmed diagram',
  propose: 'Send proposal', proposalTitle: 'Proposal title', why: 'Why this change? (optional)', send: 'Send', cancel: 'Cancel',
  sent: 'Proposal sent. A maintainer will review it in the Approval Queue.', sendFailed: 'Could not send the proposal.',
  mine: 'Your proposals', noneYet: 'You have not proposed a change to this workspace yet.', pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  name: 'Name', kind: 'Kind', description: 'Description', source: 'From', target: 'To', label: 'Label', required: 'Required', save: 'Save',
  componentTitle: 'Component', dependencyTitle: 'Dependency', sameComponent: 'A dependency joins two different components.',
}, {
  title: 'Đề xuất thay đổi', intro: 'Đề xuất thay đổi sơ đồ thành phần đã xác nhận; maintainer sẽ duyệt hoặc từ chối.', workspace: 'Workspace',
  details: 'Bạn sửa trên bản sao của sơ đồ đã xác nhận. Không có gì thay đổi cho đến khi maintainer duyệt đề xuất trong Approval Queue; khi được duyệt, sơ đồ của bạn được áp dụng, xác nhận và dời mốc baseline.',
  loading: 'Đang tải sơ đồ…', loadFailed: 'Không tải được sơ đồ.', retry: 'Thử lại',
  maintainer: 'Bạn là maintainer của workspace này nên có thể sửa sơ đồ trực tiếp.', openDiagram: 'Mở Component Diagram',
  notConfirmed: 'Workspace này chưa có sơ đồ đã xác nhận. Maintainer cần xác nhận sơ đồ trước; đề xuất là để thay đổi sơ đồ đã xác nhận.',
  components: 'Thành phần', dependencies: 'Phụ thuộc', addComponent: 'Thêm thành phần', addDependency: 'Thêm phụ thuộc', edit: 'Sửa', remove: 'Xoá',
  removeComponent: 'Xoá {name} và các phụ thuộc của nó?', noComponents: 'Chưa có thành phần.', noDependencies: 'Chưa có phụ thuộc.',
  changes: 'Thay đổi của bạn', noChanges: 'Chưa có thay đổi: hãy sửa thành phần hoặc phụ thuộc ở trên.', reset: 'Làm lại từ sơ đồ đã xác nhận',
  propose: 'Gửi đề xuất', proposalTitle: 'Tiêu đề đề xuất', why: 'Lý do thay đổi (không bắt buộc)', send: 'Gửi', cancel: 'Huỷ',
  sent: 'Đã gửi đề xuất. Maintainer sẽ xem xét trong Approval Queue.', sendFailed: 'Không gửi được đề xuất.',
  mine: 'Đề xuất của bạn', noneYet: 'Bạn chưa đề xuất thay đổi nào cho workspace này.', pending: 'Đang chờ', approved: 'Đã duyệt', rejected: 'Bị từ chối',
  name: 'Tên', kind: 'Loại', description: 'Mô tả', source: 'Từ', target: 'Đến', label: 'Nhãn', required: 'Bắt buộc', save: 'Lưu',
  componentTitle: 'Thành phần', dependencyTitle: 'Phụ thuộc', sameComponent: 'Phụ thuộc phải nối hai thành phần khác nhau.',
});

const KINDS = ['UI', 'Service', 'Database', 'Queue', 'External'];
const STATUS_COLOR = { pending: 'gold', approved: 'green', rejected: 'red' } as const;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export default function ProposeChange() {
  const m = useMessages(MSG);
  return <ManagedWorkspaces title={m('title')} scope="readable">{(projects, managed) => <ProposeView projects={projects} managed={managed} />}</ManagedWorkspaces>;
}

function ProposeView({ projects, managed }: { projects: ProjectSummary[]; managed: ReadonlySet<string> }) {
  const m = useMessages(MSG);
  const [params, setParams] = useSearchParams();
  const [project, setProject] = useState(() => pickWorkspace(projects, params.get('project') || params.get('projectId')));
  return <DashboardLayout><div className="max-w-[1400px] mx-auto space-y-6">
    <PageHeader title={m('title')} summary={m('intro')} details={m('details')} actions={<div className="w-full lg:w-64">
      <label htmlFor="propose-project" className="block text-xs text-[var(--at-muted)] mb-2">{m('workspace')}</label>
      <Select id="propose-project" className="w-full" value={project} onChange={next => { setProject(next); setParams({ project: next }); }} options={projects.map(p => ({ value: p.id, label: p.name }))} />
    </div>} />
    {managed.has(project)
      ? <Alert type="info" showIcon title={m('maintainer')} action={<Link to={`/project-maintainer/component-diagram?project=${project}`}><Button size="small">{m('openDiagram')}</Button></Link>} />
      : <ProposalEditor key={project} projectId={project} />}
  </div></DashboardLayout>;
}

function ProposalEditor({ projectId }: { projectId: string }) {
  const m = useMessages(MSG);
  const { message } = App.useApp();
  const userId = useAuth().user?.id ?? '';
  const [base, setBase] = useState<Diagram | null>(null);
  const [draft, setDraft] = useState<ProposedDiagram>({ components: [], dependencies: [] });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mine, setMine] = useState<MyProposal[]>([]);
  const [component, setComponent] = useState<Component | null | undefined>();
  const [dependency, setDependency] = useState<Dependency | null | undefined>();
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [componentForm] = Form.useForm<Component>();
  const [dependencyForm] = Form.useForm<Dependency>();
  const [sendForm] = Form.useForm<{ title: string; description: string }>();

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchServerWorkspace(projectId, controller.signal), listMyProposals(projectId, userId, controller.signal)])
      .then(([ws, proposals]) => {
        setBase(ws.diagram);
        setDraft({ components: ws.diagram.components, dependencies: ws.diagram.dependencies });
        setMine(proposals);
        setError(null);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : ''); });
    return () => controller.abort();
  }, [projectId, userId, attempt]);

  const changes = base ? diagramChanges(base, draft) : [];
  useUnsavedChanges(changes.length > 0);

  if (error !== null) return <Alert type="error" showIcon title={m('loadFailed')} description={error || undefined} action={<Button size="small" onClick={() => { setError(null); setBase(null); setAttempt(n => n + 1); }}>{m('retry')}</Button>} />;
  if (!base) return <div className="py-16 flex flex-col items-center gap-3" role="status"><Spin /><p className="text-sm text-[var(--at-muted)]">{m('loading')}</p></div>;
  if (!base.confirmedAt) return <Alert type="warning" showIcon title={m('notConfirmed')} />;

  const names = new Map(draft.components.map(c => [c.id, c.name]));
  const options = draft.components.map(c => ({ value: c.id, label: c.name }));
  function openComponent(value: Component | null) {
    setComponent(value); componentForm.resetFields();
    componentForm.setFieldsValue(value ?? { name: '', kind: 'Service', description: '' });
  }
  function openDependency(value: Dependency | null) {
    setDependency(value); dependencyForm.resetFields();
    dependencyForm.setFieldsValue(value ?? { source: draft.components[0]?.id, target: draft.components[1]?.id, label: '' });
  }
  function saveComponent(values: Component) {
    const next = { ...values, name: values.name.trim(), description: (values.description ?? '').trim() };
    setDraft(d => component
      ? { ...d, components: d.components.map(c => (c.id === component.id ? { ...c, ...next } : c)) }
      : { ...d, components: [...d.components, { ...next, id: newId('c'), pathPrefixes: [] }] });
    setComponent(undefined);
  }
  function saveDependency(values: Dependency) {
    const next = { ...values, label: (values.label ?? '').trim() };
    setDraft(d => dependency
      ? { ...d, dependencies: d.dependencies.map(e => (e.id === dependency.id ? { ...e, ...next } : e)) }
      : { ...d, dependencies: [...d.dependencies, { ...next, id: newId('d') }] });
    setDependency(undefined);
  }
  async function send(values: { title: string; description: string }) {
    const problem = checkProposal(values.title ?? '', base!, draft);
    if (problem) { message.error(problem); return; }
    setSending(true);
    try {
      await proposeChange(projectId, buildProposal({ title: values.title, description: values.description ?? '' }, base!, draft));
      message.success(m('sent'));
      setSendOpen(false);
      sendForm.resetFields();
      setAttempt(n => n + 1);
    } catch (cause) {
      message.error(cause instanceof Error && cause.message ? cause.message : m('sendFailed'));
    } finally {
      setSending(false);
    }
  }

  return <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={featurePanel} aria-labelledby="propose-components">
        <div className="flex items-center justify-between gap-3 mb-3"><h3 id="propose-components" className="text-lg font-semibold">{m('components')}</h3><Button size="small" icon={<Plus size={14} />} onClick={() => openComponent(null)}>{m('addComponent')}</Button></div>
        {!draft.components.length ? <Empty description={m('noComponents')} /> : <ul className="divide-y divide-[var(--at-line)]">
          {draft.components.map(c => <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0"><p className="font-medium truncate">{c.name} <span className="text-xs text-[var(--at-muted)]">· {c.kind}</span></p>{c.description && <p className="text-xs text-[var(--at-muted)] truncate">{c.description}</p>}</div>
            <div className="flex gap-2 shrink-0"><Button size="small" onClick={() => openComponent(c)}>{m('edit')}</Button><Popconfirm title={m('removeComponent', { name: c.name })} onConfirm={() => setDraft(d => withoutComponent(d, c.id))}><Button size="small" danger>{m('remove')}</Button></Popconfirm></div>
          </li>)}
        </ul>}
      </section>
      <section className={featurePanel} aria-labelledby="propose-dependencies">
        <div className="flex items-center justify-between gap-3 mb-3"><h3 id="propose-dependencies" className="text-lg font-semibold">{m('dependencies')}</h3><Button size="small" icon={<Plus size={14} />} disabled={draft.components.length < 2} onClick={() => openDependency(null)}>{m('addDependency')}</Button></div>
        {!draft.dependencies.length ? <Empty description={m('noDependencies')} /> : <ul className="divide-y divide-[var(--at-line)]">
          {draft.dependencies.map(e => <li key={e.id} className="flex items-center justify-between gap-3 py-2">
            <p className="min-w-0 truncate">{names.get(e.source) ?? e.source} → {names.get(e.target) ?? e.target}{e.label && <span className="text-xs text-[var(--at-muted)]"> · {e.label}</span>}</p>
            <div className="flex gap-2 shrink-0"><Button size="small" onClick={() => openDependency(e)}>{m('edit')}</Button><Button size="small" danger onClick={() => setDraft(d => ({ ...d, dependencies: d.dependencies.filter(x => x.id !== e.id) }))}>{m('remove')}</Button></div>
          </li>)}
        </ul>}
      </section>
    </div>

    <section className={featurePanel} aria-labelledby="propose-changes">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 id="propose-changes" className="text-lg font-semibold">{m('changes')}</h3>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!changes.length} onClick={() => setDraft({ components: base.components, dependencies: base.dependencies })}>{m('reset')}</Button>
          <Button type="primary" icon={<GitPullRequest size={14} />} disabled={!changes.length} onClick={() => setSendOpen(true)}>{m('propose')}</Button>
        </div>
      </div>
      {changes.length ? <ul className="list-disc pl-5 space-y-1 text-sm">{changes.map(line => <li key={line}>{line}</li>)}</ul> : <p className="text-sm text-[var(--at-muted)]">{m('noChanges')}</p>}
    </section>

    <section className={featurePanel} aria-labelledby="propose-mine">
      <h3 id="propose-mine" className="text-lg font-semibold mb-3">{m('mine')}</h3>
      {!mine.length ? <p className="text-sm text-[var(--at-muted)]">{m('noneYet')}</p> : <ul className="divide-y divide-[var(--at-line)]">
        {mine.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="min-w-0"><p className="font-medium truncate">{p.title}</p>{p.reviewNote && <p className="text-xs text-[var(--at-muted)]">{p.reviewNote}</p>}</div>
          <div className="flex items-center gap-2 shrink-0">{p.createdAt && <span className="text-xs text-[var(--at-muted)]">{formatDateTime(p.createdAt)}</span>}<Tag color={STATUS_COLOR[p.status]}>{m(p.status)}</Tag></div>
        </li>)}
      </ul>}
    </section>

    <Modal open={component !== undefined} title={m('componentTitle')} okText={m('save')} cancelText={m('cancel')} onCancel={() => setComponent(undefined)} onOk={() => componentForm.submit()} destroyOnHidden>
      <Form form={componentForm} layout="vertical" onFinish={saveComponent}>
        <Form.Item name="name" label={m('name')} rules={[{ required: true, whitespace: true, message: m('required') }]}><Input maxLength={80} /></Form.Item>
        <Form.Item name="kind" label={m('kind')}><Select options={KINDS.map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="description" label={m('description')}><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
      </Form>
    </Modal>
    <Modal open={dependency !== undefined} title={m('dependencyTitle')} okText={m('save')} cancelText={m('cancel')} onCancel={() => setDependency(undefined)} onOk={() => dependencyForm.submit()} destroyOnHidden>
      <Form form={dependencyForm} layout="vertical" onFinish={saveDependency}>
        <Form.Item name="source" label={m('source')} rules={[{ required: true, message: m('required') }]}><Select options={options} /></Form.Item>
        <Form.Item name="target" label={m('target')} dependencies={['source']} rules={[{ required: true, message: m('required') }, ({ getFieldValue }) => ({ validator: (_, value) => (value && value === getFieldValue('source') ? Promise.reject(new Error(m('sameComponent'))) : Promise.resolve()) })]}><Select options={options} /></Form.Item>
        <Form.Item name="label" label={m('label')}><Input maxLength={80} /></Form.Item>
      </Form>
    </Modal>
    <Modal open={sendOpen} title={m('propose')} okText={m('send')} cancelText={m('cancel')} confirmLoading={sending} onCancel={() => setSendOpen(false)} onOk={() => sendForm.submit()} destroyOnHidden>
      <Form form={sendForm} layout="vertical" onFinish={send}>
        <Form.Item name="title" label={m('proposalTitle')} rules={[{ required: true, whitespace: true, message: m('required') }]}><Input maxLength={120} /></Form.Item>
        <Form.Item name="description" label={m('why')}><Input.TextArea rows={4} maxLength={2000} /></Form.Item>
      </Form>
      <ul className="list-disc pl-5 text-xs text-[var(--at-muted)]">{changes.map(line => <li key={line}>{line}</li>)}</ul>
    </Modal>
  </div>;
}
