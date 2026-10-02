import { useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { useAuth } from '@/auth/auth-context';
import { roles } from '@/auth/permissions';
import { useAdminDemo, withAudit } from '@/features/admin-demo';
import type { DemoUser } from '@/features/admin-demo';

export default function UserManagement() {
  const store = useAdminDemo();
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<DemoUser | null | undefined>();
  const [form] = Form.useForm<DemoUser>();
  const filtered = store.data.users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()) && (role === 'all' || u.role === role) && (status === 'all' || u.status === status));
  function open(value: DemoUser | null) { form.resetFields(); form.setFieldsValue(value ?? { role: 'developer-analyst' }); setEditing(value); }
  function changeStatus(target: DemoUser) {
    const next = target.status === 'suspended' ? 'active' : 'suspended';
    modal.confirm({ title: `${next === 'active' ? 'Reactivate' : 'Suspend'} ${target.name}?`, content: 'This changes the local demo account only.', onOk: () => {
      if (store.save(withAudit({ ...store.data, users: store.data.users.map(u => u.id === target.id ? { ...u, status: next } : u) }, user!.name, 'security', `${target.email}: ${target.status} → ${next}`))) message.success('Demo account updated.');
    } });
  }
  return <FeaturePage title="User Management" description="Manage platform accounts and roles." error={store.error} actions={<Button type="primary" disabled={!!store.error} onClick={() => open(null)}>Invite user</Button>}>
    <div className="flex flex-wrap gap-3">{roles.map(r => <Tag key={r}>{r}: {store.data.users.filter(u => u.role === r).length}</Tag>)}</div>
    <div className="flex flex-wrap gap-3"><Input.Search aria-label="Search users" placeholder="Name or email" className="max-w-sm" value={query} onChange={e => setQuery(e.target.value)} allowClear /><Select aria-label="Filter user role" value={role} onChange={setRole} className="min-w-52" options={['all', ...roles].map(value => ({ value, label: value === 'all' ? 'All roles' : value }))} /><Select aria-label="Filter account status" value={status} onChange={setStatus} className="min-w-40" options={['all', 'active', 'suspended', 'invited'].map(value => ({ value, label: value === 'all' ? 'All statuses' : value }))} /></div>
    <Table rowKey="id" dataSource={filtered} scroll={{ x: 850 }} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty description="No matching users" /> }} columns={[
      { title: 'User', dataIndex: 'name', render: (_, u: DemoUser) => <div>{u.name}<p className="text-xs text-[#94a3b8]">{u.email}</p></div> },
      { title: 'Role', dataIndex: 'role' }, { title: 'Status', dataIndex: 'status', render: s => <Tag color={s === 'active' ? 'green' : s === 'suspended' ? 'red' : 'gold'}>{s}</Tag> },
      { title: 'Last active', dataIndex: 'lastActive' },
      { title: 'Actions', render: (_, u: DemoUser) => <div className="flex gap-2"><Button disabled={!!store.error} onClick={() => open(u)}>Edit role</Button>{u.status !== 'invited' && <Button danger={u.status !== 'suspended'} disabled={!!store.error} onClick={() => changeStatus(u)}>{u.status === 'suspended' ? 'Reactivate' : 'Suspend'}</Button>}</div> },
    ]} />
    <Modal title={editing ? 'Change account role' : 'Invite user (local demo)'} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText={editing ? 'Save role' : 'Create demo invitation'}>
      <Form form={form} layout="vertical" onFinish={values => {
        const email = values.email.trim().toLowerCase();
        if (store.data.users.some(u => u.id !== editing?.id && u.email.toLowerCase() === email)) { message.error('This email already has an account or invitation.'); return; }
        const next: DemoUser = { ...values, email, name: values.name.trim(), id: editing?.id ?? crypto.randomUUID(), status: editing?.status ?? 'invited', lastActive: editing?.lastActive ?? 'Never' };
        if (store.save(withAudit({ ...store.data, users: editing ? store.data.users.map(u => u.id === editing.id ? next : u) : [...store.data.users, next] }, user!.name, editing ? 'role_change' : 'invitation', editing ? `${email}: ${editing.role} → ${next.role}` : `Demo invitation created for ${email}`))) { message.success('Saved locally. No email was sent.'); setEditing(undefined); }
      }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, max: 80 }]}><Input disabled={!!editing} maxLength={80} /></Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true }, { type: 'email' }]}><Input disabled={!!editing} maxLength={254} /></Form.Item>
        <Form.Item name="role" label="Platform role" rules={[{ required: true }]}><Select options={roles.map(value => ({ value, label: value }))} /></Form.Item>
      </Form>
    </Modal>
  </FeaturePage>;
}
