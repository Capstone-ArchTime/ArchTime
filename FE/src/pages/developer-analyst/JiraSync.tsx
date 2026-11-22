import { useEffect, useState, type ReactNode } from 'react';
import { App, Button, Collapse, Form, Input, Modal, Popconfirm, Tooltip } from 'antd';
import type { FormInstance } from 'antd';
import { ExternalLink, PlugZap, RefreshCw } from 'lucide-react';
import { ApiError } from '@/api/client';
import {
  fetchJiraConnection, readJiraUrl, removeJiraConnection, saveJiraConnection, siteLabel, syncJira, type JiraConnection, type JiraConnectionInput,
} from '@/features/jira';
import { importSummary } from '@/features/tasks';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  connect: 'Connect Jira', settings: 'Jira settings', sync: 'Sync from Jira', title: 'Jira Cloud connection',
  syncTip: '{site} · {jql}', never: 'never synced', lastSync: 'last sync {date}',
  site: 'Jira site', email: 'Account e-mail', emailInvalid: 'Enter a valid e-mail.', token: 'API token', jql: 'JQL',
  guide: 'How to fill this in',
  g1: 'Site', g1Body: 'paste the address of any Jira page.',
  g2: 'E-mail', g2Body: 'the one you sign in to Atlassian with.',
  g3: 'API token', g3Body: 'Create API token → Copy (shown once).', g3Link: 'Create a token',
  g4: 'JQL', g4Body: 'usually the whole project (KAN-12 → KAN):',
  tokenKeep: 'Stored token ••••{last4}. Leave empty to keep it.',
  required: 'Required.', saveSync: 'Save and sync', cancel: 'Cancel', disconnect: 'Disconnect',
  disconnectTitle: 'Disconnect Jira?', disconnectBody: 'The stored token is deleted. The tasks synced so far stay.',
  disconnected: 'Jira disconnected.', connected: 'Connected as {account}.', synced: 'Jira: {issues} issues. {summary}',
  failed: 'The Jira request failed.',
}, {
  connect: 'Kết nối Jira', settings: 'Cài đặt Jira', sync: 'Đồng bộ từ Jira', title: 'Kết nối Jira Cloud',
  syncTip: '{site} · {jql}', never: 'chưa đồng bộ', lastSync: 'đồng bộ lần cuối {date}',
  site: 'Site Jira', email: 'E-mail tài khoản', emailInvalid: 'E-mail không hợp lệ.', token: 'API token', jql: 'JQL',
  guide: 'Cách điền',
  g1: 'Site', g1Body: 'dán địa chỉ một trang Jira bất kỳ.',
  g2: 'E-mail', g2Body: 'e-mail bạn đăng nhập Atlassian.',
  g3: 'API token', g3Body: 'Create API token → Copy (chỉ hiện một lần).', g3Link: 'Tạo token',
  g4: 'JQL', g4Body: 'thường là cả project (KAN-12 → KAN):',
  tokenKeep: 'Token đã lưu ••••{last4}. Để trống để giữ nguyên.',
  required: 'Bắt buộc.', saveSync: 'Lưu và đồng bộ', cancel: 'Huỷ', disconnect: 'Ngắt kết nối',
  disconnectTitle: 'Ngắt kết nối Jira?', disconnectBody: 'Token đã lưu sẽ bị xoá. Các task đã đồng bộ vẫn giữ nguyên.',
  disconnected: 'Đã ngắt kết nối Jira.', connected: 'Đã kết nối với tài khoản {account}.', synced: 'Jira: {issues} issue. {summary}',
  failed: 'Yêu cầu tới Jira thất bại.',
});

const TOKEN_PAGE = 'https://id.atlassian.com/manage-profile/security/api-tokens';

/** Where each value of the form comes from, step by step. A JQL example fills the JQL field when clicked. */
function JiraGuide({ form, projectKey, expanded }: { form: FormInstance<JiraConnectionInput>; projectKey: string; expanded: boolean }) {
  const m = useMessages(MSG);
  const examples = [`project = ${projectKey}`, `project = ${projectKey} AND issuetype != Epic`];
  const step = (n: number, title: string, body: string, extra?: ReactNode) => <li className="break-words">
    <span className="font-semibold">{n}. {title}:</span> <span className="text-[var(--at-muted)]">{body}</span> {extra}
  </li>;
  return <Collapse size="small" className="!mb-4" defaultActiveKey={expanded ? ['guide'] : []} items={[{
    key: 'guide', label: m('guide'),
    children: <ol className="space-y-1.5 text-sm">
        {step(1, m('g1'), m('g1Body'))}
        {step(2, m('g2'), m('g2Body'))}
        {step(3, m('g3'), m('g3Body'), <a href={TOKEN_PAGE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--at-link)] whitespace-nowrap">
          {m('g3Link')} <ExternalLink size={12} />
        </a>)}
        {step(4, m('g4'), m('g4Body'), <span className="inline-flex flex-wrap gap-1.5 align-middle">
          {examples.map(jql => <Button key={jql} size="small" type="dashed" onClick={() => form.setFieldValue('jql', jql)}><code>{jql}</code></Button>)}
        </span>)}
    </ol>,
  }]} />;
}

