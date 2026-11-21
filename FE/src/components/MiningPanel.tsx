import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Modal, Select, Spin, Tag, Tooltip } from 'antd';
import {
  ACTIVE_STATUSES, cancelMiningJob, getMiningEstimate, getMiningOverview, startMining, startScan,
  type MiningEstimate, type MiningOverview,
} from '@/features/mining-api';
import { getAIModelsConfig } from '@/features/admin-api';
import type { AIModelConfig } from '@/features/admin-api';
import { coverageRows, describeBatchProgress, monthBounds } from '@/features/mining-coverage';
import { trackJobs } from '@/features/background-jobs';
import { notifyFindings, notifyMessage } from '@/features/conformance';
import { Link } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { Details } from './PageHeader';
import { localizeStage, translateOr } from '@/i18n';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load mining status.', estimateFailed: 'Could not estimate this range.', requestFailed: 'The request failed.', mailFailed: 'The findings could not be e-mailed.',
  title: 'Mining · {name}', retry: 'Retry', coverage: 'Mining coverage', minedOf: '{mined} / {total} commits mined', remaining: ' · {n} remaining', fullyMined: 'Fully mined',
  notScanned: 'The repository has not been scanned yet.', inProgress: 'Job in progress', scanning: 'Scanning the repository', mining: 'Mining in progress', unreadable: ' · {n} unreadable',
  serverHint: 'It runs on the server: you can close this window and keep working.', stopping: 'Stopping — finished batches are kept.', stop: 'Stop after current commit',
  lastFailed: 'The last job failed', lastStopped: 'The last job was stopped', keptCount: '{processed} of {total} commits were analyzed and kept.',
  scanStarted: 'Scan started.', scan: 'Scan repository', scanHint: 'Reads the commit history so you can choose what to mine. No source analysis happens yet.',
  byMonth: 'Commit history by month', perMonth: 'Commits per month', clickMonth: ' · click a month to select it', minedLegend: 'mined', notMinedLegend: 'not mined',
  monthLabel: '{month}: {mined} of {total} commits mined', monthTitle: '{month} · {mined}/{total} mined',
  later: 'You can choose more to mine when this job ends.', choose: 'Choose what to mine', range: 'Time range', from: 'From', to: 'To', model: 'AI model', default: '(default)', selectModel: 'Select AI model',
  estimate: '{inRange} commits, {already} already mined, {toMine} to mine in {count} batches', estimate_one: '{inRange} commits, {already} already mined, {toMine} to mine in 1 batch', counting: 'Counting…',
  started: 'Mining started.', mineRange: 'Mine this range', continueAll: 'Continue: mine all remaining', continueAllN: 'Continue: mine all remaining ({n})', mineAll: 'Mine entire history',
  releasesHint: 'Mines the tagged commits (releases) first, so the architecture at each release is ready early; then every other commit not mined yet.',
  releasesStarted: 'Mining releases first.', releases: 'Releases first, then the rest', fetching: 'Fetching new commits.', checkNew: 'Check for new commits',
  batchesHint: 'Commits are analyzed in batches and saved after each one, so you can stop at any time and continue later. Each snapshot is compared with the previous mined snapshot, so mining non-adjacent ranges shows larger changes at the gaps.',
  findings: 'Conformance findings', findingsSub: 'Where mined commits break the confirmed component diagram.',
  findingsHint: 'Once the component diagram is confirmed, every mined commit is checked against it, and new findings are e-mailed to the owner and maintainers. Send them now, or open them to decide.',
  mailNew: 'E-mail new findings', openFindings: 'Open findings',
}, {
  loadFailed: 'Không tải được trạng thái mining.', estimateFailed: 'Không ước tính được khoảng này.', requestFailed: 'Yêu cầu thất bại.', mailFailed: 'Không gửi email kết quả kiểm tra được.',
  title: 'Mining · {name}', retry: 'Thử lại', coverage: 'Mức độ đã mining', minedOf: '{mined} / {total} commit đã mining', remaining: ' · còn {n}', fullyMined: 'Đã mining toàn bộ',
  notScanned: 'Repository chưa được quét.', inProgress: 'Tác vụ đang chạy', scanning: 'Đang quét repository', mining: 'Đang chạy mining', unreadable: ' · {n} không đọc được',
  serverHint: 'Tác vụ chạy trên máy chủ: bạn có thể đóng cửa sổ này và làm việc tiếp.', stopping: 'Đang dừng — các lô đã xong vẫn được giữ.', stop: 'Dừng sau commit hiện tại',
  lastFailed: 'Tác vụ gần nhất thất bại', lastStopped: 'Tác vụ gần nhất đã bị dừng', keptCount: 'Đã phân tích và giữ lại {processed}/{total} commit.',
  scanStarted: 'Đã bắt đầu quét.', scan: 'Quét repository', scanHint: 'Đọc lịch sử commit để bạn chọn phần cần mining. Chưa phân tích mã nguồn ở bước này.',
  byMonth: 'Lịch sử commit theo tháng', perMonth: 'Commit mỗi tháng', clickMonth: ' · bấm vào một tháng để chọn', minedLegend: 'đã mining', notMinedLegend: 'chưa mining',
  monthLabel: '{month}: đã mining {mined}/{total} commit', monthTitle: '{month} · đã mining {mined}/{total}',
  later: 'Bạn có thể chọn thêm phần cần mining khi tác vụ này xong.', choose: 'Chọn phần cần mining', range: 'Khoảng thời gian', from: 'Từ', to: 'Đến', model: 'Mô hình AI', default: '(mặc định)', selectModel: 'Chọn mô hình AI',
  estimate: '{inRange} commit, {already} đã mining, {toMine} cần mining trong {count} lô', counting: 'Đang đếm…',
  started: 'Đã bắt đầu mining.', mineRange: 'Mining khoảng này', continueAll: 'Tiếp tục: mining toàn bộ phần còn lại', continueAllN: 'Tiếp tục: mining toàn bộ phần còn lại ({n})', mineAll: 'Mining toàn bộ lịch sử',
  releasesHint: 'Mining các commit có gắn tag (bản phát hành) trước, để kiến trúc tại mỗi bản phát hành có sớm; sau đó tới mọi commit chưa mining.',
  releasesStarted: 'Đang mining các bản phát hành trước.', releases: 'Bản phát hành trước, phần còn lại sau', fetching: 'Đang lấy commit mới.', checkNew: 'Kiểm tra commit mới',
  batchesHint: 'Commit được phân tích theo lô và lưu sau mỗi lô, nên bạn có thể dừng bất cứ lúc nào và tiếp tục sau. Mỗi ảnh chụp được so với ảnh chụp đã mining trước đó, nên mining các khoảng không liền nhau sẽ thấy thay đổi lớn hơn ở chỗ đứt quãng.',
  findings: 'Kết quả kiểm tra tuân thủ', findingsSub: 'Những chỗ commit đã mining vi phạm sơ đồ thành phần đã xác nhận.',
  findingsHint: 'Khi sơ đồ thành phần đã được xác nhận, mọi commit đã mining đều được kiểm tra theo nó, và kết quả mới được gửi email cho chủ sở hữu và người bảo trì. Gửi ngay, hoặc mở ra để quyết định.',
  mailNew: 'Gửi email kết quả mới', openFindings: 'Mở kết quả kiểm tra',
});

