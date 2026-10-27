import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Popconfirm, Select, Skeleton, Tag, Tooltip } from 'antd';
import { UserPlus } from 'lucide-react';
import { featurePanel } from '@/components/FeaturePage';
import { addMember, checkEmail, listMembers, memberActions, removeMember, updateMemberRole } from '@/features/organizations-api';
import type { Organization, OrganizationMember, OrganizationRole } from '@/features/organizations-api';

const ROLE_OPTIONS = [{ value: 'member', label: 'Member' }, { value: 'owner', label: 'Owner' }];

/**
 * Members of an organization. Owners add people by the email of their account, change roles and remove members;
 * anyone can leave. Leaving or being removed also ends the person's roles in the organization's workspaces.
 */
export default function MembersTab({ organization, userId, onCountChange, onLeft }: {
  organization: Organization;
  userId: string;
  onCountChange: (count: number) => void;
  onLeft: () => void;
}) {
  const { message } = App.useApp();
  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm<{ email: string; role: OrganizationRole }>();
  const owner = organization.myRole === 'owner';

  useEffect(() => {
    const controller = new AbortController();
    listMembers(organization.id, controller.signal)
      .then(list => setMembers([...list].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the members.'); });
    return () => controller.abort();
  }, [organization.id, attempt]);

  const update = (next: OrganizationMember[]) => { setMembers(next); onCountChange(next.length); };

  async function add(values: { email: string; role: OrganizationRole }) {
    setAdding(true);
    try {
      const added = await addMember(organization.id, { email: values.email.trim().toLowerCase(), role: values.role });
      update([...(members ?? []), added]);
      form.resetFields();
      message.success(`${added.name} was added as ${added.role === 'owner' ? 'an owner' : 'a member'}.`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not add this person.');
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(member: OrganizationMember, role: OrganizationRole) {
    setBusy(member.id);
    try {
      await updateMemberRole(organization.id, member.id, role);
      update((members ?? []).map(m => (m.id === member.id ? { ...m, role } : m)));
      message.success(`${member.name} is now ${role === 'owner' ? 'an owner' : 'a member'}.`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not change the role.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(member: OrganizationMember, self: boolean) {
    setBusy(member.id);
    try {
      const { removedProjectMemberships } = await removeMember(organization.id, member.id);
      const ended = removedProjectMemberships
        ? ` ${removedProjectMemberships} workspace ${removedProjectMemberships === 1 ? 'role' : 'roles'} in it ended.`
        : '';
      if (self) {
        message.success(`You left ${organization.name}.${ended}`);
        onLeft();
        return;
      }
      update((members ?? []).filter(m => m.id !== member.id));
      message.success(`${member.name} was removed from the organization.${ended}`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not remove this member.');
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => { setError(null); setMembers(null); setAttempt(a => a + 1); }}>Retry</Button>} />;
  if (!members) return <Skeleton active paragraph={{ rows: 3 }} />;

  return (
    <div className="space-y-4">
      {owner && (
        <div className={featurePanel}>
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><UserPlus size={16} className="text-[#93c5fd]" />Add a member</h3>
          <Form form={form} layout="inline" onFinish={add} initialValues={{ role: 'member' }} className="flex flex-wrap gap-y-2">
            <Form.Item name="email" className="min-w-64 flex-1" rules={[{ validator: (_, v) => { const p = checkEmail(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
              <Input type="email" placeholder="Email of their ArchTime account" aria-label="Email of the person to add" />
            </Form.Item>
            <Form.Item name="role"><Select options={ROLE_OPTIONS} aria-label="Role" className="w-32" /></Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" loading={adding}>Add</Button></Form.Item>
          </Form>
          <p className="mt-2 text-xs text-[#94a3b8]">The person needs an ArchTime account first. Members see only the workspaces they are given a role in; owners maintain every workspace of the organization.</p>
        </div>
      )}

      {!members.length ? <div className={featurePanel}><Empty description="No members." /></div> : (
        <ul className={`${featurePanel} divide-y divide-[#242527]`} aria-label="Members">
          {members.map(m => {
            const self = m.userId === userId;
            const can = memberActions(members, m, { userId, role: organization.myRole });
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">{m.name}{self && <span className="ml-2 text-xs text-[#94a3b8]">(you)</span>}</p>
                  <p className="text-xs text-[#94a3b8] break-all">{m.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {can.changeRole ? (
                    <Select size="small" value={m.role} options={ROLE_OPTIONS} className="w-28" disabled={busy === m.id} aria-label={`Role of ${m.name}`}
                      onChange={(role: OrganizationRole) => changeRole(m, role)} />
                  ) : (
                    <Tooltip title={can.reason}><Tag color={m.role === 'owner' ? 'blue' : undefined}>{m.role === 'owner' ? 'Owner' : 'Member'}</Tag></Tooltip>
                  )}
                  {can.remove && (
                    <Popconfirm title={`Remove ${m.name}?`} description="Their roles in this organization's workspaces end too." okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => remove(m, false)}>
                      <Button size="small" danger loading={busy === m.id}>Remove</Button>
                    </Popconfirm>
                  )}
                  {can.leave && (
                    <Popconfirm title={`Leave ${organization.name}?`} description="You lose access to its workspaces, including ones you created in it." okText="Leave" okButtonProps={{ danger: true }} onConfirm={() => remove(m, true)}>
                      <Button size="small" danger loading={busy === m.id}>Leave</Button>
                    </Popconfirm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
