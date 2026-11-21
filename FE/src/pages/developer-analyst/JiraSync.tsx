import { useEffect, useState } from 'react';
import { App, Button, Form, Input, Modal, Popconfirm, Tooltip } from 'antd';
import { PlugZap, RefreshCw } from 'lucide-react';
import { ApiError } from '@/api/client';
import {
  fetchJiraConnection, removeJiraConnection, saveJiraConnection, siteLabel, syncJira, type JiraConnection, type JiraConnectionInput,
} from '@/features/jira';
import { importSummary } from '@/features/tasks';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  connect: 'Connect Jira', settings: 'Jira settings', sync: 'Sync from Jira', title: 'Jira Cloud connection',
  syncTip: '{site} · {jql}', never: 'never synced', lastSync: 'last sync {date}',
  site: 'Jira site', siteExtra: 'Your Jira Cloud address, such as your-team.atlassian.net.',
  email: 'Account e-mail', emailExtra: 'The e-mail of the Jira account the API token belongs to.',
  token: 'API token', tokenExtra: 'Create one at id.atlassian.com → Security → API tokens. It is stored encrypted.',
  tokenKeep: 'Stored token ••••{last4}. Leave empty to keep it.',
  jql: 'JQL', jqlExtra: 'Which issues to read, such as project = SCRUM. Issues no longer matched are marked removed at the next sync.',
  required: 'Required.', saveSync: 'Save and sync', cancel: 'Cancel', disconnect: 'Disconnect',
  disconnectTitle: 'Disconnect Jira?', disconnectBody: 'The stored token is deleted. The tasks synced so far stay.',
  disconnected: 'Jira disconnected.', connected: 'Connected as {account}.', synced: 'Jira: {issues} issues. {summary}',
  failed: 'The Jira request failed.',
}, {
  connect: 'Kết nối Jira', settings: 'Cài đặt Jira', sync: 'Đồng bộ từ Jira', title: 'Kết nối Jira Cloud',
  syncTip: '{site} · {jql}', never: 'chưa đồng bộ', lastSync: 'đồng bộ lần cuối {date}',
  site: 'Site Jira', siteExtra: 'Địa chỉ Jira Cloud của bạn, ví dụ your-team.atlassian.net.',
  email: 'E-mail tài khoản', emailExtra: 'E-mail của tài khoản Jira sở hữu API token.',
  token: 'API token', tokenExtra: 'Tạo tại id.atlassian.com → Security → API tokens. Token được lưu đã mã hoá.',
  tokenKeep: 'Token đã lưu ••••{last4}. Để trống để giữ nguyên.',
  jql: 'JQL', jqlExtra: 'Issue nào được đọc, ví dụ project = SCRUM. Issue không còn khớp sẽ được đánh dấu đã xoá ở lần đồng bộ sau.',
  required: 'Bắt buộc.', saveSync: 'Lưu và đồng bộ', cancel: 'Huỷ', disconnect: 'Ngắt kết nối',
  disconnectTitle: 'Ngắt kết nối Jira?', disconnectBody: 'Token đã lưu sẽ bị xoá. Các task đã đồng bộ vẫn giữ nguyên.',
  disconnected: 'Đã ngắt kết nối Jira.', connected: 'Đã kết nối với tài khoản {account}.', synced: 'Jira: {issues} issue. {summary}',
  failed: 'Yêu cầu tới Jira thất bại.',
});

/** Buttons of the Tasks & Sprints toolbar for maintainers: connect Jira Cloud, change the connection, sync now. */
export default function JiraSync({ project, onSynced }: { project: string; onSynced: () => void }) {
  const { message } = App.useApp();
  const m = useMessages(MSG);
  const [form] = Form.useForm<JiraConnectionInput>();
  const [connection, setConnection] = useState<JiraConnection | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  function open() {
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
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Form.Item name="site" label={m('site')} extra={m('siteExtra')} rules={required}>
          <Input placeholder="your-team.atlassian.net" maxLength={300} autoFocus />
        </Form.Item>
        <Form.Item name="email" label={m('email')} extra={m('emailExtra')} rules={[...required, { type: 'email', message: m('emailExtra') }]}>
          <Input type="email" autoComplete="email" maxLength={254} />
        </Form.Item>
        <Form.Item name="token" label={m('token')} extra={connection ? m('tokenKeep', { last4: connection.tokenLast4 }) : m('tokenExtra')} rules={connection ? [] : required}>
          <Input.Password autoComplete="new-password" maxLength={1000} placeholder={connection ? `••••${connection.tokenLast4}` : 'ATATT…'} />
        </Form.Item>
        <Form.Item name="jql" label={m('jql')} extra={m('jqlExtra')} rules={required}>
          <Input.TextArea rows={2} maxLength={2000} placeholder="project = SCRUM ORDER BY key" />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
