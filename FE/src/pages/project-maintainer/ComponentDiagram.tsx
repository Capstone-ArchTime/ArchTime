import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Tag } from 'antd';
import { CheckCircle2, Plus, Save } from 'lucide-react';
import { WorkspacePage, StorageError } from './workspace';
import { panel, useWorkspace } from './workspace-store';
import type { Component, Dependency, Diagram } from './workspace-store';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { downloadText } from '@/features/download';

function DiagramEditor({ project, onDirtyChange }: { project: string; onDirtyChange: (dirty: boolean) => void }) {
  const { data, save, loadError, conflictError, reload } = useWorkspace(project);
  const { message, modal } = App.useApp();
  const [draft, setDraft] = useState<Diagram>(data.diagram);
  const [component, setComponent] = useState<Component | null | undefined>();
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [editingEdge, setEditingEdge] = useState<Dependency | null>(null);
  const [componentForm] = Form.useForm<Component>();
  const [edgeForm] = Form.useForm<Dependency>();
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.diagram);
  useUnsavedChanges(dirty);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) {
      setDraft(data.diagram);
    }
  }, [data.diagram]);

  const options = draft.components.map(c => ({ label: c.name, value: c.id }));
  function update(next: Diagram) { setDraft({ ...next, confirmedAt: null }); }
  async function persist(confirm: boolean) {
    if (confirm && !draft.components.length) { message.error('Add at least one component before confirming.'); return; }
    const next = { ...draft, revision: data.diagram.revision + (dirty ? 1 : 0), confirmedAt: confirm ? new Date().toISOString() : null };
    const ok = await save({ ...data, diagram: next });
    if (ok) {
      setDraft(next);
      message.success(confirm ? 'Component diagram confirmed.' : 'Diagram draft saved.');
    }
  }
  function editComponent(value: Component | null) {
    setComponent(value); componentForm.resetFields();
    componentForm.setFieldsValue(value ?? { name: '', kind: 'Service', description: '' });
  }
  const width = 780;
  const height = Math.max(280, Math.ceil(draft.components.length / 3) * 180 + 50);
  const positions = new Map(draft.components.map((c, i) => [c.id, { x: 30 + (i % 3) * 250, y: 40 + Math.floor(i / 3) * 180 }]));
  return <div className="space-y-5">
    <StorageError visible={loadError} />
    {conflictError && (
      <Alert
        type="error"
        showIcon
        message="Workspace Revision Conflict"
        description={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <span>{conflictError}</span>
            <Button size="small" danger onClick={() => reload()}>
              Reload latest
            </Button>
          </div>
        }
      />
    )}
    <div className="flex flex-wrap gap-2"><Button onClick={() => downloadText('component-diagram.json', JSON.stringify({ project, diagram: data.diagram, source: 'local-demo' }, null, 2))} disabled={loadError}>Export saved diagram</Button><Button disabled={!dirty} onClick={() => modal.confirm({ title: 'Discard unsaved diagram changes?', okText: 'Discard', okButtonProps: { danger: true }, onOk: () => setDraft(data.diagram) })}>Discard changes</Button></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2"><Tag color={draft.confirmedAt ? 'green' : 'gold'}>{draft.confirmedAt ? 'Confirmed' : 'Needs confirmation'}</Tag><span className="text-xs text-[#94a3b8]">Revision {data.diagram.revision}{dirty ? ' • Unsaved changes' : ' • Saved'}</span></div>
      <div className="flex flex-wrap gap-2"><Button icon={<Save size={14} />} disabled={!dirty || loadError} onClick={() => persist(false)}>Save draft</Button><Button type="primary" icon={<CheckCircle2 size={14} />} disabled={loadError || !draft.components.length || (!!draft.confirmedAt && !dirty)} onClick={() => modal.confirm({ title: 'Confirm this component diagram?', content: 'The current components and dependencies will become the reviewed diagram. Further edits will require confirmation again.', onOk: () => persist(true) })}>Confirm diagram</Button></div>
    </div>
    {draft.confirmedAt && <p className="text-xs text-[#94a3b8]">Confirmed on {new Date(draft.confirmedAt).toLocaleString()}</p>}
    <div className={panel}>
      <div className="flex flex-wrap justify-between gap-3 mb-4"><div><h3 className="text-lg font-semibold">Component map</h3><p className="text-xs text-[#94a3b8] mt-1">Dependency arrows point from caller to target. Select a component to edit.</p></div><Button icon={<Plus size={14} />} onClick={() => editComponent(null)}>Add component</Button></div>
      {!draft.components.length ? <Empty description="No components yet. Add a component to start your diagram." /> : <div className="overflow-x-auto bg-[#080b0e] border border-[#242527]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[680px]" aria-label={`Component diagram for ${project}`}>
          <defs><marker id="dependency-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#3b82f6" /></marker></defs>
          {draft.dependencies.map((e, i) => {
            const a = positions.get(e.source), b = positions.get(e.target);
            if (!a || !b) return null;
            const sameRow = a.y === b.y, forward = a.x < b.x;
            const sx = sameRow ? a.x + (forward ? 190 : 0) : a.x + 95;
            const sy = sameRow ? a.y + 40 : a.y + (a.y < b.y ? 80 : 0);
            const tx = sameRow ? b.x + (forward ? 0 : 190) : b.x + 95;
            const ty = sameRow ? b.y + 40 : b.y + (a.y < b.y ? 0 : 80);
            const bend = 25 + (i % 3) * 12;
            return <g key={e.id}><path d={`M${sx},${sy} Q${(sx + tx) / 2},${(sy + ty) / 2 + bend} ${tx},${ty}`} fill="none" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#dependency-arrow)" /><text x={(sx + tx) / 2} y={(sy + ty) / 2 + bend / 2 + 16} textAnchor="middle" fill="#94a3b8" fontSize="10">{e.label.slice(0, 24)}</text></g>;
          })}
          {draft.components.map(c => { const p = positions.get(c.id)!; return <g key={c.id} transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0} aria-label={`Edit ${c.name}`} onClick={() => editComponent(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editComponent(c); } }} className="cursor-pointer outline-none focus:[&>rect]:stroke-white hover:[&>rect]:stroke-white"><title>{c.name}: {c.description}</title><rect width="190" height="80" rx="4" fill="#161d24" stroke="#3b82f6" /><text x="14" y="25" fill="#3b82f6" fontSize="10">{c.kind.toUpperCase()}</text><text x="14" y="50" fill="#f4f4f6" fontSize="13">{c.name.length > 23 ? `${c.name.slice(0, 22)}…` : c.name}</text></g>; })}
        </svg>
      </div>}
    </div>
    <div className="grid xl:grid-cols-2 gap-5">
      <section className={panel}><h3 className="font-semibold mb-4">Components <span className="text-[#94a3b8]">/ {draft.components.length}</span></h3><div className="divide-y divide-[#242527]">{draft.components.map(c => <div key={c.id} className="py-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm break-words">{c.name} <Tag>{c.kind}</Tag></p><p className="text-xs text-[#94a3b8] break-words mt-1">{c.description}</p></div><div className="flex shrink-0 gap-1"><Button size="small" onClick={() => editComponent(c)}>Edit</Button><Popconfirm title={`Remove ${c.name}?`} description="Connected dependencies will also be removed." onConfirm={() => update({ ...draft, components: draft.components.filter(x => x.id !== c.id), dependencies: draft.dependencies.filter(e => e.source !== c.id && e.target !== c.id) })}><Button size="small" danger>Remove</Button></Popconfirm></div></div>)}</div></section>
      <section className={panel}><div className="flex justify-between gap-3 mb-4"><h3 className="font-semibold">Dependencies / {draft.dependencies.length}</h3><Button size="small" disabled={draft.components.length < 2} onClick={() => { edgeForm.resetFields(); setEditingEdge(null); setEdgeOpen(true); }}>Add dependency</Button></div>{!draft.dependencies.length && <Empty description="No dependencies" image={Empty.PRESENTED_IMAGE_SIMPLE} />}<div className="divide-y divide-[#242527]">{draft.dependencies.map(e => <div className="py-3 flex items-center justify-between gap-3" key={e.id}><div className="text-sm"><p>{draft.components.find(c => c.id === e.source)?.name} → {draft.components.find(c => c.id === e.target)?.name}</p><p className="text-xs text-[#94a3b8] mt-1">{e.label}</p></div><div className="flex gap-1"><Button size="small" onClick={() => { setEditingEdge(e); edgeForm.setFieldsValue(e); setEdgeOpen(true); }}>Edit</Button><Popconfirm title="Remove this dependency?" onConfirm={() => update({ ...draft, dependencies: draft.dependencies.filter(x => x.id !== e.id) })}><Button size="small" danger>Remove</Button></Popconfirm></div></div>)}</div></section>
    </div>
    <Modal title={component ? 'Edit component' : 'Add component'} open={component !== undefined} onCancel={() => setComponent(undefined)} onOk={() => componentForm.submit()} okText="Apply changes">
      <Form form={componentForm} layout="vertical" onFinish={values => {
        const name = values.name.trim();
        if (draft.components.some(c => c.id !== component?.id && c.name.toLowerCase() === name.toLowerCase())) { message.error('Component names must be unique.'); return; }
        const next = { ...values, name, description: values.description?.trim() ?? '', id: component?.id ?? crypto.randomUUID() };
        update({ ...draft, components: component ? draft.components.map(c => c.id === component.id ? next : c) : [...draft.components, next] }); setComponent(undefined);
      }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, max: 80 }]}><Input maxLength={80} /></Form.Item>
        <Form.Item name="kind" label="Type" rules={[{ required: true }]}><Select options={['UI', 'Service', 'Database', 'Queue', 'External'].map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="description" label="Responsibility"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={editingEdge ? "Edit dependency" : "Add dependency"} open={edgeOpen} onCancel={() => setEdgeOpen(false)} onOk={() => edgeForm.submit()}>
      <Form form={edgeForm} layout="vertical" onFinish={values => {
        if (values.source === values.target) { message.error('Choose two different components.'); return; }
        if (draft.dependencies.some(e => e.id !== editingEdge?.id && e.source === values.source && e.target === values.target)) { message.error('This dependency already exists.'); return; }
        const next = { ...values, label: values.label.trim(), id: editingEdge?.id ?? crypto.randomUUID() };
        update({ ...draft, dependencies: editingEdge ? draft.dependencies.map(e => e.id === editingEdge.id ? next : e) : [...draft.dependencies, next] }); setEdgeOpen(false);
      }}>
        <Form.Item name="source" label="Source (caller)" rules={[{ required: true }]}><Select options={options} /></Form.Item><Form.Item name="target" label="Target" rules={[{ required: true }]}><Select options={options} /></Form.Item><Form.Item name="label" label="Protocol / relationship" rules={[{ required: true, whitespace: true }]}><Input maxLength={40} placeholder="e.g. HTTPS, publishes events" /></Form.Item>
      </Form>
    </Modal>
    {dirty && <p role="status" className="text-xs text-[#ffb03a]">Save or confirm your changes before switching project or leaving this page.</p>}
  </div>;
}

export default function ComponentDiagram() {
  return <WorkspacePage title="Component Diagram" description="Review the component boundaries and dependencies, refine the model, and confirm the architecture.">{(project, onDirtyChange) => <DiagramEditor project={project} onDirtyChange={onDirtyChange} />}</WorkspacePage>;
}
