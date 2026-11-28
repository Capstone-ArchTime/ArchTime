import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Spin, Tag, Typography } from 'antd';
import { Download, KeyRound, Plus } from 'lucide-react';
import { WorkspacePage } from './workspace';
import { panel } from './workspace-store';
import {
  DEFAULT_EXPIRY, EXPIRY_CHOICES, STATUS_LABEL, contextCommand, createToken, taskContextCommand, downloadAgentsMd, listTokens, revokeToken, sortTokens,
} from '@/features/agent-access';
import type { AgentToken } from '@/features/agent-access';
import { Details } from '@/components/PageHeader';
import { translateOr } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load the tokens.', createFailed: 'Could not create the token.', revoked: '"{name}" was revoked. Agents using it are refused from now on.', revokeFailed: 'Could not revoke the token.',
  mdFailed: 'Could not generate AGENTS.md.', mdIntro: 'Put it at the root of the repository; download it again after the diagram changes.',
  mdDetails: 'Generated from the confirmed component diagram: components and their paths, allowed dependencies, rules, design decisions and the commit convention.', download: 'Download AGENTS.md',
  tokens: 'Project tokens', tokensIntro: 'One token per agent or machine. Shown once, lasts up to 90 days.',
  tokensDetails: "A token lets an agent read this workspace's architecture context: never its source code, and nothing else of ArchTime. It can be revoked at any time.", newToken: 'New token', retry: 'Retry',
  noTokens: 'No tokens yet. Create one for each agent or machine, so you can revoke them one by one.', created: ' · created {date}', revokedOn: ' · revoked {date}', expires: ' · expires {date}', lastUsed: ' · last used {date}',
  revokeTitle: 'Revoke "{name}"?', revokeBody: 'Agents using it are refused from their next request.', revoke: 'Revoke', howAsks: 'How an agent asks',
  howDetails: 'Before changing a file, the agent asks which component it belongs to, which components it may and may not depend on, the design decisions about it and the commit convention.',
  howTask: 'Before starting a task, the agent asks for its context pack: the components the commits of the task touched, and for each the components it may and may not depend on (with the rule and its reason) and its design decisions.',
  newTitle: 'New project token', createToken: 'Create token', name: 'Name', nameExtra: 'Who uses it, e.g. Claude Code on my laptop, or CI pipeline.', expiresAfter: 'Expires after', days: '{n} days',
  createdTitle: 'Token "{name}" created', copied: 'I have copied it', copyNow: 'Copy it now: it is not shown again. ArchTime keeps only a fingerprint of it.',
  envHint: 'Give it to the agent as the ARCHTIME_AGENT_TOKEN environment variable; do not commit it.', title: 'Agent Access', intro: "Let coding agents follow this workspace's architecture.",
  details: 'An agent reads the architecture through the context API with a project token, or from an AGENTS.md file generated from the confirmed diagram.',
}, {
  loadFailed: 'Không tải được các token.', createFailed: 'Không tạo được token.', revoked: 'Đã thu hồi "{name}". Agent dùng token này sẽ bị từ chối từ giờ.', revokeFailed: 'Không thu hồi được token.',
  mdFailed: 'Không tạo được AGENTS.md.', mdIntro: 'Đặt tệp ở thư mục gốc của repository; tải lại sau khi sơ đồ thay đổi.',
  mdDetails: 'Tạo từ sơ đồ thành phần đã xác nhận: các thành phần và đường dẫn, các phụ thuộc được phép, quy tắc, quyết định thiết kế và quy ước commit.', download: 'Tải AGENTS.md',
  tokens: 'Token dự án', tokensIntro: 'Mỗi agent hoặc máy một token. Chỉ hiển thị một lần, dùng tối đa 90 ngày.',
  tokensDetails: 'Token cho phép agent đọc ngữ cảnh kiến trúc của không gian làm việc này: không bao giờ là mã nguồn, và không gì khác của ArchTime. Có thể thu hồi bất cứ lúc nào.', newToken: 'Token mới', retry: 'Thử lại',
  noTokens: 'Chưa có token nào. Hãy tạo cho mỗi agent hoặc máy một token để có thể thu hồi riêng từng cái.', created: ' · tạo {date}', revokedOn: ' · thu hồi {date}', expires: ' · hết hạn {date}', lastUsed: ' · dùng lần cuối {date}',
  revokeTitle: 'Thu hồi "{name}"?', revokeBody: 'Agent dùng token này sẽ bị từ chối từ yêu cầu tiếp theo.', revoke: 'Thu hồi', howAsks: 'Agent hỏi như thế nào',
  howDetails: 'Trước khi sửa một tệp, agent hỏi tệp thuộc thành phần nào, được và không được phụ thuộc vào thành phần nào, các quyết định thiết kế liên quan và quy ước commit.',
  howTask: 'Trước khi bắt đầu một task, agent hỏi gói ngữ cảnh của task: các thành phần mà commit của task đã đụng tới, và với mỗi thành phần: được và không được phụ thuộc vào thành phần nào (kèm quy tắc và lý do) và các quyết định thiết kế liên quan.',
  newTitle: 'Token dự án mới', createToken: 'Tạo token', name: 'Tên', nameExtra: 'Ai dùng nó, vd. Claude Code trên laptop của tôi, hoặc pipeline CI.', expiresAfter: 'Hết hạn sau', days: '{n} ngày',
  createdTitle: 'Đã tạo token "{name}"', copied: 'Tôi đã sao chép', copyNow: 'Hãy sao chép ngay: token không hiển thị lại. ArchTime chỉ giữ dấu vân tay của nó.',
  envHint: 'Đưa token cho agent qua biến môi trường ARCHTIME_AGENT_TOKEN; đừng commit nó.', title: 'Quyền cho agent', intro: 'Cho các coding agent tuân theo kiến trúc của không gian làm việc này.',
  details: 'Agent đọc kiến trúc qua context API bằng token dự án, hoặc từ tệp AGENTS.md tạo từ sơ đồ đã xác nhận.',
});
const day = (iso: string | null) => (iso ? formatDate(iso) : '—');

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
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    listTokens(project, controller.signal)
      .then(list => { setTokens(sortTokens(list)); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'loadFailed')); });
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
      message.error(cause instanceof Error ? cause.message : m('createFailed'));
    } finally { setSaving(false); }
  }

  async function revoke(token: AgentToken) {
    try {
      const revoked = await revokeToken(project, token.id);
      setTokens(list => sortTokens((list ?? []).map(t => (t.id === revoked.id ? revoked : t))));
      message.success(m('revoked', { name: token.name }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('revokeFailed'));
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
      setMdProblem(cause instanceof Error ? cause.message : m('mdFailed'));
    } finally { setDownloading(false); }
  }

  return <div className="space-y-5">
    <section className={`${panel} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold">AGENTS.md</h3>
          <p className="text-sm text-[var(--at-muted)] mt-1">{m('mdIntro')}</p>
          <Details className="mt-2"><p>{m('mdDetails')}</p></Details>
        </div>
        <Button type="primary" icon={<Download size={14} />} loading={downloading} onClick={download}>{m('download')}</Button>
      </div>
      {mdProblem && <Alert type="warning" showIcon title={mdProblem} />}
    </section>

    <section className={`${panel} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold">{m('tokens')}</h3>
          <p className="text-sm text-[var(--at-muted)] mt-1">{m('tokensIntro')}</p>
          <Details className="mt-2"><p>{m('tokensDetails')}</p></Details>
        </div>
        <Button icon={<Plus size={14} />} onClick={() => { form.setFieldsValue({ name: '', expiresInDays: DEFAULT_EXPIRY }); setCreating(true); }}>{m('newToken')}</Button>
      </div>
      {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setRevision(v => v + 1)}>{m('retry')}</Button>} />}
      {tokens === null && !error
        ? <div className="py-8 flex justify-center"><Spin /></div>
        : tokens && !tokens.length
          ? <Empty description={m('noTokens')} />
          : tokens && <ul className="divide-y divide-[var(--at-line)]" aria-label={m('tokens')}>
            {tokens.map(t => <li key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm break-words"><KeyRound size={13} className="inline mr-1 align-[-2px]" aria-hidden="true" />{t.name} <Tag color={STATUS_LABEL[t.status].color}>{translateOr(`agentStatus.${t.status}`, STATUS_LABEL[t.status].label)}</Tag></p>
                <p className="text-xs text-[var(--at-muted)] mt-1"><code>{t.prefix}…</code>{m('created', { date: day(t.createdAt) })}{t.status === 'revoked' ? m('revokedOn', { date: day(t.revokedAt) }) : m('expires', { date: day(t.expiresAt) })}{m('lastUsed', { date: day(t.lastUsedAt) })}</p>
              </div>
              {t.status === 'active' && <Popconfirm title={m('revokeTitle', { name: t.name })} description={m('revokeBody')} okText={m('revoke')} okButtonProps={{ danger: true }} onConfirm={() => revoke(t)}>
                <Button size="small" danger>{m('revoke')}</Button>
              </Popconfirm>}
            </li>)}
          </ul>}
    </section>

    <section className={`${panel} space-y-2`}>
      <h3 className="text-lg font-semibold">{m('howAsks')}</h3>
      <Details><p>{m('howDetails')}</p></Details>
      <Typography.Paragraph copyable={{ text: contextCommand() }} className="!mb-0"><code className="break-all text-xs">{contextCommand()}</code></Typography.Paragraph>
      <p className="!mb-0 pt-2">{m('howTask')}</p>
      <Typography.Paragraph copyable={{ text: taskContextCommand() }} className="!mb-0"><code className="break-all text-xs">{taskContextCommand()}</code></Typography.Paragraph>
    </section>

    <Modal title={m('newTitle')} open={creating} okText={m('createToken')} confirmLoading={saving} onOk={() => form.submit()} onCancel={() => setCreating(false)}>
      <Form form={form} layout="vertical" onFinish={create} initialValues={{ expiresInDays: DEFAULT_EXPIRY }}>
        <Form.Item name="name" label={m('name')} extra={m('nameExtra')} rules={[{ required: true, whitespace: true, max: 80 }]}><Input maxLength={80} /></Form.Item>
        <Form.Item name="expiresInDays" label={m('expiresAfter')}><Select options={EXPIRY_CHOICES.map(d => ({ value: d, label: m('days', { n: d }) }))} /></Form.Item>
      </Form>
    </Modal>

    <Modal title={m('createdTitle', { name: shown?.name ?? '' })} open={shown !== null} closable={false} mask={{ closable: false }} keyboard={false} destroyOnHidden
      footer={<Button type="primary" onClick={() => setShown(null)}>{m('copied')}</Button>}>
      <Alert type="warning" showIcon title={m('copyNow')} className="!mb-3" />
      <Typography.Paragraph copyable={{ text: shown?.token ?? '' }}><code className="break-all">{shown?.token}</code></Typography.Paragraph>
      <p className="text-xs text-[var(--at-muted)]">{m('envHint')}</p>
    </Modal>
  </div>;
}

export default function AgentAccess() {
  const m = useMessages(MSG);
  return <WorkspacePage title={m('title')} description={m('intro')}
    details={<p>{m('details')}</p>}>
    {project => <Access key={project} project={project} />}
  </WorkspacePage>;
}
