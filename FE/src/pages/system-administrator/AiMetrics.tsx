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
import { drawingStats } from '@/features/llm-run-view';
import { sectionTitle, statCard, statLabel } from './admin-ui';
import { Details } from '@/components/PageHeader';
import { formatDate, formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';
import type { Params } from '@/i18n';

const MSG = defineMessages({
  days: '{n} days', balanced: 'Balanced', quality: 'Quality first', budget: 'Budget', drawingsAccepted: '{pct} of {n} drawings accepted', questions: '{count} AI Insights questions', questions_one: '1 AI Insights question',
  noRuns: 'No AI runs in this period', perDayLabel: 'Tokens used per day', perDay: 'Tokens per day', peak: 'peak {n}', inOut: '{input} in · {output} out', runsCost: '{runs} runs · {cost}', noRunsDay: 'No runs', dayTokens: '{day}: {n} tokens',
  model: 'Model', recommended: 'Recommended', off: 'off', scoreTip: '100 × weighted sum of the five parts on the right', score: 'Score', notRecommended: 'Not recommended: {reasons}', fewTip: 'Fewer than 5 runs: pulled towards the average',
  fewRuns: 'few runs', noRunsWord: 'no runs', qualityTip: 'Mean quality of the answers: verified, valid view, cohesion kept, roles found, few attempts', qualityCol: 'Quality',
  groundedTip: 'Accepted runs: share of component names the file paths support (the rest are invented or vague)', grounded: 'Grounded',
  matchesTip: "Accepted runs: adjusted Rand index against the workspace's reference architecture (100% = same grouping); only workspaces with a reference", matches: 'Matches ref.',
  stabilityTip: 'Success rate, first-try rate, provider errors and latency spread', stability: 'Stability', stabilityDetail: '{success} success · {first} first try · {errors} provider errors',
  latencyTip: 'Accepted runs: median time per 100 files sent (p95 of whole runs in brackets)', latency: 'Latency / 100 files', costTip: 'Total cost divided by accepted runs', costSuccess: 'Cost / success', noSuccess: 'no success',
  tokensTip: 'Accepted runs: median tokens per 100 files sent', tokens100: 'Tokens / 100 files', runs: 'Runs', howScore: 'How the score is computed',
  formula: 'Score = 100 × ({q}·Quality + {s}·Stability + {l}·Latency + {c}·Cost + {t}·Tokens).',
  formulaNote: 'Latency, cost and tokens are relative to the best model (1 = best). Models need at least 3 runs and 50% success to be recommended (benchmarks: 1 run). Questions asked in AI Insights are included in the runs, tokens and cost figures but not in success, speed or scores.',
  queued: 'Benchmark queued. Follow it in Mining Jobs Monitor; results appear below when it finishes.', startFailed: 'Could not start the benchmark.', loadBenchFailed: 'Could not load the benchmark.',
  benchIntro: "Everyday usage compares models on different repositories. A benchmark asks each chosen model to draw the {same}, one after another, for a fair comparison. The workspace's own architecture is not changed; the runs count towards the scores.", sameSnapshot: 'same snapshot',
  workspace: 'Workspace', benchWorkspace: 'Benchmark workspace', snapshot: 'Snapshot', benchSnapshot: 'Benchmark snapshot', files: '{n} files', compare: 'Models to compare (2-8)', benchModels: 'Benchmark models', run: 'Run benchmark', refresh: 'Refresh',
  noBench: 'No benchmarks yet', started: 'Started', models: 'Models', results: 'Results', benchResults: 'Benchmark results', close: 'Close', result: 'Result', input: 'Input', output: 'Output', total: 'Total', time: 'Time', cost: 'Cost',
  loadFailed: 'Could not load AI metrics.', savedPreset: 'Saved: users see recommendations ranked this way.', saveFailed: 'Could not save.', successTip: 'Architecture drawings accepted out of all drawings. Questions asked in AI Insights are not counted here.', success: 'Success',
  inputTokens: 'Input tokens', outputTokens: 'Output tokens', totalTokens: 'Total tokens', avgTip: 'Average time to draw an architecture. Questions asked in AI Insights are not counted here.', avgTime: 'Avg time',
  title: 'AI Usage & Model Metrics', intro: 'Token use, cost and reliability of the AI models, and which one draws architectures best.', retry: 'Retry', atPrices: 'At the configured prices', avgDrawing: 'Avg time / drawing',
  comparison: 'Model comparison', repoSize: 'Repository size', allSizes: 'All sizes', small: 'Small repos (regrouped)', large: 'Large repos (names only)', source: 'Run source', allRuns: 'All runs', userRuns: 'User runs', benchmarks: 'Benchmarks',
  ranking: 'Ranking', useTip: 'Use this ranking for the model recommended to users', useFor: 'Use for recommendations', noModels: 'No models yet. Add them under AI Models.', byModel: 'Usage by model', serverConfig: ' · server config',
  byUser: 'Usage by user', user: 'User', byDay: 'Usage by day', day: 'Day', benchmark: 'Benchmark',
}, {
  days: '{n} ngày', balanced: 'Cân bằng', quality: 'Ưu tiên chất lượng', budget: 'Tiết kiệm', drawingsAccepted: '{pct} trong {n} lần vẽ được chấp nhận', questions: '{count} câu hỏi Phân tích AI',
  noRuns: 'Không có lần chạy AI nào trong khoảng này', perDayLabel: 'Token dùng mỗi ngày', perDay: 'Token mỗi ngày', peak: 'cao nhất {n}', inOut: '{input} vào · {output} ra', runsCost: '{runs} lần chạy · {cost}', noRunsDay: 'Không chạy', dayTokens: '{day}: {n} token',
  model: 'Mô hình', recommended: 'Đề xuất', off: 'tắt', scoreTip: '100 × tổng có trọng số của năm phần bên phải', score: 'Điểm', notRecommended: 'Không đề xuất: {reasons}', fewTip: 'Ít hơn 5 lần chạy: được kéo về mức trung bình',
  fewRuns: 'ít lần chạy', noRunsWord: 'chưa chạy', qualityTip: 'Chất lượng trung bình của câu trả lời: đã kiểm chứng, sơ đồ hợp lệ, giữ gắn kết, tìm được vai trò, ít lần thử', qualityCol: 'Chất lượng',
  groundedTip: 'Các lần được chấp nhận: tỉ lệ tên thành phần được đường dẫn tệp hỗ trợ (còn lại là bịa hoặc mơ hồ)', grounded: 'Có căn cứ',
  matchesTip: 'Các lần được chấp nhận: chỉ số Adjusted Rand so với kiến trúc tham chiếu (100% = cách nhóm giống hệt); chỉ các không gian làm việc có tham chiếu', matches: 'Khớp tham chiếu',
  stabilityTip: 'Tỉ lệ thành công, tỉ lệ đúng ngay lần đầu, lỗi nhà cung cấp và độ dao động độ trễ', stability: 'Ổn định', stabilityDetail: '{success} thành công · {first} đúng lần đầu · {errors} lỗi nhà cung cấp',
  latencyTip: 'Các lần được chấp nhận: thời gian trung vị cho mỗi 100 tệp gửi đi (p95 của cả lần chạy trong ngoặc)', latency: 'Độ trễ / 100 tệp', costTip: 'Tổng chi phí chia cho số lần được chấp nhận', costSuccess: 'Chi phí / thành công', noSuccess: 'chưa thành công',
  tokensTip: 'Các lần được chấp nhận: số token trung vị cho mỗi 100 tệp gửi đi', tokens100: 'Token / 100 tệp', runs: 'Số lần chạy', howScore: 'Cách tính điểm',
  formula: 'Điểm = 100 × ({q}·Chất lượng + {s}·Ổn định + {l}·Độ trễ + {c}·Chi phí + {t}·Token).',
  formulaNote: 'Độ trễ, chi phí và token được so với mô hình tốt nhất (1 = tốt nhất). Mô hình cần ít nhất 3 lần chạy và 50% thành công mới được đề xuất (benchmark: 1 lần). Câu hỏi trong Phân tích AI được tính vào số lần chạy, token và chi phí nhưng không tính vào thành công, tốc độ hay điểm.',
  queued: 'Đã xếp hàng benchmark. Theo dõi ở Theo dõi việc mining; kết quả hiện bên dưới khi xong.', startFailed: 'Không bắt đầu được benchmark.', loadBenchFailed: 'Không tải được benchmark.',
  benchIntro: 'Sử dụng hằng ngày so sánh các mô hình trên các repository khác nhau. Benchmark yêu cầu từng mô hình được chọn vẽ cùng một {same}, lần lượt, để so sánh công bằng. Kiến trúc của không gian làm việc không bị thay đổi; các lần chạy được tính vào điểm.', sameSnapshot: 'ảnh chụp',
  workspace: 'Không gian làm việc', benchWorkspace: 'Không gian làm việc benchmark', snapshot: 'Ảnh chụp', benchSnapshot: 'Ảnh chụp benchmark', files: '{n} tệp', compare: 'Mô hình cần so sánh (2-8)', benchModels: 'Mô hình benchmark', run: 'Chạy benchmark', refresh: 'Làm mới',
  noBench: 'Chưa có benchmark nào', started: 'Bắt đầu', models: 'Mô hình', results: 'Kết quả', benchResults: 'Kết quả benchmark', close: 'Đóng', result: 'Kết quả', input: 'Vào', output: 'Ra', total: 'Tổng', time: 'Thời gian', cost: 'Chi phí',
  loadFailed: 'Không tải được số liệu AI.', savedPreset: 'Đã lưu: người dùng thấy đề xuất được xếp hạng theo cách này.', saveFailed: 'Không lưu được.', successTip: 'Số lần vẽ kiến trúc được chấp nhận trên tổng số lần vẽ. Câu hỏi trong Phân tích AI không được tính ở đây.', success: 'Thành công',
  inputTokens: 'Token vào', outputTokens: 'Token ra', totalTokens: 'Tổng token', avgTip: 'Thời gian trung bình để vẽ một kiến trúc. Câu hỏi trong Phân tích AI không được tính ở đây.', avgTime: 'Thời gian TB',
  title: 'Mức dùng AI & số liệu mô hình', intro: 'Token, chi phí và độ tin cậy của các mô hình AI, và mô hình nào vẽ kiến trúc tốt nhất.', retry: 'Thử lại', atPrices: 'Theo giá đã cấu hình', avgDrawing: 'Thời gian TB / lần vẽ',
  comparison: 'So sánh mô hình', repoSize: 'Kích thước repository', allSizes: 'Mọi kích thước', small: 'Repo nhỏ (nhóm lại)', large: 'Repo lớn (chỉ đặt tên)', source: 'Nguồn chạy', allRuns: 'Mọi lần chạy', userRuns: 'Do người dùng', benchmarks: 'Benchmark',
  ranking: 'Xếp hạng', useTip: 'Dùng cách xếp hạng này cho mô hình đề xuất tới người dùng', useFor: 'Dùng cho đề xuất', noModels: 'Chưa có mô hình nào. Hãy thêm ở Mô hình AI.', byModel: 'Theo mô hình', serverConfig: ' · cấu hình máy chủ',
  byUser: 'Theo người dùng', user: 'Người dùng', byDay: 'Theo ngày', day: 'Ngày', benchmark: 'Benchmark',
});
const tx = (key: Parameters<typeof translate<typeof MSG.en>>[1], params?: Params) => translate(MSG, key, params);
const ranges = () => [7, 30, 90].map(value => ({ value, label: tx('days', { n: value }) }));
const presets = (): { value: ScorePreset; label: string }[] => [{ value: 'balanced', label: tx('balanced') }, { value: 'quality', label: tx('quality') }, { value: 'budget', label: tx('budget') }];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The Runs tile's hint: how many drawings were accepted, and how many questions asked in AI Insights are in the count. */
function runsHint(t: UsageReport['totals'] | undefined): string | undefined {
  if (!t?.runs) return undefined;
  const d = drawingStats(t);
  const parts = [d.successRate === null ? null : tx('drawingsAccepted', { pct: formatPercent(d.successRate), n: d.runs }), t.chatRuns ? tx('questions', { count: t.chatRuns }) : null];
  return parts.filter(Boolean).join(' · ') || undefined;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className={statCard}><p className={statLabel}>{label}</p><p className="mt-3 text-2xl font-bold">{value}</p>{hint && <p className="mt-1 text-xs text-[var(--at-muted)]">{hint}</p>}</div>;
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
  if (!rows.length) return <Empty description={tx('noRuns')} />;
  return <figure aria-label={tx('perDayLabel')}>
    <div className="flex items-baseline justify-between text-xs text-[var(--at-muted)] mb-2"><span className={statLabel}>{tx('perDay')}</span><span>{tx('peak', { n: formatCompactTokens(max) })}</span></div>
    <div className="relative h-40 border-b border-[var(--at-line)]">
      <div className="absolute inset-x-0 top-0 border-t border-dashed border-[var(--at-line)]" aria-hidden />
      <div className="absolute inset-0 flex items-end gap-[2px]">
        {series.map(s => {
          const total = s.row?.totalTokens ?? 0;
          return <Tooltip key={s.day} title={<div className="text-xs"><p className="font-medium">{formatDate(s.day)}</p>
            {s.row ? <><p>{tx('inOut', { input: formatTokens(s.row.inputTokens), output: formatTokens(s.row.outputTokens) })}</p><p>{tx('runsCost', { runs: formatTokens(s.row.runs), cost: formatCost(s.row.cost) })}</p></> : <p>{tx('noRunsDay')}</p>}</div>}>
            <div className="group flex h-full flex-1 items-end" role="img" aria-label={tx('dayTokens', { day: s.day, n: formatTokens(total) })}>
              <div className="w-full rounded-t-[4px] bg-[var(--at-accent)] group-hover:bg-[var(--at-link-hover)]" style={{ height: total ? `${Math.max(2, (total / max) * 100)}%` : 0 }} />
            </div>
          </Tooltip>;
        })}
      </div>
    </div>
    <div className="flex justify-between text-[11px] text-[var(--at-muted)] mt-1"><span>{series[0].day}</span><span>{series[series.length - 1].day}</span></div>
  </figure>;
}

function ScoreBar({ value }: { value: number }) {
  return <div className="flex items-center gap-2 min-w-32"><Progress percent={value} showInfo={false} size="small" strokeColor="var(--at-accent)" className="!m-0 flex-1" /><span className="text-sm w-10 text-right">{value.toFixed(1)}</span></div>;
}

const leaderboardColumns = (): ColumnsType<LeaderboardRow> => [
  { title: '#', width: 40, render: (_, __, i) => i + 1 },
  { title: tx('model'), render: (_, r) => <div>
    <div className="flex flex-wrap items-center gap-1"><span className="font-medium">{r.displayName}</span>{r.recommended && <Tag color="blue" icon={<Star size={10} className="inline -mt-0.5 mr-0.5" />}>{tx('recommended')}</Tag>}{!r.enabled && <Tag>{tx('off')}</Tag>}{r.health !== 'unknown' && r.health !== 'up' && <Tag color={healthColor[r.health]}>{r.health}</Tag>}</div>
    <p className="text-[11px] text-[var(--at-muted)] font-mono">{r.provider} · {r.model}</p>
  </div> },
  { title: <Tooltip title={tx('scoreTip')}>{tx('score')}</Tooltip>, render: (_, r) => r.stats.n ? <Tooltip title={r.reasons.length ? tx('notRecommended', { reasons: r.reasons.join('; ') }) : r.confident ? undefined : tx('fewTip')}><div><ScoreBar value={r.score} />{!r.confident && <span className="text-[10px] text-[var(--at-muted)]">{tx('fewRuns')}</span>}</div></Tooltip> : <span className="text-[var(--at-muted)]">{tx('noRunsWord')}</span> },
  { title: <Tooltip title={tx('qualityTip')}>{tx('qualityCol')}</Tooltip>, align: 'right', render: (_, r) => r.stats.n ? formatPercent(r.components.quality) : '–' },
  { title: <Tooltip title={tx('groundedTip')}>{tx('grounded')}</Tooltip>, align: 'right', render: (_, r) => (typeof r.stats.groundingMean === 'number' ? formatPercent(r.stats.groundingMean) : '–') },
  { title: <Tooltip title={tx('matchesTip')}>{tx('matches')}</Tooltip>, align: 'right', render: (_, r) => (typeof r.stats.agreementMean === 'number' ? formatPercent(Math.max(0, r.stats.agreementMean)) : '–') },
  { title: <Tooltip title={tx('stabilityTip')}>{tx('stability')}</Tooltip>, align: 'right', render: (_, r) => r.stats.n ? <Tooltip title={tx('stabilityDetail', { success: formatPercent(r.stats.successRate), first: formatPercent(r.stats.firstPassRate), errors: formatPercent(r.stats.providerErrorRate) })}>{formatPercent(r.components.stability)}</Tooltip> : '–' },
  { title: <Tooltip title={tx('latencyTip')}>{tx('latency')}</Tooltip>, align: 'right', render: (_, r) => r.stats.accepted ? <span className="text-xs">{formatMs(r.stats.latencyPer100)} <span className="text-[var(--at-muted)]">({formatMs(r.stats.latencyP95Ms)})</span></span> : '–' },
  { title: <Tooltip title={tx('costTip')}>{tx('costSuccess')}</Tooltip>, align: 'right', render: (_, r) => !r.stats.n ? '–' : !r.stats.accepted ? <span className="text-[var(--at-danger)]">{tx('noSuccess')}</span> : formatCost(r.stats.costPerSuccess) },
  { title: <Tooltip title={tx('tokensTip')}>{tx('tokens100')}</Tooltip>, align: 'right', render: (_, r) => r.stats.accepted ? formatCompactTokens(r.stats.tokensPer100) : '–' },
  { title: tx('runs'), align: 'right', render: (_, r) => r.stats.n },
];

function Weights({ board }: { board: Leaderboard }) {
  const w = board.weights;
  return <Details label={tx('howScore')} bodyClassName="text-xs">
    <p>{tx('formula', { q: w.quality.toFixed(2), s: w.stability.toFixed(2), l: w.latency.toFixed(2), c: w.cost.toFixed(2), t: w.tokens.toFixed(2) })}
    {' '}{tx('formulaNote')}</p>
  </Details>;
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
  const bench = useMessages(MSG);
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
      message.success(tx('queued'));
      setTimeout(() => setRevision(v => v + 1), 3000);
    } catch (cause) { message.error(cause instanceof Error ? cause.message : tx('startFailed')); }
    finally { setStarting(false); }
  }
  async function show(id: string) {
    try { setOpen(await getBenchmark(id)); } catch (cause) { message.error(cause instanceof Error ? cause.message : tx('loadBenchFailed')); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-[var(--at-muted)]">{bench.rich('benchIntro', { same: <b key="s">{bench('sameSnapshot')}</b> })}</p>
    <div className="flex flex-wrap items-end gap-2">
      <Select className="min-w-56" placeholder={tx('workspace')} aria-label={tx('benchWorkspace')} value={projectId} showSearch optionFilterProp="label" onChange={(v: string) => { setProjectId(v); setSnapshotId(targets.find(t => t.id === v)?.snapshots[0]?.id); }} options={targets.map(t => ({ value: t.id, label: t.name }))} />
      <Select className="min-w-72" placeholder={tx('snapshot')} aria-label={tx('benchSnapshot')} value={snapshotId} onChange={setSnapshotId} disabled={!project}
        options={(project?.snapshots ?? []).map(s => ({ value: s.id, label: `${s.hash} · ${s.title.split('\n')[0].slice(0, 40)} · ${tx('files', { n: s.files })}` }))} />
      <Select mode="multiple" className="min-w-80" placeholder={tx('compare')} aria-label={tx('benchModels')} value={modelIds} onChange={setModelIds} maxCount={8}
        options={models.filter(m => m.enabled).map(m => ({ value: m.id, label: m.displayName }))} />
      <Button type="primary" icon={<FlaskConical size={14} />} loading={starting} disabled={!snapshotId || modelIds.length < 2} onClick={() => void start()}>{tx('run')}</Button>
      <Button onClick={() => setRevision(v => v + 1)}>{tx('refresh')}</Button>
    </div>
    <Table<BenchmarkSummary> rowKey="id" size="small" dataSource={list} pagination={{ pageSize: 8 }} locale={{ emptyText: tx('noBench') }}
      columns={[
        { title: tx('started'), render: (_, b) => formatDateTime(b.startedAt) },
        { title: tx('workspace'), render: (_, b) => b.projectName ?? b.projectId },
        { title: tx('models'), render: (_, b) => b.models.map(m => <Tag key={m}>{m}</Tag>) },
        { title: tx('runs'), dataIndex: 'runs', align: 'right' },
        { title: '', align: 'right', render: (_, b) => <Button size="small" onClick={() => void show(b.id)}>{tx('results')}</Button> },
      ]} />
    {open && <div className="border border-[var(--at-line)] bg-[var(--at-panel-2)] p-5 space-y-3">
      <div className="flex justify-between"><h4 className="text-base font-bold">{tx('benchResults')}</h4><Button size="small" onClick={() => setOpen(null)}>{tx('close')}</Button></div>
      <Table<LeaderboardRow> rowKey="id" size="small" pagination={false} dataSource={open.leaderboard.rows} columns={leaderboardColumns()} scroll={{ x: 900 }} />
      <Table rowKey="id" size="small" pagination={false} dataSource={open.runs} scroll={{ x: 900 }}
        columns={[
          { title: tx('model'), dataIndex: 'model' },
          { title: tx('result'), render: (_, r) => <Tooltip title={r.fallbackReason}><Tag color={statusColor[r.status]}>{statusLabel[r.status]}</Tag></Tooltip> },
          { title: tx('qualityCol'), align: 'right', render: (_, r) => formatPercent(r.quality?.score) },
          { title: tx('input'), align: 'right', render: (_, r) => formatTokens(r.usage?.inputTokens) },
          { title: tx('output'), align: 'right', render: (_, r) => formatTokens(r.usage?.outputTokens) },
          { title: tx('total'), align: 'right', render: (_, r) => formatTokens(r.usage?.totalTokens) },
          { title: tx('time'), align: 'right', render: (_, r) => formatMs(r.latencyMs) },
          { title: tx('cost'), align: 'right', render: (_, r) => formatCost(r.cost?.amount) },
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
  const m = useMessages(MSG);

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
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : tx('loadFailed')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, mode, purpose, preset, revision]);

  async function savePreset() {
    if (!preset) return;
    try { await updateLlmSettings({ scoring: { preset, windowDays: days } }); message.success(m('savedPreset')); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : m('saveFailed')); }
  }

  const t = daily?.totals;
  const usageColumns = (first: ColumnsType<UsageRow>[number]): ColumnsType<UsageRow> => [
    first,
    { title: m('runs'), dataIndex: 'runs', align: 'right' },
    { title: <Tooltip title={m('successTip')}>{m('success')}</Tooltip>, align: 'right', render: (_, r) => { const d = drawingStats(r); return d.successRate === null ? '–' : formatPercent(d.successRate); } },
    { title: m('inputTokens'), align: 'right', render: (_, r) => formatTokens(r.inputTokens) },
    { title: m('outputTokens'), align: 'right', render: (_, r) => formatTokens(r.outputTokens) },
    { title: m('totalTokens'), align: 'right', render: (_, r) => <b>{formatTokens(r.totalTokens)}</b> },
    { title: <Tooltip title={m('avgTip')}>{m('avgTime')}</Tooltip>, align: 'right', render: (_, r) => r.drawAvgLatencyMs == null ? '–' : formatMs(r.drawAvgLatencyMs) },
    { title: m('cost'), align: 'right', render: (_, r) => formatCost(r.cost) },
  ];

  return <FeaturePage title={m('title')} description={m('intro')} demo={false}
    actions={<Space wrap><Segmented value={days} onChange={v => setDays(Number(v))} options={ranges()} /><Button loading={loading} onClick={() => setRevision(v => v + 1)}>{m('refresh')}</Button></Space>}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setRevision(v => v + 1)}>{m('retry')}</Button>} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label={m('runs')} value={formatTokens(t?.runs ?? 0)} hint={runsHint(t)} />
      <Stat label={m('inputTokens')} value={formatCompactTokens(t?.inputTokens ?? 0)} />
      <Stat label={m('outputTokens')} value={formatCompactTokens(t?.outputTokens ?? 0)} />
      <Stat label={m('cost')} value={formatCost(t?.cost ?? 0)} hint={m('atPrices')} />
      <Stat label={m('avgDrawing')} value={t?.drawAvgLatencyMs == null ? '–' : formatMs(t.drawAvgLatencyMs)} />
    </div>
    <div className={featurePanel}>{daily && <TokensByDay rows={daily.rows} days={days} />}</div>

    <div className={`${featurePanel} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={sectionTitle}>{m('comparison')}</h3>
        <Space wrap>
          <Select aria-label={m('repoSize')} value={mode} onChange={setMode} options={[{ value: 'all', label: m('allSizes') }, { value: 'refine', label: m('small') }, { value: 'name-only', label: m('large') }]} />
          <Select aria-label={m('source')} value={purpose} onChange={setPurpose} options={[{ value: 'all', label: m('allRuns') }, { value: 'user', label: m('userRuns') }, { value: 'benchmark', label: m('benchmarks') }]} />
          <Select aria-label={m('ranking')} value={preset} onChange={setPreset} options={presets()} />
          <Tooltip title={m('useTip')}><Button onClick={() => void savePreset()}>{m('useFor')}</Button></Tooltip>
        </Space>
      </div>
      {board && <Weights board={board} />}
      <Table<LeaderboardRow> rowKey="id" size="small" loading={loading} pagination={false} dataSource={board?.rows ?? []} columns={leaderboardColumns()} scroll={{ x: 1000 }}
        locale={{ emptyText: m('noModels') }} />
    </div>

    <div className={featurePanel}>
      <Tabs items={[
        { key: 'model', label: m('byModel'), children: <Table<UsageRow> rowKey={r => JSON.stringify(r.key)} size="small" pagination={false} dataSource={byModel?.rows ?? []} scroll={{ x: 900 }}
          columns={usageColumns({ title: m('model'), render: (_, r) => { const k = r.key as { model?: string; provider?: string; modelId?: string | null }; return <span>{k?.model}<span className="block text-[11px] text-[var(--at-muted)]">{k?.provider}{k?.modelId ? '' : m('serverConfig')}</span></span>; } })} /> },
        { key: 'user', label: m('byUser'), children: <Table<UsageRow> rowKey={r => String(r.key)} size="small" pagination={{ pageSize: 10 }} dataSource={byUser?.rows ?? []} scroll={{ x: 900 }}
          columns={usageColumns({ title: m('user'), render: (_, r) => <span>{r.user?.name ?? r.user?.id}<span className="block text-[11px] text-[var(--at-muted)]">{r.user?.email}</span></span> })} /> },
        { key: 'day', label: m('byDay'), children: <Table<UsageRow> rowKey={r => String(r.key)} size="small" pagination={{ pageSize: 10 }} dataSource={[...(daily?.rows ?? [])].reverse()} scroll={{ x: 900 }}
          columns={usageColumns({ title: m('day'), render: (_, r) => String(r.key) })} /> },
        { key: 'benchmark', label: m('benchmark'), children: <BenchmarkPanel models={models} /> },
      ]} />
    </div>
  </FeaturePage>;
}
