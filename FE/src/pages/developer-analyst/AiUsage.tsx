import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Select, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { formatCost, formatMs, formatPercent, formatTokens, getMyRuns, statusColor, statusLabel } from '@/features/llm-api';
import type { LlmRun, PageMeta, RunTotals } from '@/features/llm-api';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className={featurePanel}><p className="text-xs uppercase tracking-wider text-[#94a3b8]">{label}</p><p className="mt-2 text-2xl font-semibold font-mono">{value}</p>{hint && <p className="mt-1 text-xs text-[#94a3b8]">{hint}</p>}</div>;
}

/** Every time the user asked an AI model to draw an architecture: which model, tokens in/out/total, time, cost and outcome. */
export default function AiUsage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ runs: LlmRun[]; totals: RunTotals; meta: PageMeta } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

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
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load your AI usage.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, page, revision]);

  const columns: ColumnsType<LlmRun> = [
    { title: 'When', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Project', render: (_, r) => <Link to={`/architecture#project=${encodeURIComponent(r.project.id)}${r.snapshotId ? `&snapshot=${encodeURIComponent(r.snapshotId)}` : ''}`}>{r.project.name ?? r.project.id}</Link> },
    { title: 'Model', render: (_, r) => <span><span className="font-medium">{r.model}</span><span className="block text-[11px] text-[#94a3b8]">{r.provider}{r.mode === 'name-only' ? ' · names only' : ''}</span></span> },
    { title: 'Input tokens', align: 'right', render: (_, r) => <span className="font-mono">{formatTokens(r.usage.inputTokens)}</span> },
    { title: 'Output tokens', align: 'right', render: (_, r) => <span className="font-mono">{formatTokens(r.usage.outputTokens)}</span> },
    { title: 'Total tokens', align: 'right', render: (_, r) => <Tooltip title={r.usage.estimated ? 'The provider did not report usage; estimated from text length.' : undefined}><span className="font-mono font-semibold">{formatTokens(r.usage.totalTokens)}{r.usage.estimated ? '*' : ''}</span></Tooltip> },
    { title: 'Time', align: 'right', render: (_, r) => formatMs(r.latencyMs) },
    { title: 'Cost', align: 'right', render: (_, r) => formatCost(r.cost?.amount, r.cost?.currency) },
    { title: 'Result', render: (_, r) => <Tooltip title={r.fallbackReason}><Tag color={statusColor[r.status]}>{statusLabel[r.status]}</Tag></Tooltip> },
    { title: 'Quality', align: 'right', render: (_, r) => <Tooltip title={`Attempts ${r.quality.attemptsUsed} · validity ${formatPercent(r.quality.V)} · cohesion ${formatPercent(r.quality.M)} · roles ${formatPercent(r.quality.R)}`}>{r.status === 'accepted' ? formatPercent(r.quality.score) : '–'}</Tooltip> },
  ];

  const t = result?.totals;
  return <FeaturePage title="AI Usage" description="Each time you asked an AI model to draw an architecture: the model used, tokens sent and received, time taken and cost." demo={false}
    actions={<div className="flex gap-2">
      <Select allowClear placeholder="All projects" aria-label="Filter by project" className="min-w-56" value={projectId} onChange={(v?: string) => { setProjectId(v); setPage(1); }} options={projects.map(p => ({ value: p.id, label: p.name }))} />
      <Button loading={loading} onClick={() => setRevision(v => v + 1)}>Refresh</Button>
    </div>}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setRevision(v => v + 1)}>Retry</Button>} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Runs" value={formatTokens(t?.runs ?? 0)} />
      <Stat label="Input tokens" value={formatTokens(t?.inputTokens ?? 0)} />
      <Stat label="Output tokens" value={formatTokens(t?.outputTokens ?? 0)} />
      <Stat label="Total tokens" value={formatTokens(t?.totalTokens ?? 0)} />
      <Stat label="Cost" value={formatCost(t?.cost ?? 0)} hint="At the prices set by your administrator" />
    </div>
    <div className={featurePanel}>
      {!loading && result && !result.runs.length ? <Empty description={<span>No AI runs yet. Use <b>Refine with AI</b> on the <Link to="/architecture">Architecture Map</Link>.</span>} /> :
        <Table<LlmRun> rowKey="id" size="small" loading={loading} columns={columns} dataSource={result?.runs ?? []} scroll={{ x: 1100 }}
          expandable={{ expandedRowRender: r => <div className="text-xs space-y-1">
            {r.attempts.map(a => <p key={a.n}>Attempt {a.n}: {a.ok ? 'accepted' : a.errorKind ? `provider error (${a.errorKind})` : `rejected (${a.issueCodes.join(', ') || 'no answer'})`} · {formatTokens(a.inputTokens)} in / {formatTokens(a.outputTokens)} out · {formatMs(a.latencyMs)}</p>)}
            {r.fallbackReason && <p className="text-[#94a3b8]">{r.fallbackReason}</p>}
          </div> }}
          pagination={{ current: result?.meta.page ?? page, pageSize: 20, total: result?.meta.total ?? 0, onChange: setPage, showSizeChanger: false }} />}
    </div>
  </FeaturePage>;
}
