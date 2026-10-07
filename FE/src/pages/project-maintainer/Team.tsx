import { useEffect, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Spin, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import {
  getTeamMembers,
  getProjectMembers,
  inviteProjectMember,
  updateMemberRole,
  removeMember,
  cancelInvitation,
  getProjectInvitations,
} from '@/features/pm-api';
import type { TeamMember, ProjectMember, ProjectInvitation } from '@/features/pm-api';

type CombinedMember = TeamMember | (ProjectMember & { projects: string[] });

export default function Team() {
  const { message, modal } = App.useApp();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [editing, setEditing] = useState<{ member: CombinedMember; projectId: string } | null | undefined>();
  const [inviting, setInviting] = useState<string | null>(null); // projectId
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<{ email: string; role: string }>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    Promise.all([
      getProjects(controller.signal),
      getTeamMembers(controller.signal),
    ])
      .then(([projectsRes, membersRes]) => {
        setProjects(projectsRes);
        setMembers(membersRes.data.members);
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [revision]);

  function refresh() {
    setRevision(v => v + 1);
  }

  const filtered = members.filter(
    m =>
      `${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()) &&
      (projectFilter === 'all' || m.projects.includes(projectFilter))
  );

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
      message.error(e instanceof Error ? e.message : 'Failed to send invitation.');
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
      message.error(e instanceof Error ? e.message : 'Failed to update role.');
    }
  }

  async function handleRemove(member: CombinedMember, projectId: string) {
    modal.confirm({
      title: member.status === 'invited' ? 'Revoke invitation?' : 'Remove member?',
      content: member.status === 'invited'
        ? 'This will cancel the pending invitation.'
        : 'This member will no longer have access to this project.',
      onOk: async () => {
        try {
          if (member.status === 'invited') {
            await cancelInvitation(projectId, member.id);
          } else {
            await removeMember(projectId, member.id);
          }
          message.success(member.status === 'invited' ? 'Invitation revoked.' : 'Member removed.');
          refresh();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Operation failed.');
        }
      },
    });
  }

  const projectOptions = [
    { value: 'all', label: 'All projects' },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <FeaturePage
      title="Team"
      description="Manage members and invitations across your maintained projects."
      error={error}
      actions={
        <div className="flex gap-2">
          <Button loading={loading} onClick={refresh}>Refresh</Button>
          <Select
            placeholder="Invite to project"
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
          aria-label="Filter team by project"
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
          rowKey="id"
          dataSource={filtered}
          loading={loading}
          scroll={{ x: 850 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="No team members found" /> }}
          columns={[
            {
              title: 'Member',
              render: (_, m: TeamMember) => (
                <div>
                  {m.name}
                  <p className="text-xs text-[#94a3b8]">{m.email}</p>
                </div>
              ),
            },
            { title: 'Role', dataIndex: 'role' },
            {
              title: 'Projects',
              render: (_, m: TeamMember) => (
                <div className="flex flex-wrap gap-1">
                  {m.projects.map(p => {
                    const project = projects.find(pr => pr.id === p || pr.name === p);
                    return <Tag key={p}>{project?.name ?? p}</Tag>;
                  })}
                </div>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              render: s => <Tag color={s === 'active' ? 'green' : 'gold'}>{s}</Tag>,
            },
            {
              title: 'Actions',
              render: (_, m: TeamMember) => (
                <div className="flex gap-2">
                  <Select
                    size="small"
                    value={m.role}
                    onChange={role => {
                      const projectId = m.projects[0];
                      if (projectId) handleUpdateRole(projectId, m.id, role);
                    }}
                    options={[
                      { value: 'developer-analyst', label: 'developer-analyst' },
                      { value: 'project-maintainer', label: 'project-maintainer' },
                    ]}
                    className="min-w-36"
                  />
                  <Button
                    danger
                    size="small"
                    onClick={() => {
                      const projectId = m.projects[0];
                      if (projectId) handleRemove(m, projectId);
                    }}
                  >
                    {m.status === 'invited' ? 'Revoke' : 'Remove'}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={`Invite member to ${projects.find(p => p.id === inviting)?.name ?? 'project'}`}
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
            label="Project role"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'developer-analyst', label: 'Developer / Analyst' },
                { value: 'project-maintainer', label: 'Project Maintainer' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
