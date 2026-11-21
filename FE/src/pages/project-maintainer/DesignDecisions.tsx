import { downloadText } from '@/features/download';
import { useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Spin, Tag } from 'antd';
import { Plus, BookOpen } from 'lucide-react';
import { WorkspacePage, StorageError, ConflictAlert } from './workspace';
import { panel, useWorkspace } from './workspace-store';
import type { Decision } from './workspace-store';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  Proposed: 'Proposed', Accepted: 'Accepted', Deprecated: 'Deprecated', removedHistorical: 'Removed component (historical link)', recorded: '{count} recorded decisions', recorded_one: '1 recorded decision',
  record: 'Record decision', search: 'Search design decisions', searchPlaceholder: 'Search decisions, context, or ADR number', filter: 'Filter by decision status', allStatuses: 'All statuses',
  noMatch: 'No matching decisions.', none: 'Record your first decision to preserve the reasoning behind your architecture.', updatedLine: 'Updated {date} · {count} linked components', updatedLine_one: 'Updated {date} · 1 linked component',
  read: 'Read', export: 'Export Markdown', edit: 'Edit', editTitle: 'Edit {adr}', recordTitle: 'Record design decision', saveDecision: 'Save decision', saved: 'Design decision recorded.',
  title: 'Title', titlePlaceholder: 'Use asynchronous events for notifications', status: 'Status', related: 'Related components', optional: 'Optional',
  context: 'Context', contextPlaceholder: 'What problem or constraints led to this decision?', decision: 'Decision', decisionPlaceholder: 'What did we choose, and why?',
  alternatives: 'Alternatives considered', alternativesPlaceholder: 'Other approaches and why they were not selected', consequences: 'Consequences & trade-offs', consequencesPlaceholder: 'Benefits, costs, risks, and follow-up work',
  close: 'Close', noAlternatives: 'No alternatives recorded.', relatedCaps: 'RELATED COMPONENTS', removed: 'Removed component', noLinked: 'No components linked.', createdUpdated: 'Created {created} · Updated {updated}',
  pageTitle: 'Design Decisions', intro: 'Why the architecture is the way it is.', details: 'Each record keeps the context of a decision, the approach chosen, the alternatives considered and its trade-offs.',
}, {
  Proposed: 'Đề xuất', Accepted: 'Đã chấp nhận', Deprecated: 'Không dùng nữa', removedHistorical: 'Thành phần đã xoá (liên kết cũ)', recorded: '{count} quyết định đã ghi lại',
  record: 'Ghi quyết định', search: 'Tìm quyết định thiết kế', searchPlaceholder: 'Tìm quyết định, bối cảnh hoặc số ADR', filter: 'Lọc theo trạng thái quyết định', allStatuses: 'Mọi trạng thái',
  noMatch: 'Không có quyết định nào khớp.', none: 'Hãy ghi quyết định đầu tiên để lưu lại lý do đằng sau kiến trúc của bạn.', updatedLine: 'Cập nhật {date} · {count} thành phần liên kết',
  read: 'Đọc', export: 'Xuất Markdown', edit: 'Sửa', editTitle: 'Sửa {adr}', recordTitle: 'Ghi quyết định thiết kế', saveDecision: 'Lưu quyết định', saved: 'Đã ghi quyết định thiết kế.',
  title: 'Tiêu đề', titlePlaceholder: 'Dùng sự kiện bất đồng bộ cho thông báo', status: 'Trạng thái', related: 'Thành phần liên quan', optional: 'Không bắt buộc',
  context: 'Bối cảnh', contextPlaceholder: 'Vấn đề hoặc ràng buộc nào dẫn tới quyết định này?', decision: 'Quyết định', decisionPlaceholder: 'Chúng ta đã chọn gì, và vì sao?',
  alternatives: 'Các phương án đã cân nhắc', alternativesPlaceholder: 'Các cách khác và vì sao không chọn', consequences: 'Hệ quả & đánh đổi', consequencesPlaceholder: 'Lợi ích, chi phí, rủi ro và việc cần làm tiếp',
  close: 'Đóng', noAlternatives: 'Chưa ghi phương án nào.', relatedCaps: 'THÀNH PHẦN LIÊN QUAN', removed: 'Thành phần đã xoá', noLinked: 'Chưa liên kết thành phần nào.', createdUpdated: 'Tạo {created} · Cập nhật {updated}',
  pageTitle: 'Quyết định thiết kế', intro: 'Vì sao kiến trúc lại như hiện tại.', details: 'Mỗi bản ghi giữ bối cảnh của quyết định, cách đã chọn, các phương án đã cân nhắc và đánh đổi.',
});

