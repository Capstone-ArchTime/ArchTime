import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Progress, Segmented, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FlaskConical, Star } from 'lucide-react';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import {
  formatCompactTokens, formatCost, formatMs, formatPercent, formatTokens, getAdminModels, getBenchmark, getBenchmarks, getBenchmarkTargets, getLeaderboard,
  getLlmUsage, healthColor, startBenchmark, statusColor, statusLabel, updateLlmSettings,
} from '@/features/llm-api';
import type { AdminModel, BenchmarkDetail, BenchmarkSummary, BenchmarkTarget, Leaderboard, LeaderboardRow, ScorePreset, UsageReport, UsageRow } from '@/features/llm-api';

const RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }];
const PRESETS: { value: ScorePreset; label: string }[] = [{ value: 'balanced', label: 'Balanced' }, { value: 'quality', label: 'Quality first' }, { value: 'budget', label: 'Budget' }];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className={featurePanel}><p className="text-xs uppercase tracking-wider text-[#94a3b8]">{label}</p><p className="mt-2 text-2xl font-semibold font-mono">{value}</p>{hint && <p className="mt-1 text-xs text-[#94a3b8]">{hint}</p>}</div>;
}

/** One bar per day, zero days included so gaps read as gaps. Hover shows the day's numbers; the table below holds the same data. */
function TokensByDay({ rows, days }: { rows: UsageRow[]; days: number }) {
  const series = useMemo(() => {
    const byDay = new Map(rows.map(r => [String(r.key), r]));
    return Array.from({ length: days }, (_, i) => {
      const d = isoDay(new Date(Date.now() - (days - 1 - i) * 86_400_000));
      return { day: d, row: byDay.get(d) };
    });
  }, [rows, days]);
  const max = Math.max(1, ...series.map(s => s.row?.totalTokens ?? 0));
  if (!rows.length) return <Empty description="No AI runs in this period" />;
  return <figure aria-label="Tokens used per day">
    <div className="flex items-baseline justify-between text-xs text-[#94a3b8] mb-2"><span>Tokens per day</span><span className="font-mono">peak {formatCompactTokens(max)}</span></div>
    <div className="relative h-40 border-b border-[#242527]">
      <div className="absolute inset-x-0 top-0 border-t border-dashed border-[#242527]" aria-hidden />
      <div className="absolute inset-0 flex items-end gap-[2px]">
        {series.map(s => {
          const total = s.row?.totalTokens ?? 0;
          return <Tooltip key={s.day} title={<div className="text-xs"><p className="font-medium">{new Date(s.day).toLocaleDateString()}</p>
            {s.row ? <><p>{formatTokens(s.row.inputTokens)} in · {formatTokens(s.row.outputTokens)} out</p><p>{formatTokens(s.row.runs)} runs · {formatCost(s.row.cost)}</p></> : <p>No runs</p>}</div>}>
            <div className="group flex h-full flex-1 items-end" role="img" aria-label={`${s.day}: ${formatTokens(total)} tokens`}>
              <div className="w-full rounded-t-[4px] bg-[#3b82f6] group-hover:bg-[#60a5fa]" style={{ height: total ? `${Math.max(2, (total / max) * 100)}%` : 0 }} />
            </div>
          </Tooltip>;
        })}
      </div>
    </div>
    <div className="flex justify-between text-[11px] text-[#94a3b8] mt-1 font-mono"><span>{series[0].day}</span><span>{series[series.length - 1].day}</span></div>
  </figure>;
}

function ScoreBar({ value }: { value: number }) {
  return <div className="flex items-center gap-2 min-w-32"><Progress percent={value} showInfo={false} size="small" strokeColor="#3b82f6" className="!m-0 flex-1" /><span className="font-mono text-sm w-10 text-right">{value.toFixed(1)}</span></div>;
}