/** The project key a JQL names first ("project = KAN …" → KAN), for the examples of the guide. */
const keyOfJql = (jql: string) => /project\s*(?:=|in\s*\()\s*"?([A-Za-z][A-Za-z0-9_]*)/i.exec(jql)?.[1]?.toUpperCase() ?? null;

/** Buttons of the Tasks & Sprints toolbar for maintainers: connect Jira Cloud, change the connection, sync now. */
export default function JiraSync({ project, onSynced }: { project: string; onSynced: () => void }) {
  const { message } = App.useApp();
  const m = useMessages(MSG);
  const [form] = Form.useForm<JiraConnectionInput>();
  const [connection, setConnection] = useState<JiraConnection | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [projectKey, setProjectKey] = useState('KAN');

  useEffect(() => {
    const controller = new AbortController();
    setConnection(undefined);
    fetchJiraConnection(project, controller.signal).then(setConnection).catch(() => { if (!controller.signal.aborted) setConnection(null); });
    return () => controller.abort();
  }, [project]);

  const failure = (cause: unknown) => (cause instanceof Error ? cause.message : m('failed'));

  async function sync() {
    setSyncing(true);
    try {
      const r = await syncJira(project);
      message.success(m('synced', { issues: r.issues, summary: importSummary(r) }), 6);
      setConnection(c => (c ? { ...c, lastSyncAt: new Date().toISOString() } : c));
      onSynced();
    } catch (cause) {
      message.error(failure(cause), 8);
    } finally { setSyncing(false); }
  }

  async function save(values: JiraConnectionInput) {
    setSaving(true);
    try {
      const saved = await saveJiraConnection(project, values);
      setConnection(saved);
      setEditing(false);
      message.success(m('connected', { account: saved.account }));
    } catch (cause) {
      // Field problems go next to their field; Jira's refusals (token, site) above the form.
      if (cause instanceof ApiError && cause.fields) {
        form.setFields(Object.entries(cause.fields).filter(([name]) => ['site', 'email', 'token', 'jql'].includes(name))
          .map(([name, error]) => ({ name: name as keyof JiraConnectionInput, errors: [error === 'required' ? m('required') : error] })));
      }
      message.error(failure(cause), 8);
      return;
    } finally { setSaving(false); }
    await sync();
  }

  async function disconnect() {
    try {
      await removeJiraConnection(project);
      setConnection(null);
      setEditing(false);
      message.success(m('disconnected'));
    } catch (cause) { message.error(failure(cause)); }
  }

  /** A pasted or typed Jira address keeps only the site; a project in it fills an empty JQL. True when it was one. */
  function applyJiraAddress(text: string): boolean {
    const { site, projectKey: key } = readJiraUrl(text);
    if (!site) return false;
    form.setFieldValue('site', site);
    if (key) {
      setProjectKey(key);
      if (!String(form.getFieldValue('jql') ?? '').trim()) form.setFieldValue('jql', `project = ${key}`);
    }
    return true;
  }

  function open() {
    setProjectKey((connection && keyOfJql(connection.jql)) || 'KAN');
    form.resetFields();
    form.setFieldsValue(connection ? { site: siteLabel(connection.site), email: connection.email, jql: connection.jql, token: '' } : { site: '', email: '', jql: '', token: '' });
    setEditing(true);
  }

  if (connection === undefined) return null;
  const required = [{ required: true, whitespace: true, message: m('required') }];

  return <>
    {connection
      ? <>
        <Button icon={<PlugZap size={14} />} onClick={open}>{m('settings')}</Button>
        <Tooltip title={<>{m('syncTip', { site: siteLabel(connection.site), jql: connection.jql })}<br />{connection.lastSyncAt ? m('lastSync', { date: formatDateTime(connection.lastSyncAt) }) : m('never')}</>}>
          <Button type="primary" icon={<RefreshCw size={14} />} loading={syncing} onClick={sync}>{m('sync')}</Button>
        </Tooltip>
      </>
      : <Button icon={<PlugZap size={14} />} onClick={open}>{m('connect')}</Button>}

    <Modal title={m('title')} open={editing} onCancel={() => setEditing(false)} destroyOnHidden
      footer={<div className="flex flex-wrap justify-between gap-2">
        <span>{connection && <Popconfirm title={m('disconnectTitle')} description={<p className="max-w-xs">{m('disconnectBody')}</p>}
          okText={m('disconnect')} cancelText={m('cancel')} okButtonProps={{ danger: true }} onConfirm={disconnect}>
          <Button danger>{m('disconnect')}</Button>
        </Popconfirm>}</span>
        <span className="flex gap-2">
          <Button onClick={() => setEditing(false)}>{m('cancel')}</Button>
          <Button type="primary" loading={saving || syncing} onClick={() => form.submit()}>{m('saveSync')}</Button>
        </span>
      </div>}>
      <JiraGuide form={form} projectKey={projectKey} expanded={!connection} />
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Form.Item name="site" label={m('site')} rules={required}>
          <Input placeholder="your-team.atlassian.net" maxLength={300} autoFocus
            onPaste={e => { if (applyJiraAddress(e.clipboardData.getData('text'))) e.preventDefault(); }}
            onBlur={e => applyJiraAddress(e.target.value)} />
        </Form.Item>
        <Form.Item name="email" label={m('email')} rules={[...required, { type: 'email', message: m('emailInvalid') }]}>
          <Input type="email" autoComplete="email" maxLength={254} />
        </Form.Item>
        <Form.Item name="token" label={m('token')} extra={connection ? m('tokenKeep', { last4: connection.tokenLast4 }) : undefined} rules={connection ? [] : required}>
          <Input.Password autoComplete="new-password" maxLength={1000} placeholder={connection ? `••••${connection.tokenLast4}` : 'ATATT…'} />
        </Form.Item>
        <Form.Item name="jql" label={m('jql')} rules={required}>
          <Input.TextArea rows={2} maxLength={2000} placeholder="project = SCRUM ORDER BY key" />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
