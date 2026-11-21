import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Popconfirm, Select, Skeleton, Tag, Tooltip } from 'antd';
import { UserPlus } from 'lucide-react';
import { featurePanel } from '@/components/FeaturePage';
import { addMember, checkEmail, listMembers, memberActions, removeMember, updateMemberRole } from '@/features/organizations-api';
import type { Organization, OrganizationMember, OrganizationRole } from '@/features/organizations-api';
import { Details } from '@/components/PageHeader';
import { message as translate, useMessages } from '@/i18n/define';
import { ORG } from './messages';

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
  const m = useMessages(ORG);
  const ROLE_OPTIONS = [{ value: 'member', label: m('member') }, { value: 'owner', label: m('owner') }];
  // RF-14: while suspended the server refuses every change by owners except leaving, so only Leave is offered.
  const suspended = !!organization.suspension;
  const owner = organization.myRole === 'owner' && !suspended;

  useEffect(() => {
    const controller = new AbortController();
    listMembers(organization.id, controller.signal)
      .then(list => setMembers([...list].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(ORG, 'membersFailed')); });
    return () => controller.abort();
  }, [organization.id, attempt]);

  // Only people who accepted count as members; owners also see the invitations still waiting for an answer.
  const update = (next: OrganizationMember[]) => { setMembers(next); onCountChange(next.filter(x => x.status !== 'invited').length); };

  async function add(values: { email: string; role: OrganizationRole }) {
    setAdding(true);
    try {
      const added = await addMember(organization.id, { email: values.email.trim().toLowerCase(), role: values.role });
      update([...(members ?? []), added]);
      form.resetFields();
      message.success(m(added.role === 'owner' ? 'invitedAsOwner' : 'invitedAsMember', { name: added.name }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('addFailed'));
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(member: OrganizationMember, role: OrganizationRole) {
    setBusy(member.id);
    try {
      await updateMemberRole(organization.id, member.id, role);
      update((members ?? []).map(x => (x.id === member.id ? { ...x, role } : x)));
      message.success(m(role === 'owner' ? 'nowOwner' : 'nowMember', { name: member.name }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('roleFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(member: OrganizationMember, self: boolean) {
    setBusy(member.id);
    try {
      const { removedProjectMemberships, cancelledInvitations } = await removeMember(organization.id, member.id);
      const ended = (removedProjectMemberships ? m('rolesEnded', { count: removedProjectMemberships }) : '')
        + (cancelledInvitations ? m('invitationsWithdrawn', { count: cancelledInvitations }) : '');
      if (self) {
        message.success(m('youLeft', { name: organization.name, ended }));
        onLeft();
        return;
      }
      update((members ?? []).filter(x => x.id !== member.id));
      message.success(m('removed', { name: member.name, ended }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('removeFailed'));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => { setError(null); setMembers(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />;
  if (!members) return <Skeleton active paragraph={{ rows: 3 }} />;

  return (
    <div className="space-y-4">
      {owner && (
        <div className={featurePanel}>
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><UserPlus size={16} className="text-[var(--at-link)]" />{m('addMember')}</h3>
          <Form form={form} layout="inline" onFinish={add} initialValues={{ role: 'member' }} className="flex flex-wrap gap-y-2">
            <Form.Item name="email" className="min-w-64 flex-1" rules={[{ validator: (_, v) => { const p = checkEmail(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
              <Input type="email" placeholder={m('emailPlaceholder')} aria-label={m('emailLabel')} />
            </Form.Item>
            <Form.Item name="role"><Select options={ROLE_OPTIONS} aria-label={m('role')} className="w-32" /></Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" loading={adding}>{m('add')}</Button></Form.Item>
          </Form>
          <p className="mt-2 text-xs text-[var(--at-muted)]">{m('needsAccount')}</p>
          <Details className="mt-1" bodyClassName="text-xs"><p>{m('membersDetails')}</p></Details>
        </div>
      )}

      {!members.length ? <div className={featurePanel}><Empty description={m('noMembers')} /></div> : (
        <ul className={`${featurePanel} divide-y divide-[var(--at-line)]`} aria-label={m('membersTab')}>
          {members.map(member => {
            const self = member.userId === userId;
            const can = memberActions(members, member, { userId, role: suspended ? 'member' : organization.myRole });
            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">{member.name}{self && <span className="ml-2 text-xs text-[var(--at-muted)]">{m('you')}</span>}
                    {member.status === 'invited' && <Tag className="ml-2" color="gold">{m('invited')}</Tag>}</p>
                  <p className="text-xs text-[var(--at-muted)] break-all">{member.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {can.changeRole ? (
                    <Select size="small" value={member.role} options={ROLE_OPTIONS} className="w-28" disabled={busy === member.id} aria-label={m('roleOf', { name: member.name })}
                      onChange={(role: OrganizationRole) => changeRole(member, role)} />
                  ) : (
                    <Tooltip title={can.reason}><Tag color={member.role === 'owner' ? 'blue' : undefined}>{member.role === 'owner' ? m('owner') : m('member')}</Tag></Tooltip>
                  )}
                  {can.remove && (
                    <Popconfirm title={m(member.status === 'invited' ? 'withdrawTitle' : 'removeTitle', { name: member.name })}
                      description={member.status === 'invited' ? m('withdrawBody') : m('removeBody')}
                      okText={member.status === 'invited' ? m('withdraw') : m('remove')} okButtonProps={{ danger: true }} onConfirm={() => remove(member, false)}>
                      <Button size="small" danger loading={busy === member.id}>{member.status === 'invited' ? m('withdraw') : m('remove')}</Button>
                    </Popconfirm>
                  )}
                  {can.leave && (
                    <Popconfirm title={m('leaveTitle', { name: organization.name })} description={m('leaveBody')} okText={m('leave')} okButtonProps={{ danger: true }} onConfirm={() => remove(member, true)}>
                      <Button size="small" danger loading={busy === member.id}>{m('leave')}</Button>
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
