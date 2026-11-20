import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Select, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { formatCost, formatMs, formatPercent, formatTokens, getMyRuns, statusColor, statusLabel } from '@/features/llm-api';
import type { LlmRun, PageMeta, RunTotals } from '@/features/llm-api';
import { hasQuality, resultLabel, runKindNote } from '@/features/llm-run-view';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load your AI usage.', when: 'When', workspace: 'Workspace', deleted: 'Deleted workspace', model: 'Model', input: 'Input tokens', output: 'Output tokens', total: 'Total tokens',
  estimated: 'The provider did not report usage; estimated from text length.', time: 'Time', cost: 'Cost', result: 'Result', failed: 'Failed: {kind}', quality: 'Quality',
  qualityOnly: 'Quality is only scored when a model draws an architecture.', notScored: 'Not scored: quality is only scored when a model draws an architecture.',
  qualityTip: 'Attempts {attempts} · validity {v} · cohesion {m} · roles {r}', qualityMore: ' · grounded names {g} · no cycles {c} · layering {l} · balance {bal}', qualityRef: ' · matches reference {a}',
  title: 'AI Usage', description: 'Your AI runs: model, tokens, time and cost.',
  details: 'A run is each time you asked an AI model to draw an architecture or asked a question in AI Insights. Costs use the prices your administrator set.',
  allWorkspaces: 'All workspaces', filter: 'Filter by workspace', refresh: 'Refresh', retry: 'Retry', runs: 'Runs', atPrices: 'At the prices set by your administrator',
  empty: 'No AI runs yet. Use {refine} on the {map} or ask a question in {insights}.', refine: 'Refine with AI', map: 'Architecture Map', insights: 'AI Insights',
  attempt: 'Attempt {n}: {outcome} · {input} in / {output} out · {time}', answered: 'answered', accepted: 'accepted', failedOther: 'failed (not a provider error)', providerError: 'provider error ({kind})',
  rejected: 'rejected ({codes})', noAnswer: 'no answer',
}, {
  loadFailed: 'Không tải được mức dùng AI của bạn.', when: 'Thời điểm', workspace: 'Không gian làm việc', deleted: 'Không gian làm việc đã xoá', model: 'Mô hình', input: 'Token vào', output: 'Token ra', total: 'Tổng token',
  estimated: 'Nhà cung cấp không báo mức dùng; ước tính theo độ dài văn bản.', time: 'Thời gian', cost: 'Chi phí', result: 'Kết quả', failed: 'Thất bại: {kind}', quality: 'Chất lượng',
  qualityOnly: 'Chất lượng chỉ được chấm khi mô hình vẽ kiến trúc.', notScored: 'Không chấm: chất lượng chỉ được chấm khi mô hình vẽ kiến trúc.',
  qualityTip: 'Số lần thử {attempts} · hợp lệ {v} · gắn kết {m} · vai trò {r}', qualityMore: ' · tên có căn cứ {g} · không có vòng {c} · phân tầng {l} · cân bằng {bal}', qualityRef: ' · khớp tham chiếu {a}',
  title: 'Mức dùng AI', description: 'Các lần chạy AI của bạn: mô hình, token, thời gian và chi phí.',
  details: 'Mỗi lần chạy là một lần bạn nhờ mô hình AI vẽ kiến trúc hoặc đặt câu hỏi trong Phân tích AI. Chi phí tính theo giá quản trị viên đặt.',
  allWorkspaces: 'Mọi không gian làm việc', filter: 'Lọc theo không gian làm việc', refresh: 'Làm mới', retry: 'Thử lại', runs: 'Số lần chạy', atPrices: 'Theo giá quản trị viên đặt',
  empty: 'Chưa có lần chạy AI nào. Hãy dùng {refine} trên {map} hoặc đặt câu hỏi trong {insights}.', refine: 'Tinh chỉnh bằng AI', map: 'Bản đồ kiến trúc', insights: 'Phân tích AI',
  attempt: 'Lần thử {n}: {outcome} · {input} vào / {output} ra · {time}', answered: 'đã trả lời', accepted: 'được chấp nhận', failedOther: 'thất bại (không phải lỗi nhà cung cấp)', providerError: 'lỗi nhà cung cấp ({kind})',
  rejected: 'bị từ chối ({codes})', noAnswer: 'không có câu trả lời',
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className={featurePanel}><p className="text-xs uppercase tracking-wider text-[var(--at-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold font-mono">{value}</p>{hint && <p className="mt-1 text-xs text-[var(--at-muted)]">{hint}</p>}</div>;
}

