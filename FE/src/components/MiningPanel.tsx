import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Modal, Progress, Select, Spin, Tag } from 'antd';
import {
  ACTIVE_STATUSES, cancelMiningJob, getMiningEstimate, getMiningOverview, startMining, startScan,
  type MiningEstimate, type MiningOverview,
} from '@/features/mining-api';
import { getAIModelsConfig } from '@/features/admin-api';
import type { AIModelConfig } from '@/features/admin-api';
import { coverageRows, describeBatchProgress, monthBounds } from '@/features/mining-coverage';

type Range = { since: string; until: string };

export default function MiningPanel({ project, open, onClose, onChanged }: { project: { id: string; name: string }; open: boolean; onClose: () => void; onChanged?: () => void }) {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<MiningOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [result, setResult] = useState<{ key: string; estimate?: MiningEstimate; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const wasActive = useRef(false);
  const [aiModels, setAiModels] = useState<AIModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await getMiningOverview(project.id, signal);
      if (signal?.aborted) return;
      setOverview(next); setError(null);
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Could not load mining status.'); }
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
        .catch(cause => { if (!controller.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : 'Could not estimate this range.' }); });
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
    try { await action(); message.success(success); await refresh(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'The request failed.'); }
    finally { setBusy(false); }
  }

  const fullyMined = overview?.remaining === 0;
  return <Modal open={open} onCancel={onClose} footer={null} width={760} title={`Mining · ${project.name}`} destroyOnHidden>
    {!overview && !error && <div role="status" className="p-10 text-center"><Spin /></div>}
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => refresh()}>Retry</Button>} className="mb-4" />}
    {overview && <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Tag color={fullyMined ? 'green' : overview.mined.count ? 'gold' : 'default'}>{overview.project.status}</Tag>
        {hasHistory
          ? <span><b>{overview.mined.count}</b> of <b>{overview.history!.totalCommits}</b> commits mined{overview.remaining ? ` · ${overview.remaining} remaining` : ''}</span>
          : <span className="text-[#94a3b8]">The repository has not been scanned yet.</span>}
      </div>

      {active && <div className="border border-[#242527] p-4 space-y-2" role="status">
        <div className="flex justify-between text-sm"><span>{active.kind === 'scan' ? 'Scanning repository' : 'Mining'}</span><span className="text-[#94a3b8]">{active.status}</span></div>
        <Progress percent={active.progress} status="active" />
        <p className="text-xs text-[#94a3b8]">{active.kind === 'mine' ? `${describeBatchProgress(active)} · ` : ''}{active.stage}{active.failedCommits ? ` · ${active.failedCommits} unreadable` : ''}</p>
        <Button danger size="small" loading={busy} onClick={() => run(() => cancelMiningJob(active.id), 'Stopping — finished batches are kept.')}>Stop after current commit</Button>
      </div>}

      {!active && overview.lastJob && ['failed', 'cancelled'].includes(overview.lastJob.status) &&
        <Alert type={overview.lastJob.status === 'failed' ? 'error' : 'warning'} showIcon
          title={overview.lastJob.status === 'failed' ? 'The last job failed' : 'The last job was stopped'}
          description={overview.lastJob.error ?? `${overview.lastJob.processed} of ${overview.lastJob.total} commits were analyzed and kept.`} />}

      {!hasHistory && !active && <div><Button type="primary" loading={busy} onClick={() => run(() => startScan(project.id), 'Scan started.')}>Scan repository</Button>
        <p className="text-xs text-[#94a3b8] mt-2">Clones the repository and reads its commit history so you can choose what to mine. No source analysis happens yet.</p></div>}

      {hasHistory && <>
        <section aria-label="Commit history by month">
          <div className="flex justify-between text-xs text-[#94a3b8] mb-2"><span>Commits per month · click a month to select it</span><span><i className="inline-block w-2 h-2 bg-[#3b82f6] mr-1" />mined <i className="inline-block w-2 h-2 bg-[#2a3441] ml-3 mr-1" />not mined</span></div>
          <div className="flex items-end gap-[3px] h-24 overflow-x-auto pb-1 pt-1">
            {rows.map(r => {
              const selected = range && r.month === range.since.slice(0, 7) && r.month === range.until.slice(0, 7);
              return <button key={r.month} type="button" disabled={!!active} aria-pressed={!!selected} aria-label={`${r.month}: ${r.mined} of ${r.total} commits mined`}
                title={`${r.month} · ${r.mined}/${r.total} mined`} onClick={() => setRange(monthBounds(r.month))}
                className={`relative flex-1 min-w-[10px] bg-[#2a3441] disabled:opacity-60 ${selected ? 'outline outline-2 outline-[#ffb03a]' : ''}`} style={{ height: `${Math.max(6, (r.total / peak) * 100)}%` }}>
                <span className="absolute bottom-0 left-0 right-0 bg-[#3b82f6]" style={{ height: `${r.total ? (r.mined / r.total) * 100 : 0}%` }} />
              </button>;
            })}
          </div>
          <div className="flex justify-between text-[10px] text-[#94a3b8] mt-1"><span>{rows[0]?.month}</span><span>{rows.at(-1)?.month}</span></div>
        </section>

        <section className="space-y-3" aria-label="Choose what to mine">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2" htmlFor="mining-range">Time range</label>
              <DatePicker.RangePicker id="mining-range" disabled={!!active} className="w-full"
                value={undefined} placeholder={range ? [range.since, range.until] : ['From', 'To']}
                onChange={(_, strings) => setRange(Array.isArray(strings) && strings[0] && strings[1] ? { since: strings[0], until: strings[1] } : null)} />
            </div>
            <div>
              <label className="block text-sm mb-2" htmlFor="mining-model">AI Model</label>
              <Select
                id="mining-model"
                disabled={!!active}
                className="w-full"
                value={selectedModel}
                onChange={setSelectedModel}
                options={aiModels.map(m => ({
                  value: m.model,
                  label: (
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${m.provider === 'anthropic' ? 'bg-purple-500' : m.provider === 'gemini' ? 'bg-sky-500' : 'bg-green-500'}`} />
                      {m.model}
                      {m.isDefault && <span className="text-xs text-[#94a3b8]">(default)</span>}
                    </span>
                  ),
                }))}
                placeholder="Select AI model"
              />
            </div>
          </div>
          {range && <p className="text-xs text-[#94a3b8]" role="status">
            {range.since} → {range.until}: {estimateError ?? (estimate ? `${estimate.inRange} commits, ${estimate.alreadyMined} already mined, ${estimate.toMine} to mine in ${estimate.batchCount} batch${estimate.batchCount === 1 ? '' : 'es'}` : 'Counting…')}
          </p>}
          <div className="flex flex-wrap gap-3">
            <Button type="primary" disabled={!range || !!active || estimate?.toMine === 0 || (aiModels.length > 0 && !selectedModel)} loading={busy}
              onClick={() => range && run(() => startMining(project.id, { mode: 'range', ...range, model: selectedModel } as any), 'Mining started.')}>Mine this range</Button>
            <Button disabled={!!active || fullyMined || (aiModels.length > 0 && !selectedModel)} loading={busy} onClick={() => run(() => startMining(project.id, { mode: 'remaining', model: selectedModel } as any), 'Mining started.')}>
              {overview.mined.count ? `Continue: mine all remaining${overview.remaining ? ` (${overview.remaining})` : ''}` : 'Mine entire history'}
            </Button>
            <Button disabled={!!active} loading={busy} onClick={() => run(() => startScan(project.id), 'Fetching new commits.')}>Check for new commits</Button>
          </div>
          <p className="text-xs text-[#94a3b8]">Commits are analyzed in batches and saved after each one, so you can stop at any time and continue later. Each snapshot is compared with the previous mined snapshot, so mining non-adjacent ranges shows larger changes at the gaps.</p>
        </section>
      </>}
    </div>}
  </Modal>;
}