const leaderboardColumns: ColumnsType<LeaderboardRow> = [
  { title: '#', width: 40, render: (_, __, i) => i + 1 },
  { title: 'Model', render: (_, r) => <div>
    <div className="flex flex-wrap items-center gap-1"><span className="font-medium">{r.displayName}</span>{r.recommended && <Tag color="gold" icon={<Star size={10} className="inline -mt-0.5 mr-0.5" />}>Recommended</Tag>}{!r.enabled && <Tag>off</Tag>}{r.health !== 'unknown' && r.health !== 'up' && <Tag color={healthColor[r.health]}>{r.health}</Tag>}</div>
    <p className="text-[11px] text-[#94a3b8] font-mono">{r.provider} · {r.model}</p>
  </div> },
  { title: <Tooltip title="100 × weighted sum of the five parts on the right">Score</Tooltip>, render: (_, r) => r.stats.n ? <Tooltip title={r.reasons.length ? `Not recommended: ${r.reasons.join('; ')}` : r.confident ? undefined : 'Fewer than 5 runs: pulled towards the average'}><div><ScoreBar value={r.score} />{!r.confident && <span className="text-[10px] text-[#94a3b8]">few runs</span>}</div></Tooltip> : <span className="text-[#94a3b8]">no runs</span> },
  { title: <Tooltip title="Mean quality of the answers: verified, valid view, cohesion kept, roles found, few attempts">Quality</Tooltip>, align: 'right', render: (_, r) => r.stats.n ? formatPercent(r.components.quality) : '–' },
  { title: <Tooltip title="Accepted runs: share of component names the file paths support (the rest are invented or vague)">Grounded</Tooltip>, align: 'right', render: (_, r) => (typeof r.stats.groundingMean === 'number' ? formatPercent(r.stats.groundingMean) : '–') },
  { title: <Tooltip title="Accepted runs: adjusted Rand index against the project's reference architecture (100% = same grouping); only projects with a reference">Matches ref.</Tooltip>, align: 'right', render: (_, r) => (typeof r.stats.agreementMean === 'number' ? formatPercent(Math.max(0, r.stats.agreementMean)) : '–') },
  { title: <Tooltip title="Success rate, first-try rate, provider errors and latency spread">Stability</Tooltip>, align: 'right', render: (_, r) => r.stats.n ? <Tooltip title={`${formatPercent(r.stats.successRate)} success · ${formatPercent(r.stats.firstPassRate)} first try · ${formatPercent(r.stats.providerErrorRate)} provider errors`}>{formatPercent(r.components.stability)}</Tooltip> : '–' },
  { title: <Tooltip title="Accepted runs: median time per 100 files sent (p95 of whole runs in brackets)">Latency / 100 files</Tooltip>, align: 'right', render: (_, r) => r.stats.accepted ? <span className="text-xs">{formatMs(r.stats.latencyPer100)} <span className="text-[#94a3b8]">({formatMs(r.stats.latencyP95Ms)})</span></span> : '–' },
  { title: <Tooltip title="Total cost divided by accepted runs">Cost / success</Tooltip>, align: 'right', render: (_, r) => !r.stats.n ? '–' : !r.stats.accepted ? <span className="text-red-400">no success</span> : formatCost(r.stats.costPerSuccess) },
  { title: <Tooltip title="Accepted runs: median tokens per 100 files sent">Tokens / 100 files</Tooltip>, align: 'right', render: (_, r) => r.stats.accepted ? formatCompactTokens(r.stats.tokensPer100) : '–' },
  { title: 'Runs', align: 'right', render: (_, r) => r.stats.n },
];

function Weights({ board }: { board: Leaderboard }) {
  const w = board.weights;
  return <p className="text-xs text-[#94a3b8]">Score = 100 × ({w.quality.toFixed(2)}·Quality + {w.stability.toFixed(2)}·Stability + {w.latency.toFixed(2)}·Latency + {w.cost.toFixed(2)}·Cost + {w.tokens.toFixed(2)}·Tokens).
    Latency, cost and tokens are relative to the best model (1 = best). Models need at least 3 runs and 50% success to be recommended (benchmarks: 1 run).</p>;
}

