import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Spin, Tag, Tooltip } from 'antd';
import { CheckCircle2, Lock, LockOpen, Plus, Save } from 'lucide-react';
import { WorkspacePage, StorageError, ConflictAlert } from './workspace';
import { panel, useWorkspace } from './workspace-store';
import type { Component, Dependency, Diagram } from './workspace-store';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { downloadText } from '@/features/download';
import { MAP_KIND, canonicalStatus, canonicalSummary } from '@/features/canonical-map';
import { checkPathPrefixes, prefixOverlap, sameConfirmedContent } from '@/features/path-prefixes';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  needOne: 'Add at least one component before confirming.', confirmed: 'Component diagram confirmed.', draftSaved: 'Diagram draft saved.', unlocked: 'Diagram unlocked: it is a draft again.',
  export: 'Export saved diagram', discardTitle: 'Discard unsaved diagram changes?', discard: 'Discard', discardChanges: 'Discard changes', canonical: 'Canonical map', needsConfirm: 'Draft · needs confirmation',
  revision: 'Revision {n}', unsaved: ' • Unsaved changes', saved: ' • Saved', saveDraft: 'Save draft', confirmTitle: 'Confirm this as the canonical map?',
  confirmBody: 'The current components and dependencies become the reference architecture newcomers learn from, with your name and this revision on it. It is then locked: later changes go through an architecture change request, or a maintainer unlocks it to edit it as a draft.',
  confirmDiagram: 'Confirm diagram', lockedTitle: 'This diagram is confirmed and locked',
  lockedBody: 'Components and dependencies change through an architecture change request in the Approval Queue, which moves the baseline when it is approved. Path prefixes can still be mapped. To edit the diagram here instead, unlock it.',
  unlockTitle: 'Unlock the confirmed diagram?', unlockBody: 'It becomes a draft: newcomers no longer see it as the canonical map, and its baseline commit is cleared until someone confirms it again.', unlock: 'Unlock', unlockEdit: 'Unlock to edit',
  map: 'Component map', arrows: 'Dependency arrows point from caller to target.', selectLocked: 'Select a component to map its paths; unlock the diagram to change it.', selectEdit: 'Select a component to edit.',
  addComponent: 'Add component', noComponents: 'No components yet. Add a component to start your diagram.', diagramFor: 'Component diagram for {project}', editName: 'Edit {name}', components: 'Components',
  pathsOf: 'Paths of {name}', noPaths: 'No paths mapped yet', edit: 'Edit', removeTitle: 'Remove {name}?', removeBody: 'Connected dependencies will also be removed.', remove: 'Remove',
  dependencies: 'Dependencies', addDependency: 'Add dependency', noDependencies: 'No dependencies', removeDependency: 'Remove this dependency?', mapPaths: 'Map paths', editComponent: 'Edit component',
  apply: 'Apply changes', unique: 'Component names must be unique.', name: 'Name', type: 'Type', responsibility: 'Responsibility', prefixes: 'Path prefixes',
  prefixesExtra: 'Folders or files in the repository that belong to this component, e.g. BE/src/billing. Press Enter after each. A path can belong to one component only; the longest matching path wins. Changing paths keeps the diagram confirmed.',
  editDependency: 'Edit dependency', different: 'Choose two different components.', exists: 'This dependency already exists.', source: 'Source (caller)', target: 'Target', protocol: 'Protocol / relationship',
  protocolPlaceholder: 'e.g. HTTPS, publishes events', saveFirst: 'Save or confirm your changes before switching workspace or leaving this page.', title: 'Component Diagram', intro: "Review, edit and confirm this workspace's components.",
}, {
  needOne: 'Hãy thêm ít nhất một thành phần trước khi xác nhận.', confirmed: 'Đã xác nhận sơ đồ thành phần.', draftSaved: 'Đã lưu bản nháp sơ đồ.', unlocked: 'Đã mở khoá sơ đồ: giờ là bản nháp.',
  export: 'Xuất sơ đồ đã lưu', discardTitle: 'Bỏ các thay đổi chưa lưu của sơ đồ?', discard: 'Bỏ', discardChanges: 'Bỏ thay đổi', canonical: 'Bản đồ chính thức', needsConfirm: 'Nháp · cần xác nhận',
  revision: 'Phiên bản {n}', unsaved: ' • Có thay đổi chưa lưu', saved: ' • Đã lưu', saveDraft: 'Lưu nháp', confirmTitle: 'Xác nhận đây là bản đồ chính thức?',
  confirmBody: 'Các thành phần và phụ thuộc hiện tại sẽ thành kiến trúc tham chiếu cho người mới học, kèm tên bạn và phiên bản này. Sau đó sơ đồ bị khoá: thay đổi về sau đi qua yêu cầu thay đổi kiến trúc, hoặc người bảo trì mở khoá để sửa như bản nháp.',
  confirmDiagram: 'Xác nhận sơ đồ', lockedTitle: 'Sơ đồ này đã được xác nhận và khoá',
  lockedBody: 'Thành phần và phụ thuộc thay đổi qua yêu cầu thay đổi kiến trúc trong Hàng đợi phê duyệt, yêu cầu được duyệt sẽ dời mốc chuẩn. Vẫn ánh xạ được tiền tố đường dẫn. Để sửa trực tiếp ở đây, hãy mở khoá.',
  unlockTitle: 'Mở khoá sơ đồ đã xác nhận?', unlockBody: 'Sơ đồ sẽ thành bản nháp: người mới không còn thấy nó là bản đồ chính thức, và commit mốc chuẩn bị xoá cho tới khi có người xác nhận lại.', unlock: 'Mở khoá', unlockEdit: 'Mở khoá để sửa',
  map: 'Bản đồ thành phần', arrows: 'Mũi tên phụ thuộc hướng từ bên gọi tới bên được gọi.', selectLocked: 'Chọn một thành phần để ánh xạ đường dẫn; mở khoá sơ đồ để thay đổi nó.', selectEdit: 'Chọn một thành phần để sửa.',
  addComponent: 'Thêm thành phần', noComponents: 'Chưa có thành phần nào. Hãy thêm một thành phần để bắt đầu sơ đồ.', diagramFor: 'Sơ đồ thành phần của {project}', editName: 'Sửa {name}', components: 'Thành phần',
  pathsOf: 'Đường dẫn của {name}', noPaths: 'Chưa ánh xạ đường dẫn nào', edit: 'Sửa', removeTitle: 'Xoá {name}?', removeBody: 'Các phụ thuộc nối với nó cũng sẽ bị xoá.', remove: 'Xoá',
  dependencies: 'Phụ thuộc', addDependency: 'Thêm phụ thuộc', noDependencies: 'Không có phụ thuộc', removeDependency: 'Xoá phụ thuộc này?', mapPaths: 'Ánh xạ đường dẫn', editComponent: 'Sửa thành phần',
  apply: 'Áp dụng', unique: 'Tên thành phần phải là duy nhất.', name: 'Tên', type: 'Loại', responsibility: 'Trách nhiệm', prefixes: 'Tiền tố đường dẫn',
  prefixesExtra: 'Thư mục hoặc tệp trong repository thuộc về thành phần này, vd. BE/src/billing. Nhấn Enter sau mỗi mục. Một đường dẫn chỉ thuộc một thành phần; đường dẫn khớp dài nhất được ưu tiên. Đổi đường dẫn vẫn giữ sơ đồ ở trạng thái đã xác nhận.',
  editDependency: 'Sửa phụ thuộc', different: 'Hãy chọn hai thành phần khác nhau.', exists: 'Phụ thuộc này đã có.', source: 'Nguồn (bên gọi)', target: 'Đích', protocol: 'Giao thức / quan hệ',
  protocolPlaceholder: 'vd. HTTPS, phát sự kiện', saveFirst: 'Hãy lưu hoặc xác nhận thay đổi trước khi đổi không gian làm việc hoặc rời trang.', title: 'Sơ đồ thành phần', intro: 'Xem, sửa và xác nhận các thành phần của không gian làm việc này.',
});