/** Every time the user asked an AI model something, to draw an architecture or to ask a question in AI Insights: which model, tokens in/out/total, time, cost and outcome. */
export default function AiUsage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ runs: LlmRun[]; totals: RunTotals; meta: PageMeta } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal).then(setProjects).catch(() => { /* the filter is optional */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getMyRuns({ projectId, page, limit: 20 }, controller.signal)
      .then(r => { setResult(r); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('loadFailed')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the message function changes with the language; reloading then is not needed
  }, [projectId, page, revision]);

  const columns: ColumnsType<LlmRun> = [
    { title: m('when'), dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
    { title: m('workspace'), render: (_, r) => r.project.name ? <Link to={`/architecture#project=${encodeURIComponent(r.project.id)}${r.snapshotId ? `&snapshot=${encodeURIComponent(r.snapshotId)}` : ''}`}>{r.project.name}</Link> : <span className="text-[var(--at-muted)]">{m('deleted')}</span> },
    { title: m('model'), render: (_, r) => <span><span className="font-medium">{r.model}</span><span className="block text-[11px] text-[var(--at-muted)]">{r.provider}{runKindNote(r.mode) ? ` · ${runKindNote(r.mode)}` : ''}</span></span> },
    { title: m('input'), align: 'right', render: (_, r) => <span className="font-mono">{formatTokens(r.usage.inputTokens)}</span> },
    { title: m('output'), align: 'right', render: (_, r) => <span className="font-mono">{formatTokens(r.usage.outputTokens)}</span> },
    { title: m('total'), align: 'right', render: (_, r) => <Tooltip title={r.usage.estimated ? m('estimated') : undefined}><span className="font-mono font-semibold">{formatTokens(r.usage.totalTokens)}{r.usage.estimated ? '*' : ''}</span></Tooltip> },
    { title: m('time'), align: 'right', render: (_, r) => formatMs(r.latencyMs) },
    { title: m('cost'), align: 'right', render: (_, r) => formatCost(r.cost?.amount, r.cost?.currency) },
    { title: m('result'), render: (_, r) => <Tooltip title={r.fallbackReason ?? (r.status === 'failed' && r.errorKind ? m('failed', { kind: r.errorKind.replace(/_/g, ' ') }) : undefined)}><Tag color={statusColor[r.status]}>{resultLabel(r, statusLabel)}</Tag></Tooltip> },
    { title: m('quality'), align: 'right', render: (_, r) => !hasQuality(r) ? <Tooltip title={m('qualityOnly')}><span><span aria-hidden="true">–</span><span className="sr-only">{m('notScored')}</span></span></Tooltip> : <Tooltip title={`${m('qualityTip', { attempts: r.quality.attemptsUsed, v: formatPercent(r.quality.V), m: formatPercent(r.quality.M), r: formatPercent(r.quality.R) })}${r.quality.G !== undefined ? m('qualityMore', { g: formatPercent(r.quality.G), c: formatPercent(r.quality.C), l: formatPercent(r.quality.L), bal: formatPercent(r.quality.Bal) }) : ''}${r.quality.agreement !== undefined ? m('qualityRef', { a: formatPercent(Math.max(0, r.quality.agreement)) }) : ''}`}>{r.status === 'accepted' ? formatPercent(r.quality.score) : '–'}</Tooltip> },
  ];

  const t = result?.totals;
  return <FeaturePage title={m('title')} description={m('description')}
    details={<p>{m('details')}</p>} demo={false}
    actions={<div className="flex gap-2">
      <Select allowClear placeholder={m('allWorkspaces')} aria-label={m('filter')} className="min-w-56" value={projectId} onChange={(v?: string) => { setProjectId(v); setPage(1); }} options={projects.map(p => ({ value: p.id, label: p.name }))} />
      <Button loading={loading} onClick={() => setRevision(v => v + 1)}>{m('refresh')}</Button>
    </div>}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setRevision(v => v + 1)}>{m('retry')}</Button>} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label={m('runs')} value={formatTokens(t?.runs ?? 0)} />
      <Stat label={m('input')} value={formatTokens(t?.inputTokens ?? 0)} />
      <Stat label={m('output')} value={formatTokens(t?.outputTokens ?? 0)} />
      <Stat label={m('total')} value={formatTokens(t?.totalTokens ?? 0)} />
      <Stat label={m('cost')} value={formatCost(t?.cost ?? 0)} hint={m('atPrices')} />
    </div>
    <div className={featurePanel}>
      {!loading && result && !result.runs.length ? <Empty description={<span>{m.rich('empty', { refine: <b key="r">{m('refine')}</b>, map: <Link key="m" to="/architecture">{m('map')}</Link>, insights: <Link key="i" to="/insights">{m('insights')}</Link> })}</span>} /> :
        <Table<LlmRun> rowKey="id" size="small" loading={loading} columns={columns} dataSource={result?.runs ?? []} scroll={{ x: 1100 }}
          expandable={{ expandedRowRender: r => <div className="text-xs space-y-1">
            {r.attempts.map(a => <p key={a.n}>{m('attempt', { n: a.n, outcome: a.ok ? (r.mode === 'chat' ? m('answered') : m('accepted')) : a.errorKind === 'other' ? m('failedOther') : a.errorKind ? m('providerError', { kind: a.errorKind }) : m('rejected', { codes: a.issueCodes.join(', ') || m('noAnswer') }), input: formatTokens(a.inputTokens), output: formatTokens(a.outputTokens), time: formatMs(a.latencyMs) })}</p>)}
            {r.fallbackReason && <p className="text-[var(--at-muted)]">{r.fallbackReason}</p>}
          </div> }}
          pagination={{ current: result?.meta.page ?? page, pageSize: 20, total: result?.meta.total ?? 0, onChange: setPage, showSizeChanger: false }} />}
    </div>
  </FeaturePage>;
}
