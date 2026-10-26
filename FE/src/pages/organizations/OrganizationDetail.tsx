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

type OrgWorkspace = { id: string; name: string; userRole: string; status: string };
const ROLE_LABELS: Record<string, string> = { owner: 'Owner', 'project-maintainer': 'Maintainer', 'developer-analyst': 'Member', viewer: 'Viewer' };

/** The organization's workspaces the account can open (owners: all of them; members: the ones they have a role in). */
function WorkspacesTab({ organization }: { organization: Organization }) {
  const [list, setList] = useState<OrgWorkspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ data?: { projects?: any[] } }>('/projects?scope=all&limit=100', { signal: controller.signal })
      .then(body => setList((body?.data?.projects ?? []).filter(p => p.organizationId === organization.id)
        .map(p => ({ id: String(p.id), name: String(p.name ?? ''), userRole: String(p.userRole ?? 'viewer'), status: String(p.status ?? '') }))
        .sort((a, b) => a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the workspaces.'); });
    return () => controller.abort();
  }, [organization.id]);

  if (error) return <Alert type="error" showIcon title={error} />;
  if (!list) return <Skeleton active paragraph={{ rows: 2 }} />;
  const hint = organization.myRole === 'owner'
    ? 'Add a workspace to this organization from Workspaces, choosing it as the space.'
    : 'Members see the workspaces an owner or maintainer gives them a role in.';
  if (!list.length) return <div className={featurePanel}><Empty description={`No workspaces you can open yet. ${hint}`} /></div>;
  return (
    <div className="space-y-2">
      <ul className={`${featurePanel} divide-y divide-[#242527]`} aria-label="Workspaces">
        {list.map(w => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link to={`/workspace/${encodeURIComponent(w.id)}`} className="font-medium hover:text-[#3b82f6] break-words">{w.name}</Link>
            <Tag>{ROLE_LABELS[w.userRole] ?? w.userRole}</Tag>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[#94a3b8]">{hint}</p>
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

  useEffect(() => {
    const controller = new AbortController();
    getOrganization(orgId, controller.signal)
      .then(setOrganization)
      .catch(cause => {
        if (controller.signal.aborted) return;
        const missing = cause instanceof ApiError && (cause.status === 404 || cause.status === 403);
        setError({ text: missing ? 'This organization does not exist, or you are not a member of it.' : cause instanceof Error ? cause.message : 'Could not load the organization.', missing });
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
      message.success('Organization updated.');
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not save the organization.');
    } finally {
      setSaving(false);
    }
  }

  const back = <Link to="/organizations" className="inline-flex items-center gap-1 text-sm text-[#94a3b8] hover:text-[#3b82f6]"><ArrowLeft size={14} />All organizations</Link>;

  if (error || !organization || !user) {
    return (
      <FeaturePage title="Organization" description="Members, workspaces and repository credentials." demo={false} actions={back}>
        {error ? <Alert type="error" showIcon title={error.text} action={!error.missing && <Button size="small" onClick={() => { setError(null); setAttempt(a => a + 1); }}>Retry</Button>} />
          : <Skeleton active paragraph={{ rows: 4 }} />}
      </FeaturePage>
    );
  }

  const owner = organization.myRole === 'owner';
  return (
    <FeaturePage
      title={organization.name}
      description={organization.description || (owner ? 'No description yet.' : 'An organization you belong to.')}
      demo={false}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {back}
          {owner && <Button icon={<Pencil size={14} />} onClick={() => { form.setFieldsValue({ name: organization.name, description: organization.description }); setEditing(true); }}>Edit</Button>}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#94a3b8]">
        <Building2 size={16} className="text-[#3b82f6]" />
        <Tag color={owner ? 'blue' : undefined}>{owner ? 'You are an owner' : 'You are a member'}</Tag>
        <span>{organization.memberCount} {organization.memberCount === 1 ? 'member' : 'members'}</span>
      </div>

      <Tabs
        items={[
          {
            key: 'members', label: 'Members',
            children: <MembersTab organization={organization} userId={user.id}
              onCountChange={memberCount => setOrganization(o => (o ? { ...o, memberCount } : o))}
              onLeft={() => navigate('/organizations', { replace: true })} />,
          },
          { key: 'workspaces', label: 'Workspaces', children: <WorkspacesTab organization={organization} /> },
          ...(owner ? [{ key: 'credentials', label: 'Credentials', children: <CredentialsTab organization={organization} /> }] : []),
        ]}
      />

      <Modal title="Edit organization" open={editing} onCancel={() => setEditing(false)} onOk={() => form.submit()} okText="Save" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ validator: (_, v) => { const p = checkOrganizationName(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input maxLength={NAME_MAX} />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ validator: (_, v) => { const p = checkDescription(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input.TextArea rows={3} maxLength={DESCRIPTION_MAX} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