function DiagramEditor({ project, onDirtyChange }: { project: string; onDirtyChange: (dirty: boolean) => void }) {
  const { data, save, saving, loading, loadError, loadErrorMessage, conflictError, reload, loadVersion } = useWorkspace(project);
  const { message, modal } = App.useApp();
  const m = useMessages(MSG);
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
  // A confirmed diagram is locked: the server refuses to change its components or dependencies (409 DIAGRAM_LOCKED) until
  // it is unlocked, or changes it through an approved architecture change request. Mapping files with path prefixes is
  // not a change of that content, so it stays possible and keeps the confirmation.
  const locked = !!data.diagram.confirmedAt;
  function update(next: Diagram) {
    const keep = data.diagram.confirmedAt && sameConfirmedContent(next, data.diagram);
    setDraft(keep
      ? { ...next, confirmedAt: data.diagram.confirmedAt, confirmedByName: data.diagram.confirmedByName, confirmedRevision: data.diagram.confirmedRevision }
      : { ...next, confirmedAt: null, confirmedByName: null, confirmedRevision: null });
  }
  async function persist(confirm: boolean) {
    if (confirm && !draft.components.length) { message.error(m('needOne')); return; }
    // Sending the stored confirmation time back means "keep it"; null means "not confirmed".
    const next = { ...draft, revision: data.diagram.revision, confirmedAt: confirm ? new Date().toISOString() : draft.confirmedAt };
    const saved = await save({ ...data, diagram: next });
    if (saved) {
      setDraft(saved.diagram);
      message.success(confirm ? m('confirmed') : m('draftSaved'));
    }
  }
  async function unlock() {
    const saved = await save({ ...data, diagram: { ...data.diagram, confirmedAt: null } });
    if (saved) {
      setDraft(saved.diagram);
      message.success(m('unlocked'));
    }
  }
  function editComponent(value: Component | null) {
    setComponent(value); componentForm.resetFields();
    componentForm.setFieldsValue(value ?? { name: '', kind: 'Service', description: '', pathPrefixes: [] });
  }
  const width = 780;
  const height = Math.max(280, Math.ceil(draft.components.length / 3) * 180 + 50);
  const positions = new Map(draft.components.map((c, i) => [c.id, { x: 30 + (i % 3) * 250, y: 40 + Math.floor(i / 3) * 180 }]));
  return <div className="space-y-5">
    <StorageError visible={loadError} message={loadErrorMessage} onRetry={reload} />
    <ConflictAlert error={conflictError} dirty={dirty} onReload={reload} />
    <div className="flex flex-wrap gap-2"><Button onClick={() => downloadText('component-diagram.json', JSON.stringify({ project, diagram: data.diagram, source: 'archtime' }, null, 2))} disabled={loadError}>{m('export')}</Button><Button disabled={!dirty} onClick={() => modal.confirm({ title: m('discardTitle'), okText: m('discard'), okButtonProps: { danger: true }, onOk: () => setDraft(data.diagram) })}>{m('discardChanges')}</Button></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2"><Tooltip title={MAP_KIND.canonical.description}><Tag color={draft.confirmedAt ? 'green' : 'gold'}>{draft.confirmedAt ? m('canonical') : m('needsConfirm')}</Tag></Tooltip><span className="text-xs text-[var(--at-muted)]">{m('revision', { n: data.diagram.revision })}{dirty ? m('unsaved') : m('saved')}</span></div>
      <div className="flex flex-wrap gap-2"><Button icon={<Save size={14} />} loading={saving} disabled={!dirty || loadError} onClick={() => persist(false)}>{m('saveDraft')}</Button><Button type="primary" icon={<CheckCircle2 size={14} />} disabled={loadError || saving || !draft.components.length || (!!draft.confirmedAt && !dirty)} onClick={() => modal.confirm({ title: m('confirmTitle'), content: m('confirmBody'), onOk: () => persist(true) })}>{m('confirmDiagram')}</Button></div>
    </div>
    {draft.confirmedAt && <p className="text-xs text-[var(--at-muted)]">{canonicalSummary(canonicalStatus(draft), iso => formatDateTime(iso))}</p>}
    {locked && <Alert type="info" showIcon icon={<Lock size={16} />} title={m('lockedTitle')} description={m('lockedBody')} action={<Button size="small" icon={<LockOpen size={14} />} loading={saving} disabled={loadError || dirty} onClick={() => modal.confirm({ title: m('unlockTitle'), content: m('unlockBody'), okText: m('unlock'), onOk: unlock })}>{m('unlockEdit')}</Button>} />}
    <div className={panel}>
      <div className="flex flex-wrap justify-between gap-3 mb-4"><div><h3 className="text-lg font-semibold">{m('map')}</h3><p className="text-xs text-[var(--at-muted)] mt-1">{m('arrows')} {locked ? m('selectLocked') : m('selectEdit')}</p></div><Button icon={<Plus size={14} />} disabled={locked} onClick={() => editComponent(null)}>{m('addComponent')}</Button></div>
      {!draft.components.length ? <Empty description={m('noComponents')} /> : <div className="overflow-x-auto bg-[var(--at-page)] border border-[var(--at-line)]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[680px]" aria-label={m('diagramFor', { project })}>
          <defs><marker id="dependency-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" className="fill-[var(--at-accent)]" /></marker></defs>
          {draft.dependencies.map((e, i) => {
            const a = positions.get(e.source), b = positions.get(e.target);
            if (!a || !b) return null;
            const sameRow = a.y === b.y, forward = a.x < b.x;
            const sx = sameRow ? a.x + (forward ? 190 : 0) : a.x + 95;
            const sy = sameRow ? a.y + 40 : a.y + (a.y < b.y ? 80 : 0);
            const tx = sameRow ? b.x + (forward ? 0 : 190) : b.x + 95;
            const ty = sameRow ? b.y + 40 : b.y + (a.y < b.y ? 0 : 80);
            const bend = 25 + (i % 3) * 12;
            return <g key={e.id}><path d={`M${sx},${sy} Q${(sx + tx) / 2},${(sy + ty) / 2 + bend} ${tx},${ty}`} fill="none" className="stroke-[var(--at-accent)]" strokeWidth="1.5" markerEnd="url(#dependency-arrow)" /><text x={(sx + tx) / 2} y={(sy + ty) / 2 + bend / 2 + 16} textAnchor="middle" className="fill-[var(--at-muted)]" fontSize="10">{e.label.slice(0, 24)}</text></g>;
          })}
          {draft.components.map(c => { const p = positions.get(c.id)!; return <g key={c.id} transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0} aria-label={m('editName', { name: c.name })} onClick={() => editComponent(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editComponent(c); } }} className="cursor-pointer outline-none focus:[&>rect]:stroke-white hover:[&>rect]:stroke-white"><title>{c.name}: {c.description}</title><rect width="190" height="80" rx="12" className="fill-[var(--at-solid)] stroke-[var(--at-accent)]" /><text x="14" y="25" className="fill-[var(--at-link)]" fontSize="10">{c.kind.toUpperCase()}</text><text x="14" y="50" className="fill-[var(--at-text)]" fontSize="13">{c.name.length > 23 ? `${c.name.slice(0, 22)}…` : c.name}</text></g>; })}
        </svg>
      </div>}
    </div>
    <div className="grid xl:grid-cols-2 gap-5">
      <section className={panel}><h3 className="font-semibold mb-4">{m('components')} <span className="text-[var(--at-muted)]">/ {draft.components.length}</span></h3><div className="divide-y divide-[var(--at-line)]">{draft.components.map(c => <div key={c.id} className="py-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm break-words">{c.name} <Tag>{c.kind}</Tag></p><p className="text-xs text-[var(--at-muted)] break-words mt-1">{c.description}</p>{c.pathPrefixes.length ? <p className="text-xs font-mono break-all mt-1" aria-label={m('pathsOf', { name: c.name })}>{c.pathPrefixes.join(', ')}</p> : <p className="text-xs text-[var(--at-warn)] mt-1">{m('noPaths')}</p>}</div><div className="flex shrink-0 gap-1"><Button size="small" onClick={() => editComponent(c)}>{m('edit')}</Button><Popconfirm disabled={locked} title={m('removeTitle', { name: c.name })} description={m('removeBody')} onConfirm={() => update({ ...draft, components: draft.components.filter(x => x.id !== c.id), dependencies: draft.dependencies.filter(e => e.source !== c.id && e.target !== c.id) })}><Button size="small" danger disabled={locked}>{m('remove')}</Button></Popconfirm></div></div>)}</div></section>
      <section className={panel}><div className="flex justify-between gap-3 mb-4"><h3 className="font-semibold">{m('dependencies')} / {draft.dependencies.length}</h3><Button size="small" disabled={locked || draft.components.length < 2} onClick={() => { edgeForm.resetFields(); setEditingEdge(null); setEdgeOpen(true); }}>{m('addDependency')}</Button></div>{!draft.dependencies.length && <Empty description={m('noDependencies')} image={Empty.PRESENTED_IMAGE_SIMPLE} />}<div className="divide-y divide-[var(--at-line)]">{draft.dependencies.map(e => <div className="py-3 flex items-center justify-between gap-3" key={e.id}><div className="text-sm"><p>{draft.components.find(c => c.id === e.source)?.name} → {draft.components.find(c => c.id === e.target)?.name}</p><p className="text-xs text-[var(--at-muted)] mt-1">{e.label}</p></div><div className="flex gap-1"><Button size="small" disabled={locked} onClick={() => { setEditingEdge(e); edgeForm.setFieldsValue(e); setEdgeOpen(true); }}>{m('edit')}</Button><Popconfirm disabled={locked} title={m('removeDependency')} onConfirm={() => update({ ...draft, dependencies: draft.dependencies.filter(x => x.id !== e.id) })}><Button size="small" danger disabled={locked}>{m('remove')}</Button></Popconfirm></div></div>)}</div></section>
    </div>
    <Modal title={component ? (locked ? m('mapPaths') : m('editComponent')) : m('addComponent')} open={component !== undefined} onCancel={() => setComponent(undefined)} onOk={() => componentForm.submit()} okText={m('apply')}>
      <Form form={componentForm} layout="vertical" onFinish={values => {
        const name = values.name.trim();
        if (draft.components.some(c => c.id !== component?.id && c.name.toLowerCase() === name.toLowerCase())) { message.error(m('unique')); return; }
        const checked = checkPathPrefixes(values.pathPrefixes ?? []);
        const pathProblem = 'error' in checked ? checked.error : prefixOverlap(component?.id, name, checked.prefixes, draft.components);
        if (pathProblem || 'error' in checked) { componentForm.setFields([{ name: 'pathPrefixes', errors: [pathProblem ?? ''] }]); return; }
        const next = { ...values, name, description: values.description?.trim() ?? '', pathPrefixes: checked.prefixes, id: component?.id ?? crypto.randomUUID() };
        update({ ...draft, components: component ? draft.components.map(c => c.id === component.id ? next : c) : [...draft.components, next] }); setComponent(undefined);
      }}>
        <Form.Item name="name" label={m('name')} rules={[{ required: true, whitespace: true, max: 80 }]}><Input maxLength={80} disabled={locked} /></Form.Item>
        <Form.Item name="kind" label={m('type')} rules={[{ required: true }]}><Select disabled={locked} options={['UI', 'Service', 'Database', 'Queue', 'External'].map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="description" label={m('responsibility')}><Input.TextArea rows={3} maxLength={1000} disabled={locked} /></Form.Item>
        <Form.Item name="pathPrefixes" label={m('prefixes')} extra={m('prefixesExtra')}>
          <Select mode="tags" open={false} suffixIcon={null} tokenSeparators={[',', ' ']} placeholder="BE/src/billing" aria-label={m('prefixes')} />
        </Form.Item>
      </Form>
    </Modal>
    <Modal title={editingEdge ? m('editDependency') : m('addDependency')} open={edgeOpen} onCancel={() => setEdgeOpen(false)} onOk={() => edgeForm.submit()}>
      <Form form={edgeForm} layout="vertical" onFinish={values => {
        if (values.source === values.target) { message.error(m('different')); return; }
        if (draft.dependencies.some(e => e.id !== editingEdge?.id && e.source === values.source && e.target === values.target)) { message.error(m('exists')); return; }
        const next = { ...values, label: values.label.trim(), id: editingEdge?.id ?? crypto.randomUUID() };
        update({ ...draft, dependencies: editingEdge ? draft.dependencies.map(e => e.id === editingEdge.id ? next : e) : [...draft.dependencies, next] }); setEdgeOpen(false);
      }}>
        <Form.Item name="source" label={m('source')} rules={[{ required: true }]}><Select options={options} /></Form.Item><Form.Item name="target" label={m('target')} rules={[{ required: true }]}><Select options={options} /></Form.Item><Form.Item name="label" label={m('protocol')} rules={[{ required: true, whitespace: true }]}><Input maxLength={40} placeholder={m('protocolPlaceholder')} /></Form.Item>
      </Form>
    </Modal>
    {dirty && <p role="status" className="text-xs text-[var(--at-warn)]">{m('saveFirst')}</p>}
  </div>;
}

export default function ComponentDiagram() {
  const m = useMessages(MSG);
  return <WorkspacePage title={m('title')} description={m('intro')}>{(project, onDirtyChange) => <DiagramEditor project={project} onDirtyChange={onDirtyChange} />}</WorkspacePage>;
}
