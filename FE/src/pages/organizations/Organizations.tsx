import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Empty, Form, Input, Modal, Skeleton, Tag } from 'antd';
import { Building2, Plus } from 'lucide-react';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { DESCRIPTION_MAX, NAME_MAX, answerInvitation, checkDescription, checkOrganizationName, createOrganization, listMyInvitations, listOrganizations } from '@/features/organizations-api';
import type { Organization, OrganizationInvitation } from '@/features/organizations-api';
import { message as translate, useMessages } from '@/i18n/define';
import { ORG } from './messages';

/** The organizations the signed-in account belongs to, and a way to start one. */
export default function Organizations() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string; description?: string }>();
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const m = useMessages(ORG);

  useEffect(() => {
    const controller = new AbortController();
    listOrganizations(controller.signal)
      .then(list => setOrganizations([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(ORG, 'loadListFailed')); });
    listMyInvitations(controller.signal).then(setInvitations).catch(() => { /* the list of organizations still shows */ });
    return () => controller.abort();
  }, [attempt]);

  async function answer(invitation: OrganizationInvitation, accept: boolean) {
    setAnswering(invitation.organizationId);
    try {
      await answerInvitation(invitation.organizationId, accept);
      message.success(m(accept ? 'joined' : 'declined', { name: invitation.organizationName }));
      setInvitations(list => list.filter(i => i.organizationId !== invitation.organizationId));
      if (accept) setAttempt(a => a + 1);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('answerFailed'));
    } finally {
      setAnswering(null);
    }
  }

  async function create(values: { name: string; description?: string }) {
    setSaving(true);
    try {
      const org = await createOrganization({ name: values.name.trim(), description: values.description?.trim() || undefined });
      message.success(m('created', { name: org.name }));
      setCreating(false);
      form.resetFields();
      navigate(`/organizations/${encodeURIComponent(org.id)}`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('createFailed'));
    } finally {
      setSaving(false);
    }
  }

  const retry = () => { setError(null); setOrganizations(null); setAttempt(a => a + 1); };

  return (
    <FeaturePage
      title={m('title')}
      description={m('intro')}
      details={<p>{m('details')}</p>}
      demo={false}
      actions={<Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>{m('newOrg')}</Button>}
    >
      {invitations.length > 0 && (
        <ul className={`${featurePanel} mb-4 divide-y divide-[var(--at-line)]`} aria-label={m('invitations')}>
          {invitations.map(i => (
            <li key={i.organizationId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{m('invitationTo', { name: i.organizationName })}</p>
                <p className="text-xs text-[var(--at-muted)]">{m(i.role === 'owner' ? 'asOwner' : 'asMember')}{i.invitedBy ? m('from', { name: i.invitedBy }) : ''}{m('acceptNote')}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="primary" size="small" loading={answering === i.organizationId} onClick={() => answer(i, true)}>{m('accept')}</Button>
                <Button size="small" disabled={answering === i.organizationId} onClick={() => answer(i, false)}>{m('decline')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error ? <Alert type="error" showIcon title={error} action={<Button size="small" onClick={retry}>{m('retry')}</Button>} />
        : !organizations ? <Skeleton active paragraph={{ rows: 3 }} />
        : !organizations.length ? (
          <div className={featurePanel}>
            <Empty description={m('noOrgs')}>
              <Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>{m('newOrg')}</Button>
            </Empty>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {organizations.map(o => (
              <Link key={o.id} to={`/organizations/${encodeURIComponent(o.id)}`} className={`${featurePanel} block hover:border-[var(--at-accent)]/60 transition-colors`} aria-label={o.name}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-semibold break-words"><Building2 size={16} className="text-[var(--at-link)] shrink-0" />{o.name}</h3>
                  <span className="flex gap-1 shrink-0">
                    {o.suspension && <Tag color="red">{m('suspended')}</Tag>}
                    <Tag color={o.myRole === 'owner' ? 'blue' : undefined}>{o.myRole === 'owner' ? m('owner') : m('member')}</Tag>
                  </span>
                </div>
                {o.description && <p className="mt-2 text-sm text-[var(--at-muted)] line-clamp-2">{o.description}</p>}
                <p className="mt-3 text-xs text-[var(--at-muted)]">{m('members', { count: o.memberCount })}</p>
              </Link>
            ))}
          </div>
        )}

      <Modal title={m('newOrg')} open={creating} onCancel={() => setCreating(false)} onOk={() => form.submit()} okText={m('create')} confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={create} requiredMark={false}>
          <Form.Item name="name" label={m('name')} rules={[{ validator: (_, v) => { const p = checkOrganizationName(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input maxLength={NAME_MAX} placeholder={m('namePlaceholder')} autoFocus />
          </Form.Item>
          <Form.Item name="description" label={m('descriptionOptional')} rules={[{ validator: (_, v) => { const p = checkDescription(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input.TextArea rows={3} maxLength={DESCRIPTION_MAX} showCount placeholder={m('descriptionPlaceholder')} />
          </Form.Item>
          <p className="text-xs text-[var(--at-muted)]">{m('ownerNote')}</p>
        </Form>
      </Modal>
    </FeaturePage>
  );
}
