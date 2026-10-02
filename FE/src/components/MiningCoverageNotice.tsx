import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Progress } from 'antd';
import { ACTIVE_STATUSES, getMiningOverview, type MiningOverview } from '@/features/mining-api';
import { coverageRows, describeBatchProgress, formatMissing, summarizeCoverage, unminedBetween } from '@/features/mining-coverage';

const MiningPanel = lazy(() => import('./MiningPanel'));

type Context = 'history' | 'compare' | 'evidence' | 'report';
const SCOPE: Record<Context, string> = {
  history: 'The timeline',
  compare: 'Comparisons',
  evidence: 'Evidence',
  report: 'Reports',
};
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** Tells the user when this page only reflects part of the repository's history. Renders nothing when fully mined. */
export default function MiningCoverageNotice({ project, context, between, onMiningFinished, className }: {
  project: { id: string; name: string } | null;
  context: Context;
  /** Dates of the two revisions being compared; adds how many commits between them were skipped. */
  between?: [string, string];
  onMiningFinished?: () => void;
  className?: string;
}) {
  const [overview, setOverview] = useState<MiningOverview | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const projectId = project?.id ?? '';
  const wasActive = useRef(false);
  const finished = useRef(onMiningFinished);
  useEffect(() => { finished.current = onMiningFinished; }, [onMiningFinished]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return;
    try {
      const next = await getMiningOverview(projectId, signal);
      if (!signal?.aborted) setOverview(next);
    } catch { /* the page works without this notice, so a failed lookup stays silent */ }
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    wasActive.current = false;
    const timer = setTimeout(() => { setOverview(null); void refresh(controller.signal); }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [refresh]);

  const active = overview?.activeJob && ACTIVE_STATUSES.includes(overview.activeJob.status) ? overview.activeJob : null;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => clearInterval(timer);
  }, [active, refresh]);
  useEffect(() => {
    if (wasActive.current && !active) finished.current?.();
    wasActive.current = !!active;
  }, [active]);

  if (!project || !overview) return null;
  const summary = summarizeCoverage(overview);
  if (summary.kind === 'complete' && !active) return null;

  const action = <Button size="small" onClick={() => setPanelOpen(true)}>{summary.kind === 'empty' ? 'Choose what to mine' : 'Manage mining'}</Button>;
  let alert;
  if (active) {
    alert = <Alert type="info" showIcon className={className} action={action} title="Mining in progress"
      description={<div className="space-y-1"><span>{SCOPE[context]} show what has been mined so far and update when the job finishes.</span>
        <Progress percent={active.progress} size="small" status="active" />
        <span className="text-xs">{active.kind === 'mine' ? `${describeBatchProgress(active)} · ` : ''}{active.stage}</span></div>} />;
  } else if (summary.kind === 'empty') {
    alert = <Alert type="info" showIcon className={className} action={action} title="Nothing has been mined for this project yet"
      description="Choose a time range, or the whole history, to build its architecture snapshots." />;
  } else if (summary.kind === 'unknown') {
    alert = <Alert type="warning" showIcon className={className} action={action} title="Mining coverage is unknown"
      description={`${summary.mined} commits are mined, but the repository history has not been scanned, so it is unclear how much is missing.`} />;
  } else if (summary.kind === 'partial') {
    const skipped = between && overview.history ? unminedBetween(coverageRows(overview.history.monthly, overview.mined.monthly), String(between[0]), String(between[1])) : 0;
    const span = summary.firstDate && summary.lastDate ? ` (${day(summary.firstDate)} to ${day(summary.lastDate)})` : '';
    alert = <Alert type="warning" showIcon className={className} action={action}
      title={`Partial data: ${summary.mined} of ${summary.total} commits mined${span}`}
      description={<span>{SCOPE[context]} only reflect mined commits.{summary.missing.length ? ` Not yet mined: ${formatMissing(summary.missing)}.` : ''}{context === 'compare' ? (skipped > 0 ? ` Up to ${skipped} commits between the selected revisions were not mined, so the differences can include their changes.` : ' No unmined commits fall between the selected revisions.') : ''}</span>} />;
  } else {
    return null;
  }

  return <>
    {alert}
    {panelOpen && <Suspense fallback={null}><MiningPanel project={project} open onClose={() => setPanelOpen(false)} onChanged={() => { void refresh(); finished.current?.(); }} /></Suspense>}
  </>;
}
