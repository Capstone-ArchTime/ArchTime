import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Spin, Tag, Tooltip } from 'antd';
import { CheckCircle2, Lock, LockOpen, Plus, Save } from 'lucide-react';
import { WorkspacePage, StorageError, ConflictAlert } from './workspace';
import { panel, useWorkspace } from './workspace-store';
import type { Component, Dependency, Diagram } from './workspace-store';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { downloadText } from '@/features/download';
import { MAP_KIND, canonicalStatus, canonicalSummary } from '@/features/canonical-map';
import { normalizePathPrefix, pathPrefixOwner } from '@/features/workspace-sync';

function DiagramEditor({ project, onDirtyChange }: { project: string; onDirtyChange: (dirty: boolean) => void }) {
  const { data, save, saving, loading, loadError, loadErrorMessage, conflictError, reload, loadVersion } = useWorkspace(project);
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
  // Take the loaded diagram on first load and after "Load latest version"; a save sets the draft itself.
  const [draftVersion, setDraftVersion] = useState(loadVersion);
  if (draftVersion !== loadVersion) {
    setDraftVersion(loadVersion);
    setDraft(data.diagram);
  }

  if (loading) return <div className="py-20 flex justify-center"><Spin /></div>;
  const options = draft.components.map(c => ({ label: c.name, value: c.id }));
  // A confirmed diagram is locked: the server refuses to change it (409 DIAGRAM_LOCKED) until it is unlocked, or changes
  // it through an approved architecture change request. Edits are therefore only offered on a draft.
  const locked = !!data.diagram.confirmedAt;
  function update(next: Diagram) { setDraft({ ...next, confirmedAt: null, confirmedByName: null, confirmedRevision: null }); }
  async function unlock() {
    const saved = await save({ ...data, diagram: { ...data.diagram, confirmedAt: null } });
    if (saved) {
      setDraft(saved.diagram);
      message.success('Diagram unlocked: it is a draft again.');
    }
  }
  async function persist(confirm: boolean) {
    if (confirm && !draft.components.length) { message.error('Add at least one component before confirming.'); return; }
    const next = { ...draft, revision: data.diagram.revision, confirmedAt: confirm ? new Date().toISOString() : null };
    const saved = await save({ ...data, diagram: next });
    if (saved) {
      setDraft(saved.diagram);
      message.success(confirm ? 'Component diagram confirmed.' : 'Diagram draft saved.');
    }
  }
  function editComponent(value: Component | null) {
    if (locked) return;
    setComponent(value); componentForm.resetFields();
    componentForm.setFieldsValue(value ?? { name: '', kind: 'Service', description: '', pathPrefix: '' });
  }
  const width = 780;
  const height = Math.max(280, Math.ceil(draft.components.length / 3) * 180 + 50);
  const positions = new Map(draft.components.map((c, i) => [c.id, { x: 30 + (i % 3) * 250, y: 40 + Math.floor(i / 3) * 180 }]));
  return <div className="space-y-5">
    <StorageError visible={loadError} message={loadErrorMessage} onRetry={reload} />
    <ConflictAlert error={conflictError} dirty={dirty} onReload={reload} />
    <div className="flex flex-wrap gap-2"><Button onClick={() => downloadText('component-diagram.json', JSON.stringify({ project, diagram: data.diagram, source: 'archtime' }, null, 2))} disabled={loadError}>Export saved diagram</Button><Button disabled={!dirty} onClick={() => modal.confirm({ title: 'Discard unsaved diagram changes?', okText: 'Discard', okButtonProps: { danger: true }, onOk: () => setDraft(data.diagram) })}>Discard changes</Button></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2"><Tooltip title={MAP_KIND.canonical.description}><Tag color={draft.confirmedAt ? 'green' : 'gold'}>{draft.confirmedAt ? 'Canonical map' : 'Draft · needs confirmation'}</Tag></Tooltip><span className="text-xs text-[var(--at-muted)]">Revision {data.diagram.revision}{dirty ? ' • Unsaved changes' : ' • Saved'}</span></div>
      <div className="flex flex-wrap gap-2"><Button icon={<Save size={14} />} loading={saving} disabled={!dirty || loadError} onClick={() => persist(false)}>Save draft</Button><Button type="primary" icon={<CheckCircle2 size={14} />} disabled={loadError || saving || !draft.components.length || (!!draft.confirmedAt && !dirty)} onClick={() => modal.confirm({ title: 'Confirm this as the canonical map?', content: 'The current components and dependencies become the reference architecture newcomers learn from, with your name and this revision on it. It is then locked: later changes go through an architecture change request, or a maintainer unlocks it to edit it as a draft.', onOk: () => persist(true) })}>Confirm diagram</Button></div>
    </div>
    {draft.confirmedAt && <p className="text-xs text-[var(--at-muted)]">{canonicalSummary(canonicalStatus(draft), iso => new Date(iso).toLocaleString())}</p>}
    {locked && <Alert type="info" showIcon icon={<Lock size={16} />} title="This diagram is confirmed and locked" description="Changes go through an architecture change request in the Approval Queue, which moves the baseline when it is approved. To edit it here instead, unlock it." action={<Button size="small" icon={<LockOpen size={14} />} loading={saving} disabled={loadError} onClick={() => modal.confirm({ title: 'Unlock the confirmed diagram?', content: 'It becomes a draft: newcomers no longer see it as the canonical map, and its baseline commit is cleared until someone confirms it again.', okText: 'Unlock', onOk: unlock })}>Unlock to edit</Button>} />}
    <div className={panel}>
      <div className="flex flex-wrap justify-between gap-3 mb-4"><div><h3 className="text-lg font-semibold">Component map</h3><p className="text-xs text-[var(--at-muted)] mt-1">Dependency arrows point from caller to target. {locked ? 'Unlock the diagram to edit it.' : 'Select a component to edit.'}</p></div><Button icon={<Plus size={14} />} disabled={locked} onClick={() => editComponent(null)}>Add component</Button></div>
      {!draft.components.length ? <Empty description="No components yet. Add a component to start your diagram." /> : <div className="overflow-x-auto bg-[var(--at-page)] border border-[var(--at-line)]">
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
          {draft.components.map(c => { const p = positions.get(c.id)!; return <g key={c.id} transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0} aria-label={`Edit ${c.name}`} onClick={() => editComponent(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editComponent(c); } }} className="cursor-pointer outline-none focus:[&>rect]:stroke-white hover:[&>rect]:stroke-white"><title>{c.name}: {c.description}</title><rect width="190" height="80" rx="4" fill="#161d24" stroke="#3b82f6" /><text x="14" y="25" fill="#93c5fd" fontSize="10">{c.kind.toUpperCase()}</text><text x="14" y="50" fill="#f4f4f6" fontSize="13">{c.name.length > 23 ? `${c.name.slice(0, 22)}…` : c.name}</text></g>; })}
        </svg>
      </div>}
    </div>
    <div className="grid xl:grid-cols-2 gap-5">
      <section className={panel}><h3 className="font-semibold mb-4">Components <span className="text-[var(--at-muted)]">/ {draft.components.length}</span></h3><div className="divide-y divide-[var(--at-line)]">{draft.components.map(c => <div key={c.id} className="py-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm break-words">{c.name} <Tag>{c.kind}</Tag>{c.pathPrefix && <Tag className="font-mono">{c.pathPrefix}</Tag>}</p><p className="text-xs text-[var(--at-muted)] break-words mt-1">{c.description}</p></div><div className="flex shrink-0 gap-1"><Button size="small" disabled={locked} onClick={() => editComponent(c)}>Edit</Button><Popconfirm disabled={locked} title={`Remove ${c.name}?`} description="Connected dependencies will also be removed." onConfirm={() => update({ ...draft, components: draft.components.filter(x => x.id !== c.id), dependencies: draft.dependencies.filter(e => e.source !== c.id && e.target !== c.id) })}><Button size="small" danger disabled={locked}>Remove</Button></Popconfirm></div></div>)}</div></section>
      <section className={panel}><div className="flex justify-between gap-3 mb-4"><h3 className="font-semibold">Dependencies / {draft.dependencies.length}</h3><Button size="small" disabled={locked || draft.components.length < 2} onClick={() => { edgeForm.resetFields(); setEditingEdge(null); setEdgeOpen(true); }}>Add dependency</Button></div>{!draft.dependencies.length && <Empty description="No dependencies" image={Empty.PRESENTED_IMAGE_SIMPLE} />}<div className="divide-y divide-[var(--at-line)]">{draft.dependencies.map(e => <div className="py-3 flex items-center justify-between gap-3" key={e.id}><div className="text-sm"><p>{draft.components.find(c => c.id === e.source)?.name} → {draft.components.find(c => c.id === e.target)?.name}</p><p className="text-xs text-[var(--at-muted)] mt-1">{e.label}</p></div><div className="flex gap-1"><Button size="small" disabled={locked} onClick={() => { setEditingEdge(e); edgeForm.setFieldsValue(e); setEdgeOpen(true); }}>Edit</Button><Popconfirm disabled={locked} title="Remove this dependency?" onConfirm={() => update({ ...draft, dependencies: draft.dependencies.filter(x => x.id !== e.id) })}><Button size="small" danger disabled={locked}>Remove</Button></Popconfirm></div></div>)}</div></section>
    </div>
    <Modal title={component ? 'Edit component' : 'Add component'} open={component !== undefined} onCancel={() => setComponent(undefined)} onOk={() => componentForm.submit()} okText="Apply changes">
      <Form form={componentForm} layout="vertical" onFinish={values => {
        const name = values.name.trim();
        if (draft.components.some(c => c.id !== component?.id && c.name.toLowerCase() === name.toLowerCase())) { message.error('Component names must be unique.'); return; }
        const pathPrefix = normalizePathPrefix(values.pathPrefix);
        if (pathPrefix.split('/').includes('..')) { message.error('The path prefix must stay inside the repository.'); return; }
        const owner = pathPrefixOwner(draft.components, pathPrefix, component?.id);
        if (owner) { message.error(`${owner.name} already owns ${pathPrefix}. Each folder belongs to one component.`); return; }
        const next = { ...values, name, description: values.description?.trim() ?? '', pathPrefix, id: component?.id ?? crypto.randomUUID() };
        update({ ...draft, components: component ? draft.components.map(c => c.id === component.id ? next : c) : [...draft.components, next] }); setComponent(undefined);
      }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, max: 80 }]}><Input maxLength={80} /></Form.Item>
        <Form.Item name="kind" label="Type" rules={[{ required: true }]}><Select options={['UI', 'Service', 'Database', 'Queue', 'External'].map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="description" label="Responsibility"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
        <Form.Item name="pathPrefix" label="Path prefix" extra="The repository folder this component owns, for example src/auth/. Optional; two components cannot own the same folder."><Input maxLength={200} placeholder="src/auth/" className="font-mono" /></Form.Item>
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
    {dirty && <p role="status" className="text-xs text-[var(--at-warn)]">Save or confirm your changes before switching workspace or leaving this page.</p>}
  </div>;
}

export default function ComponentDiagram() {
  return <WorkspacePage title="Component Diagram" description="Review the component boundaries and dependencies, refine the model, and confirm the architecture.">{(project, onDirtyChange) => <DiagramEditor project={project} onDirtyChange={onDirtyChange} />}</WorkspacePage>;
}