type Range = { since: string; until: string };

export default function MiningPanel({ project, open, onClose, onChanged }: { project: { id: string; name: string }; open: boolean; onClose: () => void; onChanged?: () => void }) {
  const { message } = App.useApp();
  const m = useMessages(MSG);
  const [overview, setOverview] = useState<MiningOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [result, setResult] = useState<{ key: string; estimate?: MiningEstimate; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mailing, setMailing] = useState(false);
  const wasActive = useRef(false);
  const [aiModels, setAiModels] = useState<AIModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await getMiningOverview(project.id, signal);
      if (signal?.aborted) return;
      setOverview(next); setError(null);
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : m('loadFailed')); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `m` changes on every render; the text is read when needed
  }, [project.id]);

  const hasHistory = !!overview?.history;
  const minedCount = overview?.mined.count ?? 0;
  const active = overview?.activeJob && ACTIVE_STATUSES.includes(overview.activeJob.status) ? overview.activeJob : null;

  // Load AI models on open
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    getAIModelsConfig(controller.signal)
      .then(res => {
        setAiModels(res.data.models.filter(m => m.enabled));
        const defaultModel = res.data.models.find(m => m.isDefault);
        if (defaultModel) setSelectedModel(defaultModel.model);
      })
      .catch(() => { if (!controller.signal.aborted) setAiModels([]); });
    return () => controller.abort();
  }, [open]);

  // Load on open, then poll while a job is queued or running.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void refresh(controller.signal); }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, refresh]);
  useEffect(() => {
    if (!open || !active) return;
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [open, active, refresh]);
  useEffect(() => {
    if (wasActive.current && !active) onChanged?.();
    wasActive.current = !!active;
  }, [active, onChanged]);

  // Exact counts for the selected range (debounced so dragging the picker does not spam the server).
  useEffect(() => {
    if (!open || !range || !hasHistory) return;
    const controller = new AbortController();
    const key = `${range.since}|${range.until}|${minedCount}`;
    const timer = setTimeout(() => {
      getMiningEstimate(project.id, range.since, range.until, controller.signal)
        .then(next => { if (!controller.signal.aborted) setResult({ key, estimate: next }); })
        .catch(cause => { if (!controller.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : translate(MSG, 'estimateFailed') }); });
    }, 300);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, range, hasHistory, project.id, minedCount]);
  const current = range && result?.key === `${range.since}|${range.until}|${minedCount}` ? result : null;
  const estimate = current?.estimate ?? null;
  const estimateError = current?.error ?? null;

  const rows = useMemo(() => coverageRows(overview?.history?.monthly ?? [], overview?.mined.monthly ?? []), [overview]);
  const peak = Math.max(1, ...rows.map(r => r.total));

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { const result = await action(); message.success(success); trackJobs((result as { data?: { jobId?: unknown } } | undefined)?.data?.jobId); await refresh(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : m('requestFailed')); }
    finally { setBusy(false); }
  }

  async function mail() {
    setMailing(true);
    try { const { kind, text } = notifyMessage(await notifyFindings(project.id)); message[kind](text, 8); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : m('mailFailed'), 8); }
    finally { setMailing(false); }
  }

  const fullyMined = overview?.remaining === 0;
  const total = overview?.history?.totalCommits ?? 0;
  const minedPercent = total ? Math.round((minedCount / total) * 100) : 0;
  const needsModel = aiModels.length > 0 && !selectedModel;
  // The stage often repeats the batch line ("Batch 1/1 - 56a9111"); only a different stage (cloning, saving…) is shown.
  const stageNote = active && !(active.kind === 'mine' && /^batch\b/i.test(active.stage)) ? localizeStage(active.stage) : '';
  return <Modal open={open} onCancel={onClose} footer={null} width={760} title={m('title', { name: project.name })} destroyOnHidden>
    {!overview && !error && <div role="status" className="p-10 text-center"><Spin /></div>}
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => refresh()}>{m('retry')}</Button>} className="mb-4" />}
    {overview && <div className="space-y-6">

      {/* Where the history stands: the figure first, then a bar of it. */}
      {hasHistory ? <section aria-label={m('coverage')} className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-[var(--at-muted)]">
            {m.rich('minedOf', { mined: <span key="m" className="text-2xl font-bold text-[var(--at-text)]">{minedCount}</span>, total: <span key="t" className="text-[var(--at-text)]">{total}</span> })}
            {overview.remaining ? <span>{m('remaining', { n: overview.remaining })}</span> : null}
          </p>
          <Tag color={fullyMined ? 'green' : minedCount ? 'gold' : 'default'} className="!m-0">{fullyMined ? m('fullyMined') : translateOr(`tag.${overview.project.status}`, overview.project.status.toLowerCase())}</Tag>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--at-hover)]" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--at-link)] transition-[width] duration-500" style={{ width: `${minedPercent}%` }} />
        </div>
      </section> : <p className="text-sm text-[var(--at-muted)]">{m('notScanned')}</p>}

      {active && <section role="status" aria-label={m('inProgress')} className="rounded-xl border border-[var(--at-link)]/30 bg-[var(--at-panel-2)] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-semibold text-[var(--at-text)]"><Loader2 size={16} className="animate-spin text-[var(--at-link)]" aria-hidden="true" />{active.kind === 'scan' ? m('scanning') : m('mining')}</span>
          <span className="text-sm font-semibold text-[var(--at-text)]">{active.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--at-hover)]" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--at-link)] transition-[width] duration-500" style={{ width: `${active.progress}%` }} />
        </div>
        <p className="text-sm text-[var(--at-muted)]">
          {active.kind === 'mine' ? describeBatchProgress(active) : localizeStage(active.stage)}
          {stageNote && active.kind === 'mine' ? ` · ${stageNote}` : ''}
          {active.failedCommits ? m('unreadable', { n: active.failedCommits }) : ''}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--at-muted)]">{m('serverHint')}</p>
          <Button danger size="small" loading={busy} onClick={() => run(() => cancelMiningJob(active.id), m('stopping'))}>{m('stop')}</Button>
        </div>
      </section>}

      {!active && overview.lastJob && ['failed', 'cancelled'].includes(overview.lastJob.status) &&
        <Alert type={overview.lastJob.status === 'failed' ? 'error' : 'warning'} showIcon
          title={overview.lastJob.status === 'failed' ? m('lastFailed') : m('lastStopped')}
          description={overview.lastJob.error ?? m('keptCount', { processed: overview.lastJob.processed, total: overview.lastJob.total })} />}

      {!hasHistory && !active && <div><Button type="primary" loading={busy} onClick={() => run(() => startScan(project.id), m('scanStarted'))}>{m('scan')}</Button>
        <p className="text-xs text-[var(--at-muted)] mt-2">{m('scanHint')}</p></div>}

      {hasHistory && <>
        <section aria-label={m('byMonth')}>
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--at-muted)]">
            <span>{m('perMonth')}{active ? '' : m('clickMonth')}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--at-link)]" />{m('minedLegend')}</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-[var(--at-line-strong)] bg-[var(--at-hover)]" />{m('notMinedLegend')}</span>
            </span>
          </div>
          <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1 pt-1">
            {rows.map(r => {
              const selected = range && r.month === range.since.slice(0, 7) && r.month === range.until.slice(0, 7);
              return <button key={r.month} type="button" disabled={!!active} aria-pressed={!!selected} aria-label={m('monthLabel', { month: r.month, mined: r.mined, total: r.total })}
                title={m('monthTitle', { month: r.month, mined: r.mined, total: r.total })} onClick={() => setRange(monthBounds(r.month))}
                className={`relative flex-1 min-w-[10px] overflow-hidden rounded-t-md border border-[var(--at-line)] bg-[var(--at-hover)] transition-colors enabled:hover:border-[var(--at-line-strong)] disabled:cursor-default ${selected ? 'ring-2 ring-[var(--at-warn)] ring-offset-2 ring-offset-[var(--at-solid)]' : ''}`}
                style={{ height: `${Math.max(6, (r.total / peak) * 100)}%`, opacity: 1 }}>
                <span className="absolute bottom-0 left-0 right-0 bg-[var(--at-link)]" style={{ height: `${r.total ? (r.mined / r.total) * 100 : 0}%` }} />
              </button>;
            })}
          </div>
          <div className="flex justify-between text-[11px] text-[var(--at-muted)] mt-1"><span>{rows[0]?.month}</span><span>{rows.at(-1)?.month}</span></div>
        </section>

        {/* Choosing what to mine: hidden while a job runs (every control would be disabled anyway). */}
        {active ? <p className="text-sm text-[var(--at-muted)]">{m('later')}</p> : <section className="space-y-4" aria-label={m('choose')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm mb-2" htmlFor="mining-range">{m('range')}</label>
              <DatePicker.RangePicker id="mining-range" className="w-full"
                value={undefined} placeholder={range ? [range.since, range.until] : [m('from'), m('to')]}
                onChange={(_, strings) => setRange(Array.isArray(strings) && strings[0] && strings[1] ? { since: strings[0], until: strings[1] } : null)} />
            </div>
            <div>
              <label className="block text-sm mb-2" htmlFor="mining-model">{m('model')}</label>
              <Select
                id="mining-model"
                className="w-full"
                value={selectedModel || undefined}
                onChange={setSelectedModel}
                options={aiModels.map(model => ({
                  value: model.model,
                  label: (
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${model.provider === 'anthropic' ? 'bg-[var(--at-link)]' : model.provider === 'gemini' ? 'bg-[var(--at-accent)]' : 'bg-[var(--at-muted)]'}`} />
                      {model.model}
                      {model.isDefault && <span className="text-xs text-[var(--at-muted)]">{m('default')}</span>}
                    </span>
                  ),
                }))}
                placeholder={m('selectModel')}
              />
            </div>
          </div>
          {range && <p className="text-sm text-[var(--at-muted)]" role="status">
            <span className="text-[var(--at-text)]">{range.since} → {range.until}</span>: {estimateError ?? (estimate ? m('estimate', { inRange: estimate.inRange, already: estimate.alreadyMined, toMine: estimate.toMine, count: estimate.batchCount }) : m('counting'))}
          </p>}
          <div className="flex flex-wrap gap-2">
            <Button type="primary" disabled={!range || estimate?.toMine === 0 || needsModel} loading={busy}
              onClick={() => range && run(() => startMining(project.id, { mode: 'range', ...range, model: selectedModel } as any), m('started'))}>{m('mineRange')}</Button>
            <Button disabled={fullyMined || needsModel} loading={busy} onClick={() => run(() => startMining(project.id, { mode: 'remaining', model: selectedModel } as any), m('started'))}>
              {overview.mined.count ? (overview.remaining ? m('continueAllN', { n: overview.remaining }) : m('continueAll')) : m('mineAll')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Tooltip title={m('releasesHint')}>
              <Button type="link" className="!px-0" disabled={fullyMined || needsModel} loading={busy}
                onClick={() => run(() => startMining(project.id, { mode: 'milestones', model: selectedModel }), m('releasesStarted'))}>{m('releases')}</Button>
            </Tooltip>
            <Button type="link" className="!px-0" loading={busy} onClick={() => run(() => startScan(project.id), m('fetching'))}>{m('checkNew')}</Button>
          </div>
          <Details bodyClassName="text-xs">
            <p>{m('batchesHint')}</p>
          </Details>
        </section>}

        {overview.mined.count > 0 && <section aria-label={m('findings')} className="border-t border-[var(--at-line)] pt-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{m('findings')}</h3>
            <p className="text-xs text-[var(--at-muted)] mt-1">{m('findingsSub')}</p>
            <Details className="mt-1" bodyClassName="text-xs"><p>{m('findingsHint')}</p></Details>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Mail size={14} />} loading={mailing} disabled={!!active} onClick={mail}>{m('mailNew')}</Button>
            <Link to={`/project-maintainer/conformance?project=${encodeURIComponent(project.id)}`} onClick={onClose}><Button>{m('openFindings')}</Button></Link>
          </div>
        </section>}
      </>}
    </div>}
  </Modal>;
}
