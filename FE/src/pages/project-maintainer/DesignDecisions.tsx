import { useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Tag } from 'antd';
import { Plus, BookOpen } from 'lucide-react';
import { WorkspacePage, StorageError } from './workspace';
import { panel, useWorkspace } from './workspace-store';
import type { Decision } from './workspace-store';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';

const statuses = ['Proposed', 'Accepted', 'Deprecated'] as const;
const colors = { Proposed: 'gold', Accepted: 'green', Deprecated: 'default' };
const adr = (number: number) => `ADR-${String(number).padStart(3, '0')}`;

function DecisionEditor({ project }: { project: string }) {
  const { data, save, loadError } = useWorkspace(project);
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Decision | null | undefined>();
  const [viewing, setViewing] = useState<Decision | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [form] = Form.useForm<Decision>();
  function open(value: Decision | null) {
    form.resetFields(); form.setFieldsValue(value ?? { status: 'Proposed', componentIds: [] }); setEditing(value);
  }
  const filtered = data.decisions.filter(d => (status === 'All' || d.status === status) && `${adr(d.number)} ${d.title} ${d.context} ${d.decision}`.toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, JSON.stringify([search, status]));
  const componentOptions = data.diagram.components.map(c => ({ value: c.id, label: c.name }));
  for (const id of editing?.componentIds ?? []) {
    if (!componentOptions.some(c => c.value === id)) componentOptions.push({ value: id, label: 'Removed component (historical link)' });
  }
  return <div className="space-y-5">
    <StorageError visible={loadError} />
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><BookOpen size={20} className="text-[#38bdf8]" /><span className="text-sm">{data.decisions.length} recorded decisions</span></div><Button type="primary" icon={<Plus size={14} />} disabled={loadError} onClick={() => open(null)}>Record decision</Button></div>
    <div className="flex flex-col sm:flex-row gap-3"><Input.Search aria-label="Search design decisions" placeholder="Search decisions, context, or ADR number" value={search} onChange={e => setSearch(e.target.value)} allowClear className="max-w-lg" /><Select aria-label="Filter by decision status" value={status} onChange={setStatus} className="w-full sm:w-44" options={['All', ...statuses].map(value => ({ value, label: value === 'All' ? 'All statuses' : value }))} /></div>
    {!filtered.length && <div className={panel}><Empty description={search || status !== 'All' ? 'No matching decisions.' : 'Record your first decision to preserve the reasoning behind your architecture.'} /></div>}
    <div className="space-y-3">{pagination.items.map(d => <article className={panel} key={d.id}>
      <div className="flex flex-wrap justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-3 mb-2"><span className="text-xs text-[#38bdf8] font-mono">{adr(d.number)}</span><Tag color={colors[d.status]}>{d.status}</Tag></div><button onClick={() => setViewing(d)} className="text-lg font-semibold text-left hover:text-[#38bdf8] focus-visible:outline focus-visible:outline-[#38bdf8] break-words">{d.title}</button><p className="text-sm text-[#94a3b8] mt-2 line-clamp-2 whitespace-pre-wrap break-words">{d.decision}</p><p className="text-xs text-[#94a3b8] mt-4">Updated {new Date(d.updatedAt).toLocaleString()} · {d.componentIds.length} linked components</p></div><div className="flex items-start gap-2"><Button size="small" onClick={() => setViewing(d)}>Read</Button><Button size="small" disabled={loadError} onClick={() => open(d)}>Edit</Button></div></div>
    </article>)}</div>
    <PaginationBar {...pagination} />
    <Modal title={editing ? `Edit ${adr(editing.number)}` : 'Record design decision'} width={720} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText="Save decision">
      <Form form={form} layout="vertical" onFinish={values => {
        const now = new Date().toISOString();
        const decision: Decision = { ...values, title: values.title.trim(), context: values.context.trim(), decision: values.decision.trim(), alternatives: values.alternatives?.trim() ?? '', consequences: values.consequences.trim(), componentIds: values.componentIds ?? [], id: editing?.id ?? crypto.randomUUID(), number: editing?.number ?? Math.max(0, ...data.decisions.map(d => d.number)) + 1, createdAt: editing?.createdAt ?? now, updatedAt: now };
        if (save({ ...data, decisions: editing ? data.decisions.map(d => d.id === editing.id ? decision : d) : [decision, ...data.decisions] })) { message.success('Design decision recorded.'); setEditing(undefined); }
      }}>
        <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true }]}><Input maxLength={160} placeholder="Use asynchronous events for notifications" /></Form.Item>
        <div className="grid sm:grid-cols-2 gap-x-4"><Form.Item name="status" label="Status" rules={[{ required: true }]}><Select options={statuses.map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="componentIds" label="Related components"><Select mode="multiple" options={componentOptions} placeholder="Optional" /></Form.Item></div>
        <Form.Item name="context" label="Context" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={10000} placeholder="What problem or constraints led to this decision?" /></Form.Item>
        <Form.Item name="decision" label="Decision" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={10000} placeholder="What did we choose, and why?" /></Form.Item>
        <Form.Item name="alternatives" label="Alternatives considered"><Input.TextArea rows={2} maxLength={10000} placeholder="Other approaches and why they were not selected" /></Form.Item>
        <Form.Item name="consequences" label="Consequences & trade-offs" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={10000} placeholder="Benefits, costs, risks, and follow-up work" /></Form.Item>
      </Form>
    </Modal>
    <Modal title={viewing ? `${adr(viewing.number)} · ${viewing.title}` : ''} width={760} open={!!viewing} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
      {viewing && <div className="space-y-5"><Tag color={colors[viewing.status]}>{viewing.status}</Tag>{([['Context', viewing.context], ['Decision', viewing.decision], ['Alternatives considered', viewing.alternatives || 'No alternatives recorded.'], ['Consequences & trade-offs', viewing.consequences]]).map(([label, text]) => <section key={label}><h3 className="text-xs uppercase tracking-wider text-[#38bdf8] mb-2">{label}</h3><p className="whitespace-pre-wrap break-words text-sm text-[#cbd5e1]">{text}</p></section>)}<section><h3 className="text-xs text-[#38bdf8] mb-2">RELATED COMPONENTS</h3>{viewing.componentIds.length ? viewing.componentIds.map(id => <Tag key={id}>{data.diagram.components.find(c => c.id === id)?.name ?? 'Removed component'}</Tag>) : <p className="text-sm text-[#94a3b8]">No components linked.</p>}</section><p className="text-xs text-[#94a3b8]">Created {new Date(viewing.createdAt).toLocaleString()} · Updated {new Date(viewing.updatedAt).toLocaleString()}</p></div>}
    </Modal>
  </div>;
}

export default function DesignDecisions() {
  return <WorkspacePage title="Design Decisions" description="Preserve architectural context, the chosen approach, and its trade-offs in a design decision record.">{project => <DecisionEditor project={project} />}</WorkspacePage>;
}
