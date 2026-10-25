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

const roleOptions = ['developer-analyst', 'project-maintainer'].map(value => ({ value, label: projectRoleLabel(value) }));

export default function Team() {
  return <ManagedWorkspaces title="Team">{projects => <TeamView projects={projects} />}</ManagedWorkspaces>;
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

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    getTeamMembers(controller.signal)
      .then(membersRes => {
        setMembers(membersRes.data.members);
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(describeAccessError(e, 'The team could not be loaded.'));
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
      message.success('Invitation sent.');
      setInviting(null);
      refresh();
    } catch (e) {
      message.error(describeAccessError(e, 'Failed to send invitation.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateRole(projectId: string, memberId: string, role: string) {
    try {
      await updateMemberRole(projectId, memberId, role);
      message.success('Role updated.');
      refresh();
    } catch (e) {
      message.error(describeAccessError(e, 'Failed to update role.'));
    }
  }

  async function handleRemove(row: TeamRow) {
    const invited = row.status === 'invited';
    modal.confirm({
      title: invited ? 'Revoke invitation?' : 'Remove member?',
      content: invited
        ? `This will cancel ${row.email}'s pending invitation to ${projectName(row.projectId)}.`
        : `${row.name} will no longer have access to ${projectName(row.projectId)}.`,
      onOk: async () => {
        try {
          // An invited row is a membership record too (not a token invitation), so both go through the member route.
          await removeMember(row.projectId, row.memberId);
          message.success(invited ? 'Invitation revoked.' : 'Member removed.');
          refresh();
        } catch (e) {
          message.error(describeAccessError(e, 'Operation failed.'));
        }
      },
    });
  }

  const projectOptions = [
    { value: 'all', label: 'All workspaces' },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <FeaturePage
      title="Team"
      description="Manage members and invitations across your maintained workspaces."
      error={error}
      demo={false}
      actions={
        <div className="flex gap-2">
          <Button loading={loading} onClick={refresh}>Refresh</Button>
          <Select
            placeholder="Invite to workspace"
            className="min-w-48"
            value={undefined}
            onChange={openInvite}
            options={projects.map(p => ({ value: p.id, label: `Invite to ${p.name}` }))}
          />
        </div>
      }
    >
      <div className="flex flex-wrap gap-3">
        <Input.Search
          aria-label="Search team members"
          placeholder="Name or email"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="max-w-sm"
          allowClear
        />
        <Select
          aria-label="Filter team by workspace"
          value={projectFilter}
          onChange={setProjectFilter}
          className="min-w-60"
          options={projectOptions}
        />
      </div>

      {loading && !members.length ? (
        <div className="p-12 text-center">
          <Spin />
          <p className="mt-3 text-[#94a3b8]">Loading team...</p>
        </div>
      ) : (
        <Table
          rowKey="key"
          dataSource={filtered}
          loading={loading}
          scroll={{ x: 850 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="No team members found" /> }}
          columns={[
            {
              title: 'Member',
              render: (_, r: TeamRow) => (
                <div>
                  {r.name}
                  <p className="text-xs text-[#94a3b8]">{r.email}</p>
                </div>
              ),
            },
            { title: 'Workspace', render: (_, r: TeamRow) => <Tag>{projectName(r.projectId)}</Tag> },
            {
              title: 'Role',
              render: (_, r: TeamRow) =>
                r.isOwner ? (
                  projectRoleLabel('owner')
                ) : (
                  <Select
                    size="small"
                    aria-label={`Role of ${r.name} in ${projectName(r.projectId)}`}
                    value={r.role}
                    onChange={role => handleUpdateRole(r.projectId, r.memberId, role)}
                    options={roleOptions}
                    className="min-w-36"
                  />
                ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              render: s => <Tag color={s === 'active' ? 'green' : 'gold'}>{s}</Tag>,
            },
            {
              title: 'Actions',
              render: (_, r: TeamRow) =>
                r.isOwner ? (
                  <span className="text-xs text-[#94a3b8]">Workspace owner</span>
                ) : (
                  <Button
                    danger
                    size="small"
                    aria-label={`${r.status === 'invited' ? 'Revoke' : 'Remove'} ${r.name} from ${projectName(r.projectId)}`}
                    onClick={() => handleRemove(r)}
                  >
                    {r.status === 'invited' ? 'Revoke' : 'Remove'}
                  </Button>
                ),
            },
          ]}
        />
      )}

      <Modal
        title={`Invite member to ${projects.find(p => p.id === inviting)?.name ?? 'workspace'}`}
        open={!!inviting}
        onCancel={() => setInviting(null)}
        onOk={() => form.submit()}
        okText="Send invitation"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true }, { type: 'email' }]}
          >
            <Input maxLength={254} placeholder="team@example.com" />
          </Form.Item>
          <Form.Item
            name="role"
            label="Workspace role"
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