function BenchmarkPanel({ models }: { models: AdminModel[] }) {
  const { message } = App.useApp();
  const [targets, setTargets] = useState<BenchmarkTarget[]>([]);
  const [projectId, setProjectId] = useState<string>();
  const [snapshotId, setSnapshotId] = useState<string>();
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [list, setList] = useState<BenchmarkSummary[]>([]);
  const [open, setOpen] = useState<BenchmarkDetail | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getBenchmarkTargets(controller.signal).then(setTargets).catch(() => { /* shown as an empty list */ });
    getBenchmarks(controller.signal).then(setList).catch(() => { /* idem */ });
    return () => controller.abort();
  }, [revision]);

  const project = targets.find(t => t.id === projectId);
  async function start() {
    if (!projectId || !snapshotId) return;
    setStarting(true);
    try {
      await startBenchmark({ projectId, snapshotId, modelIds });
      message.success('Benchmark queued. Follow it in Mining Jobs Monitor; results appear below when it finishes.');
      setTimeout(() => setRevision(v => v + 1), 3000);
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not start the benchmark.'); }
    finally { setStarting(false); }
  }
  async function show(id: string) {
    try { setOpen(await getBenchmark(id)); } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not load the benchmark.'); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-[#94a3b8]">Everyday usage compares models on different repositories. A benchmark asks each chosen model to draw the <b>same snapshot</b>, one after another, for a fair comparison. The project's own architecture is not changed; the runs count towards the scores.</p>
    <div className="flex flex-wrap items-end gap-2">
      <Select className="min-w-56" placeholder="Project" aria-label="Benchmark project" value={projectId} showSearch optionFilterProp="label" onChange={(v: string) => { setProjectId(v); setSnapshotId(targets.find(t => t.id === v)?.snapshots[0]?.id); }} options={targets.map(t => ({ value: t.id, label: t.name }))} />
      <Select className="min-w-72" placeholder="Snapshot" aria-label="Benchmark snapshot" value={snapshotId} onChange={setSnapshotId} disabled={!project}
        options={(project?.snapshots ?? []).map(s => ({ value: s.id, label: `${s.hash} · ${s.title.split('\n')[0].slice(0, 40)} · ${s.files} files` }))} />
      <Select mode="multiple" className="min-w-80" placeholder="Models to compare (2-8)" aria-label="Benchmark models" value={modelIds} onChange={setModelIds} maxCount={8}
        options={models.filter(m => m.enabled).map(m => ({ value: m.id, label: m.displayName }))} />
      <Button type="primary" icon={<FlaskConical size={14} />} loading={starting} disabled={!snapshotId || modelIds.length < 2} onClick={() => void start()}>Run benchmark</Button>
      <Button onClick={() => setRevision(v => v + 1)}>Refresh</Button>
    </div>
    <Table<BenchmarkSummary> rowKey="id" size="small" dataSource={list} pagination={{ pageSize: 8 }} locale={{ emptyText: 'No benchmarks yet' }}
      columns={[
        { title: 'Started', render: (_, b) => new Date(b.startedAt).toLocaleString() },
        { title: 'Project', render: (_, b) => b.projectName ?? b.projectId },
        { title: 'Models', render: (_, b) => b.models.map(m => <Tag key={m}>{m}</Tag>) },
        { title: 'Runs', dataIndex: 'runs', align: 'right' },
        { title: '', align: 'right', render: (_, b) => <Button size="small" onClick={() => void show(b.id)}>Results</Button> },
      ]} />
    {open && <div className={`${featurePanel} space-y-3`}>
      <div className="flex justify-between"><h4 className="font-semibold">Benchmark results</h4><Button size="small" onClick={() => setOpen(null)}>Close</Button></div>
      <Table<LeaderboardRow> rowKey="id" size="small" pagination={false} dataSource={open.leaderboard.rows} columns={leaderboardColumns} scroll={{ x: 900 }} />
      <Table rowKey="id" size="small" pagination={false} dataSource={open.runs} scroll={{ x: 900 }}
        columns={[
          { title: 'Model', dataIndex: 'model' },
          { title: 'Result', render: (_, r) => <Tooltip title={r.fallbackReason}><Tag color={statusColor[r.status]}>{statusLabel[r.status]}</Tag></Tooltip> },
          { title: 'Quality', align: 'right', render: (_, r) => formatPercent(r.quality?.score) },
          { title: 'Input', align: 'right', render: (_, r) => formatTokens(r.usage?.inputTokens) },
          { title: 'Output', align: 'right', render: (_, r) => formatTokens(r.usage?.outputTokens) },
          { title: 'Total', align: 'right', render: (_, r) => formatTokens(r.usage?.totalTokens) },
          { title: 'Time', align: 'right', render: (_, r) => formatMs(r.latencyMs) },
          { title: 'Cost', align: 'right', render: (_, r) => formatCost(r.cost?.amount) },
        ]} />
    </div>}
  </div>;
}

/** Administrators watch token use and cost, and compare models to find the best one for drawing architectures. */
export default function AiMetrics() {
  const { message } = App.useApp();
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<'all' | 'refine' | 'name-only'>('all');
  const [purpose, setPurpose] = useState<'all' | 'user' | 'benchmark'>('all');
  const [preset, setPreset] = useState<ScorePreset | undefined>();
  const [daily, setDaily] = useState<UsageReport | null>(null);
  const [byModel, setByModel] = useState<UsageReport | null>(null);
  const [byUser, setByUser] = useState<UsageReport | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const from = isoDay(new Date(Date.now() - (days - 1) * 86_400_000));
    setLoading(true);
    Promise.all([
      getLlmUsage({ from, groupBy: 'day' }, controller.signal),
      getLlmUsage({ from, groupBy: 'model' }, controller.signal),
      getLlmUsage({ from, groupBy: 'user' }, controller.signal),
      getLeaderboard({ windowDays: days, mode: mode === 'all' ? undefined : mode, purpose, preset }, controller.signal),
      getAdminModels(controller.signal),
    ]).then(([d, m, u, b, list]) => { setDaily(d); setByModel(m); setByUser(u); setBoard(b); setModels(list.models); if (!preset) setPreset(list.scoring.preset === 'custom' ? 'balanced' : list.scoring.preset); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load AI metrics.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, mode, purpose, preset, revision]);

  async function savePreset() {
    if (!preset) return;
    try { await updateLlmSettings({ scoring: { preset, windowDays: days } }); message.success('Saved: users see recommendations ranked this way.'); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not save.'); }
  }

  const t = daily?.totals;
  const usageColumns = (first: ColumnsType<UsageRow>[number]): ColumnsType<UsageRow> => [
    first,
    { title: 'Runs', dataIndex: 'runs', align: 'right' },
    { title: 'Success', align: 'right', render: (_, r) => formatPercent(r.runs ? r.accepted / r.runs : 0) },
    { title: 'Input tokens', align: 'right', render: (_, r) => formatTokens(r.inputTokens) },
    { title: 'Output tokens', align: 'right', render: (_, r) => formatTokens(r.outputTokens) },
    { title: 'Total tokens', align: 'right', render: (_, r) => <b>{formatTokens(r.totalTokens)}</b> },
    { title: 'Avg time', align: 'right', render: (_, r) => formatMs(r.avgLatencyMs) },
    { title: 'Cost', align: 'right', render: (_, r) => formatCost(r.cost) },
  ];

  return <FeaturePage title="AI Usage & Model Metrics" description="Token use, cost and reliability of the AI models, and which one draws architectures best." demo={false}
    actions={<Space wrap><Segmented value={days} onChange={v => setDays(Number(v))} options={RANGES} /><Button loading={loading} onClick={() => setRevision(v => v + 1)}>Refresh</Button></Space>}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setRevision(v => v + 1)}>Retry</Button>} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Runs" value={formatTokens(t?.runs ?? 0)} hint={t?.runs ? `${formatPercent(t.accepted / t.runs)} accepted` : undefined} />
      <Stat label="Input tokens" value={formatCompactTokens(t?.inputTokens ?? 0)} />
      <Stat label="Output tokens" value={formatCompactTokens(t?.outputTokens ?? 0)} />
      <Stat label="Cost" value={formatCost(t?.cost ?? 0)} hint="At the configured prices" />
      <Stat label="Avg time / run" value={formatMs(t?.avgLatencyMs ?? 0)} />
    </div>
    <div className={featurePanel}>{daily && <TokensByDay rows={daily.rows} days={days} />}</div>

    <div className={`${featurePanel} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Model comparison</h3>
        <Space wrap>
          <Select aria-label="Repository size" value={mode} onChange={setMode} options={[{ value: 'all', label: 'All sizes' }, { value: 'refine', label: 'Small repos (regrouped)' }, { value: 'name-only', label: 'Large repos (names only)' }]} />
          <Select aria-label="Run source" value={purpose} onChange={setPurpose} options={[{ value: 'all', label: 'All runs' }, { value: 'user', label: 'User runs' }, { value: 'benchmark', label: 'Benchmarks' }]} />
          <Select aria-label="Ranking" value={preset} onChange={setPreset} options={PRESETS} />
          <Tooltip title="Use this ranking for the model recommended to users"><Button onClick={() => void savePreset()}>Use for recommendations</Button></Tooltip>
        </Space>
      </div>
      {board && <Weights board={board} />}
      <Table<LeaderboardRow> rowKey="id" size="small" loading={loading} pagination={false} dataSource={board?.rows ?? []} columns={leaderboardColumns} scroll={{ x: 1000 }}
        locale={{ emptyText: 'No models yet. Add them under AI Models.' }} />
    </div>

    <div className={featurePanel}>
      <Tabs items={[
        { key: 'model', label: 'Usage by model', children: <Table<UsageRow> rowKey={r => JSON.stringify(r.key)} size="small" pagination={false} dataSource={byModel?.rows ?? []} scroll={{ x: 900 }}
          columns={usageColumns({ title: 'Model', render: (_, r) => { const k = r.key as { model?: string; provider?: string; modelId?: string | null }; return <span>{k?.model}<span className="block text-[11px] text-[#94a3b8]">{k?.provider}{k?.modelId ? '' : ' · server config'}</span></span>; } })} /> },
        { key: 'user', label: 'Usage by user', children: <Table<UsageRow> rowKey={r => String(r.key)} size="small" pagination={{ pageSize: 10 }} dataSource={byUser?.rows ?? []} scroll={{ x: 900 }}
          columns={usageColumns({ title: 'User', render: (_, r) => <span>{r.user?.name ?? r.user?.id}<span className="block text-[11px] text-[#94a3b8]">{r.user?.email}</span></span> })} /> },
        { key: 'day', label: 'Usage by day', children: <Table<UsageRow> rowKey={r => String(r.key)} size="small" pagination={{ pageSize: 10 }} dataSource={[...(daily?.rows ?? [])].reverse()} scroll={{ x: 900 }}
          columns={usageColumns({ title: 'Day', render: (_, r) => String(r.key) })} /> },
        { key: 'benchmark', label: 'Benchmark', children: <BenchmarkPanel models={models} /> },
      ]} />
    </div>
  </FeaturePage>;
}
