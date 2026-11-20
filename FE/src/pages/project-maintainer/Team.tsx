import { useEffect, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Spin, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import type { ProjectSummary } from '@/features/project-data';
import { ManagedWorkspaces } from './managed';
import { describeAccessError } from './managed-access';
import {
  getTeamMembers,
  inviteProjectMember,
  updateMemberRole,
  removeMember,
} from '@/features/pm-api';
import type { TeamMember } from '@/features/pm-api';
import { projectRoleLabel } from '@/features/role-labels';
import { filterTeamRows, teamRows, type TeamRow } from './team-rows';

import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  title: 'Team', loadFailed: 'The team could not be loaded.', sent: 'Invitation sent.', sendFailed: 'Failed to send invitation.', roleUpdated: 'Role updated.', roleFailed: 'Failed to update role.',
  revokeTitle: 'Revoke invitation?', removeTitle: 'Remove member?', revokeBody: "This will cancel {email}'s pending invitation to {workspace}.", removeBody: '{name} will no longer have access to {workspace}.',
  revoked: 'Invitation revoked.', removed: 'Member removed.', failed: 'Operation failed.', allWorkspaces: 'All workspaces', intro: 'Manage members and invitations across your maintained workspaces.',
  refresh: 'Refresh', inviteTo: 'Invite to workspace', inviteToName: 'Invite to {name}', search: 'Search team members', searchPlaceholder: 'Name or email', filter: 'Filter team by workspace',
  loading: 'Loading team...', none: 'No team members found', member: 'Member', workspace: 'Workspace', role: 'Role', roleOf: 'Role of {name} in {workspace}', status: 'Status',
  active: 'active', invited: 'invited', actions: 'Actions', owner: 'Workspace owner', revokeLabel: 'Revoke {name} from {workspace}', removeLabel: 'Remove {name} from {workspace}', revoke: 'Revoke', remove: 'Remove',
  inviteTitle: 'Invite member to {name}', workspaceWord: 'workspace', send: 'Send invitation', email: 'Email', workspaceRole: 'Workspace role',
}, {
  title: 'Nhóm', loadFailed: 'Không tải được nhóm.', sent: 'Đã gửi lời mời.', sendFailed: 'Không gửi được lời mời.', roleUpdated: 'Đã cập nhật vai trò.', roleFailed: 'Không cập nhật được vai trò.',
  revokeTitle: 'Thu hồi lời mời?', removeTitle: 'Xoá thành viên?', revokeBody: 'Lời mời đang chờ của {email} vào {workspace} sẽ bị huỷ.', removeBody: '{name} sẽ không còn quyền truy cập {workspace}.',
  revoked: 'Đã thu hồi lời mời.', removed: 'Đã xoá thành viên.', failed: 'Thao tác thất bại.', allWorkspaces: 'Mọi không gian làm việc', intro: 'Quản lý thành viên và lời mời trong các không gian làm việc bạn bảo trì.',
  refresh: 'Làm mới', inviteTo: 'Mời vào không gian làm việc', inviteToName: 'Mời vào {name}', search: 'Tìm thành viên', searchPlaceholder: 'Tên hoặc email', filter: 'Lọc nhóm theo không gian làm việc',
  loading: 'Đang tải nhóm...', none: 'Không tìm thấy thành viên nào', member: 'Thành viên', workspace: 'Không gian làm việc', role: 'Vai trò', roleOf: 'Vai trò của {name} trong {workspace}', status: 'Trạng thái',
  active: 'đang hoạt động', invited: 'đã mời', actions: 'Thao tác', owner: 'Chủ sở hữu không gian làm việc', revokeLabel: 'Thu hồi lời mời {name} khỏi {workspace}', removeLabel: 'Xoá {name} khỏi {workspace}', revoke: 'Thu hồi', remove: 'Xoá',
  inviteTitle: 'Mời thành viên vào {name}', workspaceWord: 'không gian làm việc', send: 'Gửi lời mời', email: 'Email', workspaceRole: 'Vai trò trong không gian làm việc',
});

export default function Team() {
  const m = useMessages(MSG);
  return <ManagedWorkspaces title={m('title')}>{projects => <TeamView projects={projects} />}</ManagedWorkspaces>;
}

