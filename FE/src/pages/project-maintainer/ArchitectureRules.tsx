import { evaluateRule } from '@/features/evaluate-rule';
import { downloadText } from '@/features/download';
import { useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Switch, Tag } from 'antd';
import { Plus, ShieldCheck } from 'lucide-react';
import { WorkspacePage, StorageError } from './workspace';
import { panel, useWorkspace } from './workspace-store';
import type { Rule } from './workspace-store';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';

function RulesEditor({ project }: { project: string }) {
  const { data, save, loadError, conflictError, reload } = useWorkspace(project);
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Rule | null | undefined>();
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('All');
  const [form] = Form.useForm<Rule>();
  const options = data.diagram.components.map(c => ({ value: c.id, label: c.name }));
  const name = (id: string) => data.diagram.components.find(c => c.id === id)?.name ?? 'Removed component';
  const result = (rule: Rule) => evaluateRule(data.diagram, rule);
  function open(rule: Rule | null) {
    form.resetFields(); form.setFieldsValue(rule ?? { constraint: 'forbidden', severity: 'error', enabled: true }); setEditing(rule);
  }
  const filtered = data.rules.filter(r => `${r.name} ${r.rationale}`.toLowerCase().includes(search.toLowerCase()) && (resultFilter === 'All' || result(r).label === resultFilter));
  const pagination = usePagination(filtered, JSON.stringify([search, resultFilter]));
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
    <div className="flex flex-wrap gap-3"><Select aria-label="Filter rule results" className="min-w-44" value={resultFilter} onChange={setResultFilter} options={["All", "Satisfied", "Violation", "Needs review", "Disabled"].map(value => ({ value, label: value }))} /><Button disabled={loadError} onClick={() => downloadText("architecture-rules.json", JSON.stringify({ project, revision: data.diagram.revision, source: "local-demo", rules: filtered.map(rule => ({ ...rule, result: result(rule).label })) }, null, 2))}>Export filtered results</Button></div>
    <div className="flex flex-wrap gap-3 items-center justify-between"><div className="flex items-center gap-3"><ShieldCheck size={20} className="text-[#38bdf8]" /><span className="text-sm">{data.rules.filter(r => r.enabled).length} active rules</span><Tag color="red">{data.rules.filter(r => result(r).label === 'Violation').length} violations</Tag></div><Button type="primary" icon={<Plus size={14} />} disabled={loadError || options.length < 2} onClick={() => open(null)}>Define rule</Button></div>
    <p className="text-xs text-[#94a3b8]">Results evaluate direct dependencies in the saved diagram, revision {data.diagram.revision} ({data.diagram.confirmedAt ? 'confirmed' : 'draft'}). They do not analyze repository source code.</p>
    {options.length < 2 && <p className="text-sm text-[#ffb03a]">Add and save at least two components in the Component Diagram before defining a rule.</p>}
    <Input.Search aria-label="Search architecture rules" placeholder="Search rules by name or rationale" value={search} onChange={e => setSearch(e.target.value)} allowClear className="max-w-md" />
    {!filtered.length && <div className={panel}><Empty description={search ? 'No matching rules.' : 'No rules defined. Set boundaries for your architecture.'} /></div>}
    <div className="space-y-3">{pagination.items.map(rule => { const state = result(rule); return <article className={panel} key={rule.id}>
      <div className="flex flex-wrap justify-between items-start gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold break-words">{rule.name}</h3><Tag color={state.color}>{state.label}</Tag><Tag color={rule.severity === 'error' ? 'red' : 'gold'}>{rule.severity}</Tag></div><p className="text-sm text-[#38bdf8] mt-3">{name(rule.source)} <span className="text-[#94a3b8]">{rule.constraint === 'forbidden' ? 'must not depend on' : 'must depend on'}</span> {name(rule.target)}</p><p className="text-sm text-[#94a3b8] whitespace-pre-wrap break-words mt-2">{rule.rationale}</p></div><div className="flex items-center gap-2"><Switch aria-label={`Enable ${rule.name}`} checked={rule.enabled} disabled={loadError} onChange={async enabled => { await save({ ...data, rules: data.rules.map(r => r.id === rule.id ? { ...r, enabled } : r) }); }} /><Button size="small" onClick={() => open(rule)} disabled={loadError}>Edit</Button><Popconfirm title="Delete this rule?" onConfirm={async () => { await save({ ...data, rules: data.rules.filter(r => r.id !== rule.id) }); }}><Button size="small" danger disabled={loadError}>Delete</Button></Popconfirm></div></div>
    </article>; })}</div>
    <PaginationBar {...pagination} />
    <Modal title={editing ? 'Edit architecture rule' : 'Define architecture rule'} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText="Save rule">
      <Form form={form} layout="vertical" onFinish={async values => {
        if (values.source === values.target) { message.error('Source and target must be different components.'); return; }
        if (![values.source, values.target].every(id => data.diagram.components.some(c => c.id === id))) { message.error('Choose existing components.'); return; }
        if (data.rules.some(r => r.id !== editing?.id && r.name.toLowerCase() === values.name.trim().toLowerCase())) { message.error('A rule with this name already exists.'); return; }
        if (data.rules.some(r => r.id !== editing?.id && r.source === values.source && r.target === values.target)) { message.error('A rule for this dependency already exists. Edit that rule instead.'); return; }
        const rule: Rule = { ...values, id: editing?.id ?? crypto.randomUUID(), name: values.name.trim(), rationale: values.rationale.trim() };
        const ok = await save({ ...data, rules: editing ? data.rules.map(r => r.id === editing.id ? rule : r) : [...data.rules, rule] });
        if (ok) { message.success('Architecture rule saved.'); setEditing(undefined); }
      }}>
        <Form.Item name="name" label="Rule name" rules={[{ required: true, whitespace: true }]}><Input maxLength={100} placeholder="Keep the UI independent of persistence" /></Form.Item>
        <Form.Item name="source" label="Source component" rules={[{ required: true }]}><Select options={options} /></Form.Item>
        <Form.Item name="constraint" label="Constraint" rules={[{ required: true }]}><Select options={[{ value: 'forbidden', label: 'Must not depend on' }, { value: 'required', label: 'Must depend on' }]} /></Form.Item>
        <Form.Item name="target" label="Target component" rules={[{ required: true }]}><Select options={options} /></Form.Item>
        <Form.Item name="severity" label="Severity" rules={[{ required: true }]}><Select options={[{ value: 'error', label: 'Error' }, { value: 'warning', label: 'Warning' }]} /></Form.Item>
        <Form.Item name="rationale" label="Rationale" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={2000} placeholder="Why should this boundary be enforced?" /></Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
  </div>;
}

export default function ArchitectureRules() {
  return <WorkspacePage title="Architecture Rules" description="Define allowed boundaries, document their rationale, and check the saved component model for violations.">{project => <RulesEditor project={project} />}</WorkspacePage>;
}
