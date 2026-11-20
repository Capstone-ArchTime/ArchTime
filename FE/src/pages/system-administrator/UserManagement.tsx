import { useEffect, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Spin, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { tablePanel } from './admin-ui';
import { roles } from '@/auth/permissions';
import { useAuth } from '@/auth/auth-context';
import { systemRoleLabel } from '@/features/role-labels';
import {
  getAdminUsers,
  inviteUser,
  updateUserRole,
  suspendUser,
  reactivateUser,
} from '@/features/admin-api';
import type { AdminUser } from '@/features/admin-api';
import { formatDate } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  roleUpdated: 'User role updated.', sent: 'Invitation sent.', failed: 'Operation failed.', reactivateTitle: 'Reactivate {name}?', suspendTitle: 'Suspend {name}?',
  suspendBody: 'This user will not be able to sign in until reactivated.', reactivateBody: 'This user will be able to sign in again.', suspended: 'User suspended.', reactivated: 'User reactivated.',
  title: 'User Management', intro: 'Manage platform accounts and roles.', refresh: 'Refresh', invite: 'Invite user', search: 'Search users', searchPlaceholder: 'Name or email',
  filterRole: 'Filter user role', allRoles: 'All roles', filterStatus: 'Filter account status', allStatuses: 'All statuses', active: 'active', suspendedWord: 'suspended', invited: 'invited',
  loading: 'Loading users...', noMatch: 'No matching users', user: 'User', role: 'Role', status: 'Status', lastActive: 'Last active', never: 'Never', actions: 'Actions', you: 'This is you',
  editRole: 'Edit role', reactivate: 'Reactivate', suspend: 'Suspend', changeRole: 'Change account role', saveRole: 'Save role', sendInvitation: 'Send invitation', name: 'Name', email: 'Email', platformRole: 'Platform role',
}, {
  roleUpdated: 'Đã cập nhật vai trò người dùng.', sent: 'Đã gửi lời mời.', failed: 'Thao tác thất bại.', reactivateTitle: 'Kích hoạt lại {name}?', suspendTitle: 'Tạm ngưng {name}?',
  suspendBody: 'Người dùng này sẽ không đăng nhập được cho tới khi được kích hoạt lại.', reactivateBody: 'Người dùng này sẽ đăng nhập lại được.', suspended: 'Đã tạm ngưng người dùng.', reactivated: 'Đã kích hoạt lại người dùng.',
  title: 'Quản lý người dùng', intro: 'Quản lý tài khoản và vai trò trên nền tảng.', refresh: 'Làm mới', invite: 'Mời người dùng', search: 'Tìm người dùng', searchPlaceholder: 'Tên hoặc email',
  filterRole: 'Lọc theo vai trò', allRoles: 'Mọi vai trò', filterStatus: 'Lọc theo trạng thái tài khoản', allStatuses: 'Mọi trạng thái', active: 'hoạt động', suspendedWord: 'tạm ngưng', invited: 'đã mời',
  loading: 'Đang tải người dùng...', noMatch: 'Không có người dùng nào khớp', user: 'Người dùng', role: 'Vai trò', status: 'Trạng thái', lastActive: 'Hoạt động gần nhất', never: 'Chưa bao giờ', actions: 'Thao tác', you: 'Đây là bạn',
  editRole: 'Sửa vai trò', reactivate: 'Kích hoạt lại', suspend: 'Tạm ngưng', changeRole: 'Đổi vai trò tài khoản', saveRole: 'Lưu vai trò', sendInvitation: 'Gửi lời mời', name: 'Tên', email: 'Email', platformRole: 'Vai trò trên nền tảng',
});
const statusWord = (s: string, m: (k: 'active' | 'suspendedWord' | 'invited') => string) => (s === 'active' ? m('active') : s === 'suspended' ? m('suspendedWord') : s === 'invited' ? m('invited') : s);