const statuses = ['Proposed', 'Accepted', 'Deprecated'] as const;
const colors = { Proposed: 'gold', Accepted: 'green', Deprecated: 'default' };
const adr = (number: number) => `ADR-${String(number).padStart(3, '0')}`;
function exportDecision(d: Decision, project: string) {
  const text = [`# ${adr(d.number)}: ${d.title}`, `Workspace: ${project}`, `Status: ${d.status}`, 'Source: ArchTime workspace', `Created: ${d.createdAt}`, `Updated: ${d.updatedAt}`, '## Context', d.context, '## Decision', d.decision, '## Alternatives', d.alternatives || 'None recorded.', '## Consequences', d.consequences, '## Component IDs', d.componentIds.join(', ') || 'None'].join('\n\n');
  downloadText(`${adr(d.number)}.md`, text, 'text/markdown;charset=utf-8');
}

function DecisionEditor({ project }: { project: string }) {
  const { data, save, loading, loadError, loadErrorMessage, conflictError, reload } = useWorkspace(project);
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Decision | null | undefined>();
  const [viewing, setViewing] = useState<Decision | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [form] = Form.useForm<Decision>();
  const m = useMessages(MSG);
  function open(value: Decision | null) {
    form.resetFields(); form.setFieldsValue(value ?? { status: 'Proposed', componentIds: [] }); setEditing(value);
  }
  const filtered = data.decisions.filter(d => (status === 'All' || d.status === status) && `${adr(d.number)} ${d.title} ${d.context} ${d.decision}`.toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, JSON.stringify([search, status]));
  const componentOptions = data.diagram.components.map(c => ({ value: c.id, label: c.name }));
  for (const id of editing?.componentIds ?? []) {
    if (!componentOptions.some(c => c.value === id)) componentOptions.push({ value: id, label: m('removedHistorical') });
  }
  if (loading) return <div className="py-20 flex justify-center"><Spin /></div>;
  return <div className="space-y-5">
    <StorageError visible={loadError} message={loadErrorMessage} onRetry={reload} />
    <ConflictAlert error={conflictError} onReload={reload} />
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><BookOpen size={20} className="text-[var(--at-link)]" /><span className="text-sm">{m('recorded', { count: data.decisions.length })}</span></div><Button type="primary" icon={<Plus size={14} />} disabled={loadError} onClick={() => open(null)}>{m('record')}</Button></div>
    <div className="flex flex-col sm:flex-row gap-3"><Input.Search aria-label={m('search')} placeholder={m('searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} allowClear className="max-w-lg" /><Select aria-label={m('filter')} value={status} onChange={setStatus} className="w-full sm:w-44" options={['All', ...statuses].map(value => ({ value, label: value === 'All' ? m('allStatuses') : m(value as Decision['status']) }))} /></div>
    {!filtered.length && <div className={panel}><Empty description={search || status !== 'All' ? m('noMatch') : m('none')} /></div>}
    <div className="space-y-3">{pagination.items.map(d => <article className={panel} key={d.id}>
      <div className="flex flex-wrap justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-3 mb-2"><span className="text-xs text-[var(--at-link)] font-mono">{adr(d.number)}</span><Tag color={colors[d.status]}>{m(d.status)}</Tag></div><button onClick={() => setViewing(d)} className="text-lg font-semibold text-left hover:text-[var(--at-link)] focus-visible:outline focus-visible:outline-[var(--at-accent)] break-words">{d.title}</button><p className="text-sm text-[var(--at-muted)] mt-2 line-clamp-2 whitespace-pre-wrap break-words">{d.decision}</p><p className="text-xs text-[var(--at-muted)] mt-4">{m('updatedLine', { date: formatDateTime(d.updatedAt), count: d.componentIds.length })}</p></div><div className="flex items-start gap-2"><Button size="small" onClick={() => setViewing(d)}>{m('read')}</Button><Button size="small" onClick={() => exportDecision(d, project)}>{m('export')}</Button><Button size="small" disabled={loadError} onClick={() => open(d)}>{m('edit')}</Button></div></div>
    </article>)}</div>
    <PaginationBar {...pagination} />
    <Modal title={editing ? m('editTitle', { adr: adr(editing.number) }) : m('recordTitle')} width={720} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText={m('saveDecision')}>
      <Form form={form} layout="vertical" onFinish={async values => {
        const now = new Date().toISOString();
        const decision: Decision = { ...values, title: values.title.trim(), context: values.context.trim(), decision: values.decision.trim(), alternatives: values.alternatives?.trim() ?? '', consequences: values.consequences.trim(), componentIds: values.componentIds ?? [], id: editing?.id ?? crypto.randomUUID(), number: editing?.number ?? Math.max(0, ...data.decisions.map(d => d.number)) + 1, createdAt: editing?.createdAt ?? now, updatedAt: now };
        const ok = await save({ ...data, decisions: editing ? data.decisions.map(d => d.id === editing.id ? decision : d) : [decision, ...data.decisions] });
        if (ok) { message.success(m('saved')); setEditing(undefined); }
      }}>
        <Form.Item name="title" label={m('title')} rules={[{ required: true, whitespace: true }]}><Input maxLength={160} placeholder={m('titlePlaceholder')} /></Form.Item>
        <div className="grid sm:grid-cols-2 gap-x-4"><Form.Item name="status" label={m('status')} rules={[{ required: true }]}><Select options={statuses.map(value => ({ value, label: m(value) }))} /></Form.Item><Form.Item name="componentIds" label={m('related')}><Select mode="multiple" options={componentOptions} placeholder={m('optional')} /></Form.Item></div>
        <Form.Item name="context" label={m('context')} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={10000} placeholder={m('contextPlaceholder')} /></Form.Item>
        <Form.Item name="decision" label={m('decision')} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={10000} placeholder={m('decisionPlaceholder')} /></Form.Item>
        <Form.Item name="alternatives" label={m('alternatives')}><Input.TextArea rows={2} maxLength={10000} placeholder={m('alternativesPlaceholder')} /></Form.Item>
        <Form.Item name="consequences" label={m('consequences')} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={10000} placeholder={m('consequencesPlaceholder')} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={viewing ? `${adr(viewing.number)} · ${viewing.title}` : ''} width={760} open={!!viewing} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>{m('close')}</Button>}>
      {viewing && <div className="space-y-5"><Tag color={colors[viewing.status]}>{m(viewing.status)}</Tag>{([[m('context'), viewing.context], [m('decision'), viewing.decision], [m('alternatives'), viewing.alternatives || m('noAlternatives')], [m('consequences'), viewing.consequences]]).map(([label, text]) => <section key={label}><h3 className="text-xs uppercase tracking-wider text-[var(--at-link)] mb-2">{label}</h3><p className="whitespace-pre-wrap break-words text-sm text-[#cbd5e1]">{text}</p></section>)}<section><h3 className="text-xs text-[var(--at-link)] mb-2">{m('relatedCaps')}</h3>{viewing.componentIds.length ? viewing.componentIds.map(id => <Tag key={id}>{data.diagram.components.find(c => c.id === id)?.name ?? m('removed')}</Tag>) : <p className="text-sm text-[var(--at-muted)]">{m('noLinked')}</p>}</section><p className="text-xs text-[var(--at-muted)]">{m('createdUpdated', { created: formatDateTime(viewing.createdAt), updated: formatDateTime(viewing.updatedAt) })}</p></div>}
    </Modal>
  </div>;
}

export default function DesignDecisions() {
  const m = useMessages(MSG);
  return <WorkspacePage title={m('pageTitle')} description={m('intro')}
    details={<p>{m('details')}</p>}>{project => <DecisionEditor project={project} />}</WorkspacePage>;
}