function TeamView({ projects }: { projects: ProjectSummary[] }) {
  const { message, modal } = App.useApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [inviting, setInviting] = useState<string | null>(null); // projectId
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<{ email: string; role: string }>();
  const [revision, setRevision] = useState(0);
  const m = useMessages(MSG);
  const roleOptions = ['developer-analyst', 'project-maintainer'].map(value => ({ value, label: projectRoleLabel(value) }));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    getTeamMembers(controller.signal)
      .then(membersRes => {
        setMembers(membersRes.data.members);
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(describeAccessError(e, translate(MSG, 'loadFailed')));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [revision]);

  function refresh() {
    setRevision(v => v + 1);
  }

  const filtered = filterTeamRows(teamRows(members), query, projectFilter);
  const projectName = (id: string) => projects.find(p => p.id === id)?.name ?? id;

  function openInvite(projectId: string) {
    form.resetFields();
    form.setFieldsValue({ role: 'developer-analyst' });
    setInviting(projectId);
  }

  async function handleInvite(values: { email: string; role: string }) {
    if (!inviting) return;
    setSubmitting(true);
    try {
      await inviteProjectMember(inviting, {
        email: values.email.trim().toLowerCase(),
        role: values.role,
      });
      message.success(m('sent'));
      setInviting(null);
      refresh();
    } catch (e) {
      message.error(describeAccessError(e, m('sendFailed')));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateRole(projectId: string, memberId: string, role: string) {
    try {
      await updateMemberRole(projectId, memberId, role);
      message.success(m('roleUpdated'));
      refresh();
    } catch (e) {
      message.error(describeAccessError(e, m('roleFailed')));
    }
  }

  async function handleRemove(row: TeamRow) {
    const invited = row.status === 'invited';
    modal.confirm({
      title: invited ? m('revokeTitle') : m('removeTitle'),
      content: invited
        ? m('revokeBody', { email: row.email, workspace: projectName(row.projectId) })
        : m('removeBody', { name: row.name, workspace: projectName(row.projectId) }),
      onOk: async () => {
        try {
          // An invited row is a membership record too (not a token invitation), so both go through the member route.
          await removeMember(row.projectId, row.memberId);
          message.success(invited ? m('revoked') : m('removed'));
          refresh();
        } catch (e) {
          message.error(describeAccessError(e, m('failed')));
        }
      },
    });
  }

  const projectOptions = [
    { value: 'all', label: m('allWorkspaces') },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <FeaturePage
      title={m('title')}
      description={m('intro')}
      error={error}
      demo={false}
      actions={
        <div className="flex gap-2">
          <Button loading={loading} onClick={refresh}>{m('refresh')}</Button>
          <Select
            placeholder={m('inviteTo')}
            className="min-w-48"
            value={undefined}
            onChange={openInvite}
            options={projects.map(p => ({ value: p.id, label: m('inviteToName', { name: p.name }) }))}
          />
        </div>
      }
    >
      <div className="flex flex-wrap gap-3">
        <Input.Search
          aria-label={m('search')}
          placeholder={m('searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="max-w-sm"
          allowClear
        />
        <Select
          aria-label={m('filter')}
          value={projectFilter}
          onChange={setProjectFilter}
          className="min-w-60"
          options={projectOptions}
        />
      </div>

      {loading && !members.length ? (
        <div className="p-12 text-center">
          <Spin />
          <p className="mt-3 text-[var(--at-muted)]">{m('loading')}</p>
        </div>
      ) : (
        <Table
          rowKey="key"
          dataSource={filtered}
          loading={loading}
          scroll={{ x: 850 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <Empty description={m('none')} /> }}
          columns={[
            {
              title: m('member'),
              render: (_, r: TeamRow) => (
                <div>
                  {r.name}
                  <p className="text-xs text-[var(--at-muted)]">{r.email}</p>
                </div>
              ),
            },
            { title: m('workspace'), render: (_, r: TeamRow) => <Tag>{projectName(r.projectId)}</Tag> },
            {
              title: m('role'),
              render: (_, r: TeamRow) =>
                r.isOwner ? (
                  projectRoleLabel('owner')
                ) : (
                  <Select
                    size="small"
                    aria-label={m('roleOf', { name: r.name, workspace: projectName(r.projectId) })}
                    value={r.role}
                    onChange={role => handleUpdateRole(r.projectId, r.memberId, role)}
                    options={roleOptions}
                    className="min-w-36"
                  />
                ),
            },
            {
              title: m('status'),
              dataIndex: 'status',
              render: s => <Tag color={s === 'active' ? 'green' : 'gold'}>{s === 'active' ? m('active') : s === 'invited' ? m('invited') : s}</Tag>,
            },
            {
              title: m('actions'),
              render: (_, r: TeamRow) =>
                r.isOwner ? (
                  <span className="text-xs text-[var(--at-muted)]">{m('owner')}</span>
                ) : (
                  <Button
                    danger
                    size="small"
                    aria-label={m(r.status === 'invited' ? 'revokeLabel' : 'removeLabel', { name: r.name, workspace: projectName(r.projectId) })}
                    onClick={() => handleRemove(r)}
                  >
                    {r.status === 'invited' ? m('revoke') : m('remove')}
                  </Button>
                ),
            },
          ]}
        />
      )}

      <Modal
        title={m('inviteTitle', { name: projects.find(p => p.id === inviting)?.name ?? m('workspaceWord') })}
        open={!!inviting}
        onCancel={() => setInviting(null)}
        onOk={() => form.submit()}
        okText={m('send')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label={m('email')}
            rules={[{ required: true }, { type: 'email' }]}
          >
            <Input maxLength={254} placeholder="team@example.com" />
          </Form.Item>
          <Form.Item
            name="role"
            label={m('workspaceRole')}
            rules={[{ required: true }]}
          >
            <Select
              options={roleOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
