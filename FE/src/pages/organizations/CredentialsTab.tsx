import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Skeleton, Tag, Tooltip } from 'antd';
import { KeyRound, Plus } from 'lucide-react';
import { featurePanel } from '@/components/FeaturePage';
import {
  CREDENTIAL_NAME_MAX, PROVIDERS, TOKEN_MAX, checkCredentialName, checkToken, createCredential, deleteCredential, listCredentials, rotateCredential,
} from '@/features/organizations-api';
import type { Credential, CredentialProvider, Organization } from '@/features/organizations-api';
import { formatDate } from '@/i18n/format';
import { message as translate, useMessages } from '@/i18n/define';
import { ORG } from './messages';

const providerLabel = (p: CredentialProvider) => PROVIDERS.find(x => x.value === p)?.label ?? translate(ORG, 'other');
const when = (iso: string | null) => (iso ? formatDate(iso) : '');
const tokenRule = { validator: (_: unknown, v?: string) => { const p = checkToken(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } };

/**
 * Repository credentials of an organization (owners only). A token is sent once and never shown again: the list keeps
 * only its last four characters. A credential still used by a workspace cannot be deleted; rotate its token instead.
 */
export default function CredentialsTab({ organization }: { organization: Organization }) {
  const { message } = App.useApp();
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [rotating, setRotating] = useState<Credential | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [createForm] = Form.useForm<{ name: string; provider: CredentialProvider; token: string }>();
  const [rotateForm] = Form.useForm<{ token: string }>();
  const m = useMessages(ORG);

  useEffect(() => {
    const controller = new AbortController();
    listCredentials(organization.id, controller.signal)
      .then(list => setCredentials([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(ORG, 'credentialsFailed')); });
    return () => controller.abort();
  }, [organization.id, attempt]);

  async function create(values: { name: string; provider: CredentialProvider; token: string }) {
    setSaving(true);
    try {
      const created = await createCredential(organization.id, { name: values.name.trim(), provider: values.provider, token: values.token.trim() });
      setCredentials(list => [...(list ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreating(false);
      createForm.resetFields();
      message.success(m('credentialSaved', { name: created.name }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('credentialSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function rotate(values: { token: string }) {
    if (!rotating) return;
    setSaving(true);
    try {
      const updated = await rotateCredential(organization.id, rotating.id, values.token.trim());
      setCredentials(list => (list ?? []).map(c => (c.id === updated.id ? { ...updated, usedBy: c.usedBy } : c)));
      message.success(m('tokenReplaced', { name: updated.name }));
      setRotating(null);
      rotateForm.resetFields();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('replaceFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(credential: Credential) {
    setBusy(credential.id);
    try {
      await deleteCredential(organization.id, credential.id);
      setCredentials(list => (list ?? []).filter(c => c.id !== credential.id));
      message.success(m('credentialDeleted', { name: credential.name }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('deleteFailed'));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => { setError(null); setCredentials(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />;
  if (!credentials) return <Skeleton active paragraph={{ rows: 3 }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--at-muted)]">{m('credentialsIntro')}</p>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>{m('addCredential')}</Button>
      </div>

      {!credentials.length ? <div className={featurePanel}><Empty description={m('noCredentials')} /></div> : (
        <ul className={`${featurePanel} divide-y divide-[var(--at-line)]`} aria-label={m('credentials')}>
          {credentials.map(c => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium break-words"><KeyRound size={14} className="text-[var(--at-link)] shrink-0" />{c.name} <Tag>{providerLabel(c.provider)}</Tag></p>
                <p className="text-xs text-[var(--at-muted)]">
                  <span className="font-mono">••••{c.last4}</span>
                  {m('usedBy', { count: c.usedBy })}
                  {c.rotatedAt && m('replacedOn', { date: when(c.rotatedAt) })}
                  {c.lastUsedAt && m('lastUsed', { date: when(c.lastUsedAt) })}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="small" onClick={() => { rotateForm.resetFields(); setRotating(c); }}>{m('replaceToken')}</Button>
                {c.usedBy > 0 ? (
                  <Tooltip title={m('stillUsed')}>
                    <Button size="small" danger disabled>{m('delete')}</Button>
                  </Tooltip>
                ) : (
                  <Popconfirm title={m('deleteTitle', { name: c.name })} okText={m('delete')} okButtonProps={{ danger: true }} onConfirm={() => remove(c)}>
                    <Button size="small" danger loading={busy === c.id}>{m('delete')}</Button>
                  </Popconfirm>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal title={m('addCredential')} open={creating} onCancel={() => setCreating(false)} onOk={() => createForm.submit()} okText={m('save')} confirmLoading={saving} destroyOnHidden>
        <Form form={createForm} layout="vertical" onFinish={create} initialValues={{ provider: 'github' }} requiredMark={false}>
          <Form.Item name="name" label={m('name')} rules={[{ validator: (_, v) => { const p = checkCredentialName(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input maxLength={CREDENTIAL_NAME_MAX} placeholder={m('credentialPlaceholder')} autoFocus />
          </Form.Item>
          <Form.Item name="provider" label={m('provider')}><Select options={PROVIDERS} /></Form.Item>
          <Form.Item name="token" label={m('accessToken')} rules={[tokenRule]} extra={m('tokenExtra')}>
            <Input.Password maxLength={TOKEN_MAX} autoComplete="new-password" placeholder="ghp_…" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={rotating ? m('replaceTitle', { name: rotating.name }) : ''} open={!!rotating} onCancel={() => setRotating(null)} onOk={() => rotateForm.submit()} okText={m('replace')} confirmLoading={saving} destroyOnHidden>
        <Form form={rotateForm} layout="vertical" onFinish={rotate} requiredMark={false}>
          <Form.Item name="token" label={m('newToken')} rules={[tokenRule]} extra={m('newTokenExtra')}>
            <Input.Password maxLength={TOKEN_MAX} autoComplete="new-password" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
