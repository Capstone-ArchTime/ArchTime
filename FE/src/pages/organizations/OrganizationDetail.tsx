import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Empty, Form, Input, Modal, Skeleton, Tabs, Tag } from 'antd';
import { ArrowLeft, Building2, Pencil } from 'lucide-react';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { ApiError, apiRequest } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { DESCRIPTION_MAX, NAME_MAX, checkDescription, checkOrganizationName, getOrganization, updateOrganization } from '@/features/organizations-api';
import type { Organization } from '@/features/organizations-api';
import MembersTab from './MembersTab';
import CredentialsTab from './CredentialsTab';
import AiCostTab from './AiCostTab';
import { formatDateTime } from '@/i18n/format';
import { message as translate, useMessages } from '@/i18n/define';
import { ORG } from './messages';

type OrgWorkspace = { id: string; name: string; userRole: string; status: string };
const ROLE_LABELS: Record<string, 'owner' | 'maintainer' | 'member' | 'viewer'> = { owner: 'owner', 'project-maintainer': 'maintainer', 'developer-analyst': 'member', viewer: 'viewer' };

/** The organization's workspaces the account can open (owners: all of them; members: the ones they have a role in). */
function WorkspacesTab({ organization }: { organization: Organization }) {
  const [list, setList] = useState<OrgWorkspace[] | null>(null);
  const m = useMessages(ORG);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ data?: { projects?: any[] } }>('/projects?scope=all&limit=100', { signal: controller.signal })
      .then(body => setList((body?.data?.projects ?? []).filter(p => p.organizationId === organization.id)
        .map(p => ({ id: String(p.id), name: String(p.name ?? ''), userRole: String(p.userRole ?? 'viewer'), status: String(p.status ?? '') }))
        .sort((a, b) => a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(ORG, 'workspacesFailed')); });
    return () => controller.abort();
  }, [organization.id]);

  if (error) return <Alert type="error" showIcon title={error} />;
  if (!list) return <Skeleton active paragraph={{ rows: 2 }} />;
  const hint = organization.myRole === 'owner'
    ? m('ownerHint')
    : m('memberHint');
  if (!list.length) return <div className={featurePanel}><Empty description={m('noWorkspaces', { hint })} /></div>;
  return (
    <div className="space-y-2">
      <ul className={`${featurePanel} divide-y divide-[var(--at-line)]`} aria-label={m('workspaces')}>
        {list.map(w => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link to={`/workspace/${encodeURIComponent(w.id)}`} className="font-medium hover:text-[var(--at-link)] break-words">{w.name}</Link>
            <Tag>{ROLE_LABELS[w.userRole] ? m(ROLE_LABELS[w.userRole]) : w.userRole}</Tag>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--at-muted)]">{hint}</p>
    </div>
  );
}

/** One organization: its details, members, workspaces and (for owners) repository credentials. */
export default function OrganizationDetail() {
  const { orgId = '' } = useParams();
  const { user } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState<{ text: string; missing: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string; description: string }>();
  const m = useMessages(ORG);

  useEffect(() => {
    const controller = new AbortController();
    getOrganization(orgId, controller.signal)
      .then(setOrganization)
      .catch(cause => {
        if (controller.signal.aborted) return;
        const missing = cause instanceof ApiError && (cause.status === 404 || cause.status === 403);
        setError({ text: missing ? translate(ORG, 'notFound') : cause instanceof Error ? cause.message : translate(ORG, 'loadFailed'), missing });
      });
    return () => controller.abort();
  }, [orgId, attempt]);

  async function save(values: { name: string; description: string }) {
    if (!organization) return;
    setSaving(true);
    try {
      const saved = await updateOrganization(organization.id, { name: values.name.trim(), description: values.description?.trim() ?? '' });
      setOrganization({ ...organization, ...saved });
      setEditing(false);
      message.success(m('updated'));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const back = <Link to="/organizations" className="inline-flex items-center gap-1 text-sm text-[var(--at-muted)] hover:text-[var(--at-link)]"><ArrowLeft size={14} />{m('allOrgs')}</Link>;

  if (error || !organization || !user) {
    return (
      <FeaturePage title={m('organization')} description={m('detailIntro')} demo={false} actions={back}>
        {error ? <Alert type="error" showIcon title={error.text} action={!error.missing && <Button size="small" onClick={() => { setError(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />
          : <Skeleton active paragraph={{ rows: 4 }} />}
      </FeaturePage>
    );
  }

  // While suspended, the server refuses every change by its owners (RF-14), so the page does not offer them.
  const owner = organization.myRole === 'owner' && !organization.suspension;
  return (
    <FeaturePage
      title={organization.name}
      description={organization.description || (owner ? m('noDescription') : m('belongTo'))}
      demo={false}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {back}
          {owner && <Button icon={<Pencil size={14} />} onClick={() => { form.setFieldsValue({ name: organization.name, description: organization.description }); setEditing(true); }}>{m('edit')}</Button>}
        </div>
      }
    >
      {organization.suspension && <Alert type="warning" showIcon title={m('suspendedTitle')}
        description={`${m('suspendedBy')}${organization.suspension.at ? m('suspendedOn', { date: formatDateTime(organization.suspension.at) }) : ''}${organization.suspension.reason ? m('reason', { reason: organization.suspension.reason }) : ''}${m('suspendedTail')}`} />}
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--at-muted)]">
        <Building2 size={16} className="text-[var(--at-link)]" />
        <Tag color={organization.myRole === 'owner' ? 'blue' : undefined}>{organization.myRole === 'owner' ? m('youOwner') : m('youMember')}</Tag>
        <span>{m('members', { count: organization.memberCount })}</span>
      </div>

      <Tabs
        items={[
          {
            key: 'members', label: m('membersTab'),
            children: <MembersTab organization={organization} userId={user.id}
              onCountChange={memberCount => setOrganization(o => (o ? { ...o, memberCount } : o))}
              onLeft={() => navigate('/organizations', { replace: true })} />,
          },
          { key: 'workspaces', label: m('workspaces'), children: <WorkspacesTab organization={organization} /> },
          ...(owner ? [{ key: 'credentials', label: m('credentials'), children: <CredentialsTab organization={organization} /> }] : []),
          ...(owner ? [{ key: 'ai-cost', label: m('aiCost'), children: <AiCostTab organization={organization} /> }] : []),
        ]}
      />

      <Modal title={m('editOrg')} open={editing} onCancel={() => setEditing(false)} onOk={() => form.submit()} okText={m('save')} confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="name" label={m('name')} rules={[{ validator: (_, v) => { const p = checkOrganizationName(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input maxLength={NAME_MAX} />
          </Form.Item>
          <Form.Item name="description" label={m('description')} rules={[{ validator: (_, v) => { const p = checkDescription(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input.TextArea rows={3} maxLength={DESCRIPTION_MAX} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
