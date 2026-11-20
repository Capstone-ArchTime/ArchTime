import { evaluateRule } from '@/features/evaluate-rule';
import { downloadText } from '@/features/download';
import { useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Spin, Switch, Tag } from 'antd';
import { Plus, ShieldCheck } from 'lucide-react';
import { WorkspacePage, StorageError, ConflictAlert } from './workspace';
import { panel, useWorkspace } from './workspace-store';
import type { Rule } from './workspace-store';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  removed: 'Removed component', filter: 'Filter rule results', All: 'All', Satisfied: 'Satisfied', Violation: 'Violation', 'Needs review': 'Needs review', Disabled: 'Disabled', export: 'Export filtered results',
  active: '{count} active rules', active_one: '1 active rule', violations: '{count} violations', violations_one: '1 violation', define: 'Define rule',
  evaluate: 'Results evaluate direct dependencies in the saved diagram, revision {revision} ({state}). They do not analyze repository source code.', confirmed: 'confirmed', draft: 'draft',
  needTwo: 'Add and save at least two components in the Component Diagram before defining a rule.', search: 'Search architecture rules', searchPlaceholder: 'Search rules by name or rationale',
  noMatch: 'No matching rules.', none: 'No rules defined. Set boundaries for your architecture.', mustNot: 'must not depend on', must: 'must depend on', enable: 'Enable {name}', edit: 'Edit',
  deleteTitle: 'Delete this rule?', delete: 'Delete', editTitle: 'Edit architecture rule', defineTitle: 'Define architecture rule', saveRule: 'Save rule',
  sameComponents: 'Source and target must be different components.', existing: 'Choose existing components.', nameTaken: 'A rule with this name already exists.',
  duplicate: 'A rule for this dependency already exists. Edit that rule instead.', saved: 'Architecture rule saved.', name: 'Rule name', namePlaceholder: 'Keep the UI independent of persistence',
  source: 'Source component', constraint: 'Constraint', mustNotCap: 'Must not depend on', mustCap: 'Must depend on', target: 'Target component', severity: 'Severity', error: 'Error', warning: 'Warning',
  rationale: 'Rationale', rationalePlaceholder: 'Why should this boundary be enforced?', enabled: 'Enabled', title: 'Architecture Rules', intro: 'Which components may depend on which, and why.',
  details: 'Each rule records an allowed or forbidden boundary with its rationale. Checking the rules compares them with the saved component diagram and lists the violations.',
}, {
  removed: 'Thành phần đã xoá', filter: 'Lọc kết quả quy tắc', All: 'Tất cả', Satisfied: 'Đạt', Violation: 'Vi phạm', 'Needs review': 'Cần xem lại', Disabled: 'Đã tắt', export: 'Xuất kết quả đã lọc',
  active: '{count} quy tắc đang bật', violations: '{count} vi phạm', define: 'Định nghĩa quy tắc',
  evaluate: 'Kết quả đánh giá các phụ thuộc trực tiếp trong sơ đồ đã lưu, phiên bản {revision} ({state}). Không phân tích mã nguồn repository.', confirmed: 'đã xác nhận', draft: 'nháp',
  needTwo: 'Hãy thêm và lưu ít nhất hai thành phần trong Sơ đồ thành phần trước khi định nghĩa quy tắc.', search: 'Tìm quy tắc kiến trúc', searchPlaceholder: 'Tìm quy tắc theo tên hoặc lý do',
  noMatch: 'Không có quy tắc nào khớp.', none: 'Chưa định nghĩa quy tắc nào. Hãy đặt ranh giới cho kiến trúc của bạn.', mustNot: 'không được phụ thuộc vào', must: 'phải phụ thuộc vào', enable: 'Bật {name}', edit: 'Sửa',
  deleteTitle: 'Xoá quy tắc này?', delete: 'Xoá', editTitle: 'Sửa quy tắc kiến trúc', defineTitle: 'Định nghĩa quy tắc kiến trúc', saveRule: 'Lưu quy tắc',
  sameComponents: 'Thành phần nguồn và đích phải khác nhau.', existing: 'Hãy chọn các thành phần đang có.', nameTaken: 'Đã có quy tắc trùng tên.',
  duplicate: 'Đã có quy tắc cho phụ thuộc này. Hãy sửa quy tắc đó.', saved: 'Đã lưu quy tắc kiến trúc.', name: 'Tên quy tắc', namePlaceholder: 'Giữ UI độc lập với tầng lưu trữ',
  source: 'Thành phần nguồn', constraint: 'Ràng buộc', mustNotCap: 'Không được phụ thuộc vào', mustCap: 'Phải phụ thuộc vào', target: 'Thành phần đích', severity: 'Mức độ', error: 'Lỗi', warning: 'Cảnh báo',
  rationale: 'Lý do', rationalePlaceholder: 'Vì sao cần giữ ranh giới này?', enabled: 'Bật', title: 'Quy tắc kiến trúc', intro: 'Thành phần nào được phụ thuộc vào thành phần nào, và vì sao.',
  details: 'Mỗi quy tắc ghi lại một ranh giới được phép hoặc bị cấm cùng lý do. Kiểm tra quy tắc sẽ so sánh với sơ đồ thành phần đã lưu và liệt kê các vi phạm.',
});
type ResultLabel = 'All' | 'Satisfied' | 'Violation' | 'Needs review' | 'Disabled';

