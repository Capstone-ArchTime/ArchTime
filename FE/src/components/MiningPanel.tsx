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

type Range = { since: string; until: string };

export default function MiningPanel({ project, open, onClose, onChanged }: { project: { id: string; name: string }; open: boolean; onClose: () => void; onChanged?: () => void }) {
  const { message } = App.useApp();
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
    try { const result = await action(); message.success(success); trackJobs((result as { data?: { jobId?: unknown } } | undefined)?.data?.jobId); await refresh(); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'The request failed.'); }
    finally { setBusy(false); }
  }

  async function mail() {
    setMailing(true);
    try { const { kind, text } = notifyMessage(await notifyFindings(project.id)); message[kind](text, 8); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'The findings could not be e-mailed.', 8); }
    finally { setMailing(false); }
  }

  const fullyMined = overview?.remaining === 0;
  const total = overview?.history?.totalCommits ?? 0;
  const minedPercent = total ? Math.round((minedCount / total) * 100) : 0;
  const needsModel = aiModels.length > 0 && !selectedModel;
  // The stage often repeats the batch line ("Batch 1/1 - 56a9111"); only a different stage (cloning, saving…) is shown.
  const stageNote = active && !(active.kind === 'mine' && /^batch\b/i.test(active.stage)) ? active.stage : '';
  return <Modal open={open} onCancel={onClose} footer={null} width={760} title={`Mining · ${project.name}`} destroyOnHidden>
    {!overview && !error && <div role="status" className="p-10 text-center"><Spin /></div>}
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => refresh()}>Retry</Button>} className="mb-4" />}
    {overview && <div className="space-y-6">

      {/* Where the history stands: the figure first, then a bar of it. */}
      {hasHistory ? <section aria-label="Mining coverage" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-[var(--at-muted)]">
            <span className="text-2xl font-bold text-[var(--at-text)]">{minedCount}</span>
            <span className="text-[var(--at-text)]"> / {total}</span> commits mined
            {overview.remaining ? <span> · {overview.remaining} remaining</span> : null}
          </p>
          <Tag color={fullyMined ? 'green' : minedCount ? 'gold' : 'default'} className="!m-0">{fullyMined ? 'Fully mined' : overview.project.status.toLowerCase()}</Tag>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--at-link)] transition-[width] duration-500" style={{ width: `${minedPercent}%` }} />
        </div>
      </section> : <p className="text-sm text-[var(--at-muted)]">The repository has not been scanned yet.</p>}

      {active && <section role="status" aria-label="Job in progress" className="rounded-xl border border-[var(--at-link)]/30 bg-[var(--at-panel-2)] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-semibold text-[var(--at-text)]"><Loader2 size={16} className="animate-spin text-[var(--at-link)]" aria-hidden="true" />{active.kind === 'scan' ? 'Scanning the repository' : 'Mining in progress'}</span>
          <span className="text-sm font-semibold text-[var(--at-text)]">{active.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--at-link)] transition-[width] duration-500" style={{ width: `${active.progress}%` }} />
        </div>
        <p className="text-sm text-[var(--at-muted)]">
          {active.kind === 'mine' ? describeBatchProgress(active) : active.stage}
          {stageNote && active.kind === 'mine' ? ` · ${stageNote}` : ''}
          {active.failedCommits ? ` · ${active.failedCommits} unreadable` : ''}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--at-muted)]">It runs on the server: you can close this window and keep working.</p>
          <Button danger size="small" loading={busy} onClick={() => run(() => cancelMiningJob(active.id), 'Stopping — finished batches are kept.')}>Stop after current commit</Button>
        </div>
      </section>}

      {!active && overview.lastJob && ['failed', 'cancelled'].includes(overview.lastJob.status) &&
        <Alert type={overview.lastJob.status === 'failed' ? 'error' : 'warning'} showIcon
          title={overview.lastJob.status === 'failed' ? 'The last job failed' : 'The last job was stopped'}
          description={overview.lastJob.error ?? `${overview.lastJob.processed} of ${overview.lastJob.total} commits were analyzed and kept.`} />}

      {!hasHistory && !active && <div><Button type="primary" loading={busy} onClick={() => run(() => startScan(project.id), 'Scan started.')}>Scan repository</Button>
        <p className="text-xs text-[var(--at-muted)] mt-2">Reads the commit history so you can choose what to mine. No source analysis happens yet.</p></div>}

      {hasHistory && <>
        <section aria-label="Commit history by month">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--at-muted)]">
            <span>Commits per month{active ? '' : ' · click a month to select it'}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--at-link)]" />mined</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-white/25 bg-white/10" />not mined</span>
            </span>
          </div>
          <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1 pt-1">
            {rows.map(r => {
              const selected = range && r.month === range.since.slice(0, 7) && r.month === range.until.slice(0, 7);
              return <button key={r.month} type="button" disabled={!!active} aria-pressed={!!selected} aria-label={`${r.month}: ${r.mined} of ${r.total} commits mined`}
                title={`${r.month} · ${r.mined}/${r.total} mined`} onClick={() => setRange(monthBounds(r.month))}
                className={`relative flex-1 min-w-[10px] overflow-hidden rounded-t-md border border-white/15 bg-white/10 transition-colors enabled:hover:border-white/40 disabled:cursor-default ${selected ? 'ring-2 ring-[var(--at-warn)] ring-offset-2 ring-offset-[var(--at-solid)]' : ''}`}
                style={{ height: `${Math.max(6, (r.total / peak) * 100)}%`, opacity: 1 }}>
                <span className="absolute bottom-0 left-0 right-0 bg-[var(--at-link)]" style={{ height: `${r.total ? (r.mined / r.total) * 100 : 0}%` }} />
              </button>;
            })}
          </div>
          <div className="flex justify-between text-[11px] text-[var(--at-muted)] mt-1"><span>{rows[0]?.month}</span><span>{rows.at(-1)?.month}</span></div>
        </section>

        {/* Choosing what to mine: hidden while a job runs (every control would be disabled anyway). */}
        {active ? <p className="text-sm text-[var(--at-muted)]">You can choose more to mine when this job ends.</p> : <section className="space-y-4" aria-label="Choose what to mine">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm mb-2" htmlFor="mining-range">Time range</label>
              <DatePicker.RangePicker id="mining-range" className="w-full"
                value={undefined} placeholder={range ? [range.since, range.until] : ['From', 'To']}
                onChange={(_, strings) => setRange(Array.isArray(strings) && strings[0] && strings[1] ? { since: strings[0], until: strings[1] } : null)} />
            </div>
            <div>
              <label className="block text-sm mb-2" htmlFor="mining-model">AI model</label>
              <Select
                id="mining-model"
                className="w-full"
                value={selectedModel || undefined}
                onChange={setSelectedModel}
                options={aiModels.map(m => ({
                  value: m.model,
                  label: (
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${m.provider === 'anthropic' ? 'bg-purple-500' : m.provider === 'gemini' ? 'bg-sky-500' : 'bg-green-500'}`} />
                      {m.model}
                      {m.isDefault && <span className="text-xs text-[var(--at-muted)]">(default)</span>}
                    </span>
                  ),
                }))}
                placeholder="Select AI model"
              />
            </div>
          </div>
          {range && <p className="text-sm text-[var(--at-muted)]" role="status">
            <span className="text-[var(--at-text)]">{range.since} → {range.until}</span>: {estimateError ?? (estimate ? `${estimate.inRange} commits, ${estimate.alreadyMined} already mined, ${estimate.toMine} to mine in ${estimate.batchCount} batch${estimate.batchCount === 1 ? '' : 'es'}` : 'Counting…')}
          </p>}
          <div className="flex flex-wrap gap-2">
            <Button type="primary" disabled={!range || estimate?.toMine === 0 || needsModel} loading={busy}
              onClick={() => range && run(() => startMining(project.id, { mode: 'range', ...range, model: selectedModel } as any), 'Mining started.')}>Mine this range</Button>
            <Button disabled={fullyMined || needsModel} loading={busy} onClick={() => run(() => startMining(project.id, { mode: 'remaining', model: selectedModel } as any), 'Mining started.')}>
              {overview.mined.count ? `Continue: mine all remaining${overview.remaining ? ` (${overview.remaining})` : ''}` : 'Mine entire history'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Tooltip title="Mines the tagged commits (releases) first, so the architecture at each release is ready early; then every other commit not mined yet.">
              <Button type="link" className="!px-0" disabled={fullyMined || needsModel} loading={busy}
                onClick={() => run(() => startMining(project.id, { mode: 'milestones', model: selectedModel }), 'Mining releases first.')}>Releases first, then the rest</Button>
            </Tooltip>
            <Button type="link" className="!px-0" loading={busy} onClick={() => run(() => startScan(project.id), 'Fetching new commits.')}>Check for new commits</Button>
          </div>
          <Details bodyClassName="text-xs">
            <p>Commits are analyzed in batches and saved after each one, so you can stop at any time and continue later. Each snapshot is compared with the previous mined snapshot, so mining non-adjacent ranges shows larger changes at the gaps.</p>
          </Details>
        </section>}

        {overview.mined.count > 0 && <section aria-label="Conformance findings" className="border-t border-[var(--at-line)] pt-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Conformance findings</h3>
            <p className="text-xs text-[var(--at-muted)] mt-1">Where mined commits break the confirmed component diagram.</p>
            <Details className="mt-1" bodyClassName="text-xs"><p>Once the component diagram is confirmed, every mined commit is checked against it, and new findings are e-mailed to the owner and maintainers. Send them now, or open them to decide.</p></Details>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Mail size={14} />} loading={mailing} disabled={!!active} onClick={mail}>E-mail new findings</Button>
            <Link to={`/project-maintainer/conformance?project=${encodeURIComponent(project.id)}`} onClick={onClose}><Button>Open findings</Button></Link>
          </div>
        </section>}
      </>}
    </div>}
  </Modal>;
}
