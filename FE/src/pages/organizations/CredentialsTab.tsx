import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Skeleton, Tag, Tooltip } from 'antd';
import { KeyRound, Plus } from 'lucide-react';
import { featurePanel } from '@/components/FeaturePage';
import {
  CREDENTIAL_NAME_MAX, PROVIDERS, TOKEN_MAX, checkCredentialName, checkToken, createCredential, deleteCredential, listCredentials, rotateCredential,
} from '@/features/organizations-api';
import type { Credential, CredentialProvider, Organization } from '@/features/organizations-api';

const providerLabel = (p: CredentialProvider) => PROVIDERS.find(x => x.value === p)?.label ?? 'Other';
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);
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

  useEffect(() => {
    const controller = new AbortController();
    listCredentials(organization.id, controller.signal)
      .then(list => setCredentials([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the credentials.'); });
    return () => controller.abort();
  }, [organization.id, attempt]);

  async function create(values: { name: string; provider: CredentialProvider; token: string }) {
    setSaving(true);
    try {
      const created = await createCredential(organization.id, { name: values.name.trim(), provider: values.provider, token: values.token.trim() });
      setCredentials(list => [...(list ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreating(false);
      createForm.resetFields();
      message.success(`Credential "${created.name}" saved. Its token cannot be shown again.`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not save the credential.');
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
      message.success(`Token of "${updated.name}" replaced. Workspaces using it pick it up on their next job.`);
      setRotating(null);
      rotateForm.resetFields();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not replace the token.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(credential: Credential) {
    setBusy(credential.id);
    try {
      await deleteCredential(organization.id, credential.id);
      setCredentials(list => (list ?? []).filter(c => c.id !== credential.id));
      message.success(`Credential "${credential.name}" deleted.`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not delete the credential.');
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => { setError(null); setCredentials(null); setAttempt(a => a + 1); }}>Retry</Button>} />;
  if (!credentials) return <Skeleton active paragraph={{ rows: 3 }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[#94a3b8]">Tokens the organization's workspaces clone private repositories with, so nobody has to use a personal token. Only owners see this list.</p>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Add credential</Button>
      </div>

      {!credentials.length ? <div className={featurePanel}><Empty description="No credentials yet. Add one to clone the organization's private repositories." /></div> : (
        <ul className={`${featurePanel} divide-y divide-[#242527]`} aria-label="Credentials">
          {credentials.map(c => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium break-words"><KeyRound size={14} className="text-[#93c5fd] shrink-0" />{c.name} <Tag>{providerLabel(c.provider)}</Tag></p>
                <p className="text-xs text-[#94a3b8]">
                  <span className="font-mono">••••{c.last4}</span>
                  {` · used by ${c.usedBy} ${c.usedBy === 1 ? 'workspace' : 'workspaces'}`}
                  {c.rotatedAt && ` · token replaced ${when(c.rotatedAt)}`}
                  {c.lastUsedAt && ` · last used ${when(c.lastUsedAt)}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="small" onClick={() => { rotateForm.resetFields(); setRotating(c); }}>Replace token</Button>
                {c.usedBy > 0 ? (
                  <Tooltip title="Workspaces still clone with it. Replace its token instead, or move those workspaces to another credential first.">
                    <Button size="small" danger disabled>Delete</Button>
                  </Tooltip>
                ) : (
                  <Popconfirm title={`Delete "${c.name}"?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(c)}>
                    <Button size="small" danger loading={busy === c.id}>Delete</Button>
                  </Popconfirm>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal title="Add credential" open={creating} onCancel={() => setCreating(false)} onOk={() => createForm.submit()} okText="Save" confirmLoading={saving} destroyOnHidden>
        <Form form={createForm} layout="vertical" onFinish={create} initialValues={{ provider: 'github' }} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ validator: (_, v) => { const p = checkCredentialName(v ?? ''); return p ? Promise.reject(new Error(p)) : Promise.resolve(); } }]}>
            <Input maxLength={CREDENTIAL_NAME_MAX} placeholder="e.g. GitHub read-only bot" autoFocus />
          </Form.Item>
          <Form.Item name="provider" label="Provider"><Select options={PROVIDERS} /></Form.Item>
          <Form.Item name="token" label="Access token" rules={[tokenRule]} extra="A read-only token is enough. It is stored encrypted and never shown again.">
            <Input.Password maxLength={TOKEN_MAX} autoComplete="new-password" placeholder="ghp_…" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={rotating ? `Replace the token of "${rotating.name}"` : ''} open={!!rotating} onCancel={() => setRotating(null)} onOk={() => rotateForm.submit()} okText="Replace" confirmLoading={saving} destroyOnHidden>
        <Form form={rotateForm} layout="vertical" onFinish={rotate} requiredMark={false}>
          <Form.Item name="token" label="New access token" rules={[tokenRule]} extra="Workspaces using this credential clone with the new token from their next job on.">
            <Input.Password maxLength={TOKEN_MAX} autoComplete="new-password" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