function RulesEditor({ project }: { project: string }) {
  const { data, save, saving, loading, loadError, loadErrorMessage, conflictError, reload } = useWorkspace(project);
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Rule | null | undefined>();
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('All');
  const [form] = Form.useForm<Rule>();
  const m = useMessages(MSG);
  const label = (value: string) => (['All', 'Satisfied', 'Violation', 'Needs review', 'Disabled'].includes(value) ? m(value as ResultLabel) : value);
  const options = data.diagram.components.map(c => ({ value: c.id, label: c.name }));
  const name = (id: string) => data.diagram.components.find(c => c.id === id)?.name ?? m('removed');
  const result = (rule: Rule) => evaluateRule(data.diagram, rule);
  function open(rule: Rule | null) {
    form.resetFields(); form.setFieldsValue(rule ?? { constraint: 'forbidden', severity: 'error', enabled: true }); setEditing(rule);
  }
  const filtered = data.rules.filter(r => `${r.name} ${r.rationale}`.toLowerCase().includes(search.toLowerCase()) && (resultFilter === 'All' || result(r).label === resultFilter));
  const pagination = usePagination(filtered, JSON.stringify([search, resultFilter]));
  if (loading) return <div className="py-20 flex justify-center"><Spin /></div>;
  return <div className="space-y-5">
    <StorageError visible={loadError} message={loadErrorMessage} onRetry={reload} />
    <ConflictAlert error={conflictError} onReload={reload} />
    <div className="flex flex-wrap gap-3"><Select aria-label={m('filter')} className="min-w-44" value={resultFilter} onChange={setResultFilter} options={["All", "Satisfied", "Violation", "Needs review", "Disabled"].map(value => ({ value, label: label(value) }))} /><Button disabled={loadError} onClick={() => downloadText("architecture-rules.json", JSON.stringify({ project, revision: data.diagram.revision, source: "archtime", rules: filtered.map(rule => ({ ...rule, result: result(rule).label })) }, null, 2))}>{m('export')}</Button></div>
    <div className="flex flex-wrap gap-3 items-center justify-between"><div className="flex items-center gap-3"><ShieldCheck size={20} className="text-[var(--at-link)]" /><span className="text-sm">{m('active', { count: data.rules.filter(r => r.enabled).length })}</span><Tag color="red">{m('violations', { count: data.rules.filter(r => result(r).label === 'Violation').length })}</Tag></div><Button type="primary" icon={<Plus size={14} />} disabled={loadError || options.length < 2} onClick={() => open(null)}>{m('define')}</Button></div>
    <p className="text-xs text-[var(--at-muted)]">{m('evaluate', { revision: data.diagram.revision, state: data.diagram.confirmedAt ? m('confirmed') : m('draft') })}</p>
    {options.length < 2 && <p className="text-sm text-[var(--at-warn)]">{m('needTwo')}</p>}
    <Input.Search aria-label={m('search')} placeholder={m('searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} allowClear className="max-w-md" />
    {!filtered.length && <div className={panel}><Empty description={search ? m('noMatch') : m('none')} /></div>}
    <div className="space-y-3">{pagination.items.map(rule => { const state = result(rule); return <article className={panel} key={rule.id}>
      <div className="flex flex-wrap justify-between items-start gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold break-words">{rule.name}</h3><Tag color={state.color}>{label(state.label)}</Tag><Tag color={rule.severity === 'error' ? 'red' : 'gold'}>{rule.severity === 'error' ? m('error') : m('warning')}</Tag></div><p className="text-sm text-[var(--at-link)] mt-3">{name(rule.source)} <span className="text-[var(--at-muted)]">{rule.constraint === 'forbidden' ? m('mustNot') : m('must')}</span> {name(rule.target)}</p><p className="text-sm text-[var(--at-muted)] whitespace-pre-wrap break-words mt-2">{rule.rationale}</p></div><div className="flex items-center gap-2"><Switch aria-label={m('enable', { name: rule.name })} checked={rule.enabled} disabled={loadError || saving} onChange={async enabled => { await save({ ...data, rules: data.rules.map(r => r.id === rule.id ? { ...r, enabled } : r) }); }} /><Button size="small" onClick={() => open(rule)} disabled={loadError}>{m('edit')}</Button><Popconfirm title={m('deleteTitle')} onConfirm={async () => { await save({ ...data, rules: data.rules.filter(r => r.id !== rule.id) }); }}><Button size="small" danger disabled={loadError}>{m('delete')}</Button></Popconfirm></div></div>
    </article>; })}</div>
    <PaginationBar {...pagination} />
    <Modal title={editing ? m('editTitle') : m('defineTitle')} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText={m('saveRule')}>
      <Form form={form} layout="vertical" onFinish={async values => {
        if (values.source === values.target) { message.error(m('sameComponents')); return; }
        if (![values.source, values.target].every(id => data.diagram.components.some(c => c.id === id))) { message.error(m('existing')); return; }
        if (data.rules.some(r => r.id !== editing?.id && r.name.toLowerCase() === values.name.trim().toLowerCase())) { message.error(m('nameTaken')); return; }
        if (data.rules.some(r => r.id !== editing?.id && r.source === values.source && r.target === values.target)) { message.error(m('duplicate')); return; }
        const rule: Rule = { ...values, id: editing?.id ?? crypto.randomUUID(), name: values.name.trim(), rationale: values.rationale.trim() };
        const ok = await save({ ...data, rules: editing ? data.rules.map(r => r.id === editing.id ? rule : r) : [...data.rules, rule] });
        if (ok) { message.success(m('saved')); setEditing(undefined); }
      }}>
        <Form.Item name="name" label={m('name')} rules={[{ required: true, whitespace: true }]}><Input maxLength={100} placeholder={m('namePlaceholder')} /></Form.Item>
        <Form.Item name="source" label={m('source')} rules={[{ required: true }]}><Select options={options} /></Form.Item>
        <Form.Item name="constraint" label={m('constraint')} rules={[{ required: true }]}><Select options={[{ value: 'forbidden', label: m('mustNotCap') }, { value: 'required', label: m('mustCap') }]} /></Form.Item>
        <Form.Item name="target" label={m('target')} rules={[{ required: true }]}><Select options={options} /></Form.Item>
        <Form.Item name="severity" label={m('severity')} rules={[{ required: true }]}><Select options={[{ value: 'error', label: m('error') }, { value: 'warning', label: m('warning') }]} /></Form.Item>
        <Form.Item name="rationale" label={m('rationale')} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={2000} placeholder={m('rationalePlaceholder')} /></Form.Item>
        <Form.Item name="enabled" label={m('enabled')} valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
  </div>;
}

export default function ArchitectureRules() {
  const m = useMessages(MSG);
  return <WorkspacePage title={m('title')} description={m('intro')}
    details={<p>{m('details')}</p>}>{project => <RulesEditor project={project} />}</WorkspacePage>;
}