export default function UserManagement() {
  const { message, modal } = App.useApp();
  const me = useAuth().user?.id;
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
  const m = useMessages(MSG);

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
        message.success(m('roleUpdated'));
      } else {
        await inviteUser({
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          role: values.role,
        });
        message.success(m('sent'));
      }
      setEditing(undefined);
      refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : m('failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(target: AdminUser) {
    const next = target.status === 'suspended' ? 'active' : 'suspended';
    modal.confirm({
      title: m(next === 'active' ? 'reactivateTitle' : 'suspendTitle', { name: target.name }),
      content: next === 'suspended' ? m('suspendBody') : m('reactivateBody'),
      onOk: async () => {
        try {
          if (next === 'suspended') {
            await suspendUser(target.id);
            message.success(m('suspended'));
          } else {
            await reactivateUser(target.id);
            message.success(m('reactivated'));
          }
          refresh();
        } catch (e) {
          message.error(e instanceof Error ? e.message : m('failed'));
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
      title={m('title')}
      description={m('intro')}
      error={error}
      actions={
        <div className="flex gap-2">
          <Button loading={loading} onClick={refresh}>{m('refresh')}</Button>
          <Button type="primary" onClick={() => open(null)}>{m('invite')}</Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-3">
        {roleCounts.map(({ role: r, count }) => (
          <Tag key={r} color="blue">{systemRoleLabel(r)}: {count}</Tag>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input.Search
          aria-label={m('search')}
          placeholder={m('searchPlaceholder')}
          className="max-w-sm"
          value={query}
          onChange={e => setQuery(e.target.value)}
          allowClear
        />
        <Select
          aria-label={m('filterRole')}
          value={role}
          onChange={setRole}
          className="min-w-52"
          options={['all', ...roles].map(value => ({
            value,
            label: value === 'all' ? m('allRoles') : systemRoleLabel(value),
          }))}
        />
        <Select
          aria-label={m('filterStatus')}
          value={status}
          onChange={setStatus}
          className="min-w-40"
          options={['all', 'active', 'suspended', 'invited'].map(value => ({
            value,
            label: value === 'all' ? m('allStatuses') : statusWord(value, m),
          }))}
        />
      </div>

      {loading && !users.length ? (
        <div className="p-12 text-center"><Spin /><p className="mt-3 text-[var(--at-muted)]">{m('loading')}</p></div>
      ) : (
        <div className={tablePanel}>
          <Table
            rowKey="id"
            dataSource={users}
            loading={loading}
            scroll={{ x: 850 }}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
            locale={{ emptyText: <Empty description={m('noMatch')} /> }}
            columns={[
              {
                title: m('user'),
                dataIndex: 'name',
                render: (_, u: AdminUser) => (
                  <div>
                    {u.name}
                    <p className="text-xs text-[var(--at-muted)]">{u.email}</p>
                  </div>
                ),
              },
              { title: m('role'), dataIndex: 'role', render: (r: string) => systemRoleLabel(r) },
              {
                title: m('status'),
                dataIndex: 'status',
                render: s => (
                  <Tag color={s === 'active' ? 'green' : s === 'suspended' ? 'red' : 'gold'}>
                    {statusWord(s, m)}
                  </Tag>
                ),
              },
              {
                title: m('lastActive'),
                dataIndex: 'lastActive',
                render: v => v ? formatDate(v) : m('never'),
              },
              {
                title: m('actions'),
                // No role change or suspension for the signed-in administrator: either could lock them out.
                render: (_, u: AdminUser) => u.id === me ? <span className="text-xs text-[var(--at-muted)]">{m('you')}</span> : (
                  <div className="flex gap-2">
                    <Button onClick={() => open(u)}>{m('editRole')}</Button>
                    {u.status !== 'invited' && (
                      <Button
                        danger={u.status !== 'suspended'}
                        onClick={() => changeStatus(u)}
                      >
                        {u.status === 'suspended' ? m('reactivate') : m('suspend')}
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      <Modal
        title={editing ? m('changeRole') : m('invite')}
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        okText={editing ? m('saveRole') : m('sendInvitation')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label={m('name')}
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input disabled={!!editing} maxLength={80} />
          </Form.Item>
          <Form.Item
            name="email"
            label={m('email')}
            rules={[{ required: true }, { type: 'email' }]}
          >
            <Input disabled={!!editing} maxLength={254} />
          </Form.Item>
          <Form.Item
            name="role"
            label={m('platformRole')}
            rules={[{ required: true }]}
          >
            <Select options={roles.map(value => ({ value, label: systemRoleLabel(value) }))} />
          </Form.Item>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
