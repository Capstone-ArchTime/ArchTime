import { useEffect, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Spin, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { roles } from '@/auth/permissions';
import {
  getAdminUsers,
  inviteUser,
  updateUserRole,
  suspendUser,
  reactivateUser,
} from '@/features/admin-api';
import type { AdminUser } from '@/features/admin-api';

export default function UserManagement() {
  const { message, modal } = App.useApp();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<AdminUser | null | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<{ name: string; email: string; role: string }>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getAdminUsers({ query: query.trim() || undefined, role, status }, controller.signal)
      .then(res => {
        setUsers(res.data.users);
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, query, role, status]);

  function refresh() {
    setRevision(v => v + 1);
  }

  function open(user: AdminUser | null) {
    form.resetFields();
    form.setFieldsValue(user ?? { role: 'developer-analyst' });
    setEditing(user);
  }

  async function handleSubmit(values: { name: string; email: string; role: string }) {
    setSubmitting(true);
    try {
      if (editing) {
        await updateUserRole(editing.id, values.role);
        message.success('User role updated.');
      } else {
        await inviteUser({
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          role: values.role,
        });
        message.success('Invitation sent.');
      }
      setEditing(undefined);
      refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(target: AdminUser) {
    const next = target.status === 'suspended' ? 'active' : 'suspended';
    modal.confirm({
      title: `${next === 'active' ? 'Reactivate' : 'Suspend'} ${target.name}?`,
      content: next === 'suspended' ? 'This user will not be able to sign in until reactivated.' : 'This user will be able to sign in again.',
      onOk: async () => {
        try {
          if (next === 'suspended') {
            await suspendUser(target.id);
            message.success('User suspended.');
          } else {
            await reactivateUser(target.id);
            message.success('User reactivated.');
          }
          refresh();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Operation failed.');
        }
      },
    });
  }

  const roleCounts = roles.map(r => ({
    role: r,
    count: users.filter(u => u.role === r).length,
  }));

  return (
    <FeaturePage
      title="User Management"
      description="Manage platform accounts and roles."
      error={error}
      actions={
        <div className="flex gap-2">
          <Button loading={loading} onClick={refresh}>Refresh</Button>
          <Button type="primary" onClick={() => open(null)}>Invite user</Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-3">
        {roleCounts.map(({ role: r, count }) => (
          <Tag key={r}>{r}: {count}</Tag>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input.Search
          aria-label="Search users"
          placeholder="Name or email"
          className="max-w-sm"
          value={query}
          onChange={e => setQuery(e.target.value)}
          allowClear
        />
        <Select
          aria-label="Filter user role"
          value={role}
          onChange={setRole}
          className="min-w-52"
          options={['all', ...roles].map(value => ({
            value,
            label: value === 'all' ? 'All roles' : value,
          }))}
        />
        <Select
          aria-label="Filter account status"
          value={status}
          onChange={setStatus}
          className="min-w-40"
          options={['all', 'active', 'suspended', 'invited'].map(value => ({
            value,
            label: value === 'all' ? 'All statuses' : value,
          }))}
        />
      </div>

      {loading && !users.length ? (
        <div className="p-12 text-center"><Spin /><p className="mt-3 text-[#94a3b8]">Loading users...</p></div>
      ) : (
        <Table
          rowKey="id"
          dataSource={users}
          loading={loading}
          scroll={{ x: 850 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
          locale={{ emptyText: <Empty description="No matching users" /> }}
          columns={[
            {
              title: 'User',
              dataIndex: 'name',
              render: (_, u: AdminUser) => (
                <div>
                  {u.name}
                  <p className="text-xs text-[#94a3b8]">{u.email}</p>
                </div>
              ),
            },
            { title: 'Role', dataIndex: 'role' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: s => (
                <Tag color={s === 'active' ? 'green' : s === 'suspended' ? 'red' : 'gold'}>
                  {s}
                </Tag>
              ),
            },
            {
              title: 'Last active',
              dataIndex: 'lastActive',
              render: v => v ? new Date(v).toLocaleDateString() : 'Never',
            },
            {
              title: 'Actions',
              render: (_, u: AdminUser) => (
                <div className="flex gap-2">
                  <Button onClick={() => open(u)}>Edit role</Button>
                  {u.status !== 'invited' && (
                    <Button
                      danger={u.status !== 'suspended'}
                      onClick={() => changeStatus(u)}
                    >
                      {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={editing ? 'Change account role' : 'Invite user'}
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        okText={editing ? 'Save role' : 'Send invitation'}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input disabled={!!editing} maxLength={80} />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true }, { type: 'email' }]}
          >
            <Input disabled={!!editing} maxLength={254} />
          </Form.Item>
          <Form.Item
            name="role"
            label="Platform role"
            rules={[{ required: true }]}
          >
            <Select options={roles.map(value => ({ value, label: value }))} />
          </Form.Item>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
