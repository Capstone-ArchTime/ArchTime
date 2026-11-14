import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Spin, Tag, Typography } from 'antd';
import { Download, KeyRound, Plus } from 'lucide-react';
import { WorkspacePage } from './workspace';
import { panel } from './workspace-store';
import {
  DEFAULT_EXPIRY, EXPIRY_CHOICES, STATUS_LABEL, contextCommand, createToken, downloadAgentsMd, listTokens, revokeToken, sortTokens,
} from '@/features/agent-access';
import type { AgentToken } from '@/features/agent-access';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

function Access({ project }: { project: string }) {
  const { message } = App.useApp();
  const [tokens, setTokens] = useState<AgentToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<{ token: string; name: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [mdProblem, setMdProblem] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [form] = Form.useForm<{ name: string; expiresInDays: number }>();

  useEffect(() => {
    const controller = new AbortController();
    listTokens(project, controller.signal)
      .then(list => { setTokens(sortTokens(list)); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the tokens.'); });
    return () => controller.abort();
  }, [project, revision]);

  async function create(values: { name: string; expiresInDays: number }) {
    setSaving(true);
    try {
      const { token, record } = await createToken(project, values.name.trim(), values.expiresInDays);
      setTokens(list => sortTokens([record, ...(list ?? [])]));
      setCreating(false); form.resetFields();
      setShown({ token, name: record.name });
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not create the token.');
    } finally { setSaving(false); }
  }

  async function revoke(token: AgentToken) {
    try {
      const revoked = await revokeToken(project, token.id);
      setTokens(list => sortTokens((list ?? []).map(t => (t.id === revoked.id ? revoked : t))));
      message.success(`"${token.name}" was revoked. Agents using it are refused from now on.`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not revoke the token.');
    }
  }

  async function download() {
    setDownloading(true);
    try {
      const { blob, filename } = await downloadAgentsMd(project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMdProblem(null);
    } catch (cause) {
      setMdProblem(cause instanceof Error ? cause.message : 'Could not generate AGENTS.md.');
    } finally { setDownloading(false); }
  }

  return <div className="space-y-5">
    <section className={`${panel} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold">AGENTS.md</h3>
          <p className="text-sm text-[var(--at-muted)] mt-1">Architecture rules for coding agents, generated from the confirmed component diagram: components and their paths, allowed dependencies, rules, design decisions and the commit convention. Put it at the root of the repository; download it again after the diagram changes.</p>
        </div>
        <Button type="primary" icon={<Download size={14} />} loading={downloading} onClick={download}>Download AGENTS.md</Button>
      </div>
      {mdProblem && <Alert type="warning" showIcon title={mdProblem} />}
    </section>

    <section className={`${panel} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold">Project tokens</h3>
          <p className="text-sm text-[var(--at-muted)] mt-1">A token lets an agent read this workspace's architecture context: never its source code, and nothing else of ArchTime. A token is shown once, lasts at most 90 days and can be revoked at any time.</p>
        </div>
        <Button icon={<Plus size={14} />} onClick={() => { form.setFieldsValue({ name: '', expiresInDays: DEFAULT_EXPIRY }); setCreating(true); }}>New token</Button>
      </div>
      {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setRevision(v => v + 1)}>Retry</Button>} />}
      {tokens === null && !error
        ? <div className="py-8 flex justify-center"><Spin /></div>
        : tokens && !tokens.length
          ? <Empty description="No tokens yet. Create one for each agent or machine, so you can revoke them one by one." />
          : tokens && <ul className="divide-y divide-[var(--at-line)]" aria-label="Project tokens">
            {tokens.map(t => <li key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm break-words"><KeyRound size={13} className="inline mr-1 align-[-2px]" aria-hidden="true" />{t.name} <Tag color={STATUS_LABEL[t.status].color}>{STATUS_LABEL[t.status].label}</Tag></p>
                <p className="text-xs text-[var(--at-muted)] mt-1"><code>{t.prefix}…</code> · created {day(t.createdAt)} · {t.status === 'revoked' ? `revoked ${day(t.revokedAt)}` : `expires ${day(t.expiresAt)}`} · last used {day(t.lastUsedAt)}</p>
              </div>
              {t.status === 'active' && <Popconfirm title={`Revoke "${t.name}"?`} description="Agents using it are refused from their next request." okText="Revoke" okButtonProps={{ danger: true }} onConfirm={() => revoke(t)}>
                <Button size="small" danger>Revoke</Button>
              </Popconfirm>}
            </li>)}
          </ul>}
    </section>

    <section className={`${panel} space-y-2`}>
      <h3 className="text-lg font-semibold">How an agent asks</h3>
      <p className="text-sm text-[var(--at-muted)]">Before changing a file, the agent asks which component it belongs to, which components it may and may not depend on, the design decisions about it and the commit convention.</p>
      <Typography.Paragraph copyable={{ text: contextCommand() }} className="!mb-0"><code className="break-all text-xs">{contextCommand()}</code></Typography.Paragraph>
    </section>

    <Modal title="New project token" open={creating} okText="Create token" confirmLoading={saving} onOk={() => form.submit()} onCancel={() => setCreating(false)}>
      <Form form={form} layout="vertical" onFinish={create} initialValues={{ expiresInDays: DEFAULT_EXPIRY }}>
        <Form.Item name="name" label="Name" extra="Who uses it, e.g. Claude Code on my laptop, or CI pipeline." rules={[{ required: true, whitespace: true, max: 80 }]}><Input maxLength={80} /></Form.Item>
        <Form.Item name="expiresInDays" label="Expires after"><Select options={EXPIRY_CHOICES.map(d => ({ value: d, label: `${d} days` }))} /></Form.Item>
      </Form>
    </Modal>

    <Modal title={`Token "${shown?.name ?? ''}" created`} open={shown !== null} closable={false} mask={{ closable: false }} keyboard={false} destroyOnHidden
      footer={<Button type="primary" onClick={() => setShown(null)}>I have copied it</Button>}>
      <Alert type="warning" showIcon title="Copy it now: it is not shown again. ArchTime keeps only a fingerprint of it." className="!mb-3" />
      <Typography.Paragraph copyable={{ text: shown?.token ?? '' }}><code className="break-all">{shown?.token}</code></Typography.Paragraph>
      <p className="text-xs text-[var(--at-muted)]">Give it to the agent as the ARCHTIME_AGENT_TOKEN environment variable; do not commit it.</p>
    </Modal>
  </div>;
}

export default function AgentAccess() {
  return <WorkspacePage title="Agent Access" description="Let coding agents follow this workspace's architecture: tokens for the context API and an AGENTS.md generated from the confirmed diagram.">
    {project => <Access key={project} project={project} />}
  </WorkspacePage>;
}
