import { useState } from 'react';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { demoProjects, useMaintainerDemo } from '@/features/maintainer-demo';
import type { TeamMember } from '@/features/maintainer-demo';

export default function Team() {
  const store = useMaintainerDemo();
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [editing, setEditing] = useState<TeamMember | null | undefined>();
  const [form] = Form.useForm<TeamMember>();
  function open(member: TeamMember | null) { form.resetFields(); form.setFieldsValue(member ?? { role: 'developer-analyst', projects: project === 'all' ? [] : [project] }); setEditing(member); }
  const rows = store.data.members.filter(m => `${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()) && (project === 'all' || m.projects.includes(project)));
  return <FeaturePage title="Team" description="Manage members and invitations across your maintained projects." error={store.error} actions={<Button type="primary" disabled={!!store.error} onClick={() => open(null)}>Invite member</Button>}>
    <div className="flex flex-wrap gap-3"><Input.Search aria-label="Search team members" placeholder="Name or email" value={query} onChange={e => setQuery(e.target.value)} className="max-w-sm" allowClear /><Select aria-label="Filter team by project" value={project} onChange={setProject} className="min-w-60" options={['all', ...demoProjects].map(value => ({ value, label: value === 'all' ? 'All projects' : value }))} /></div>
    <Table rowKey="id" dataSource={rows} scroll={{ x: 850 }} pagination={{ pageSize: 10, showSizeChanger: false }} columns={[
      { title: 'Member', render: (_, m: TeamMember) => <div>{m.name}<p className="text-xs text-[#94a3b8]">{m.email}</p></div> }, { title: 'Role', dataIndex: 'role' },
      { title: 'Projects', render: (_, m: TeamMember) => <div className="flex flex-wrap gap-1">{m.projects.map(p => <Tag key={p}>{p}</Tag>)}</div> },
      { title: 'Status', dataIndex: 'status', render: s => <Tag color={s === 'active' ? 'green' : 'gold'}>{s}</Tag> },
      { title: 'Actions', render: (_, m: TeamMember) => <div className="flex gap-2"><Button disabled={!!store.error} onClick={() => open(m)}>Edit</Button><Popconfirm title={m.status === 'invited' ? 'Revoke this demo invitation?' : 'Remove this demo member from all listed projects?'} onConfirm={() => { if (store.save({ ...store.data, members: store.data.members.filter(item => item.id !== m.id) })) message.success('Removed locally.'); }}><Button danger disabled={!!store.error}>{m.status === 'invited' ? 'Revoke' : 'Remove'}</Button></Popconfirm></div> },
    ]} />
    <Modal title={editing ? 'Edit project membership' : 'Invite member (local demo)'} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText="Save locally">
      <Form form={form} layout="vertical" onFinish={values => {
        const email = values.email.trim().toLowerCase();
        if (store.data.members.some(m => m.id !== editing?.id && m.email.toLowerCase() === email)) { message.error('This member already exists. Edit their project memberships instead.'); return; }
        const next: TeamMember = { ...values, email, name: values.name.trim(), id: editing?.id ?? crypto.randomUUID(), status: editing?.status ?? 'invited' };
        if (store.save({ ...store.data, members: editing ? store.data.members.map(m => m.id === editing.id ? next : m) : [...store.data.members, next] })) { message.success('Saved locally. No invitation email was sent.'); setEditing(undefined); }
      }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}><Input maxLength={80} /></Form.Item><Form.Item name="email" label="Email" rules={[{ required: true }, { type: 'email' }]}><Input disabled={!!editing} maxLength={254} /></Form.Item>
        <Form.Item name="projects" label="Projects" rules={[{ required: true, type: 'array', min: 1 }]}><Select mode="multiple" options={demoProjects.map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="role" label="Project role" rules={[{ required: true }]}><Select options={['developer-analyst', 'project-maintainer'].map(value => ({ value, label: value }))} /></Form.Item>
      </Form>
    </Modal>
  </FeaturePage>;
}
