import { Link } from 'react-router-dom';
import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { FolderGit2, ArrowRight, Loader2, Plus, ScanSearch, Pickaxe, Boxes, Eye } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { byRecent, getRecentJobs, getWorkspaces, nextStep, STATUS_LABELS, workspaceStats, type Workspace, type WorkspaceStats } from '@/features/workspace-summary';
import type { MiningJob } from '@/features/mining-jobs';
import { kindLabel } from '@/features/background-jobs';
import { getMyPaths } from '@/features/onboarding-api';
import { pathToContinue } from '@/features/onboarding-context';
import ContinueLearning from './learning/ContinueLearning';
import { localizeStage, translate, translateOr, useT, type MessageKey } from '@/i18n';
import { formatDate, formatDateTime, formatNumber } from '@/i18n/format';

type Loaded = { workspaces: Workspace[]; jobs: MiningJob[]; stats: WorkspaceStats };

const GET_STARTED: { icon: typeof Plus; title: MessageKey; text: MessageKey }[] = [
  { icon: Plus, title: 'dash.step1.title', text: 'dash.step1.text' },
  { icon: ScanSearch, title: 'dash.step2.title', text: 'dash.step2.text' },
  { icon: Pickaxe, title: 'dash.step3.title', text: 'dash.step3.text' },
  { icon: Boxes, title: 'dash.step4.title', text: 'dash.step4.text' },
];

const panel = 'rounded-2xl border border-[var(--at-line)] bg-[var(--at-panel)]';
const sectionTitle = 'text-base font-semibold text-[var(--at-text)]';

/** Colour of a job's status dot: green done, red failed, honey still going, grey stopped. */
const JOB_DOT: Record<string, string> = { completed: 'bg-[var(--at-success)]', failed: 'bg-[var(--at-danger)]', running: 'bg-[var(--at-warn)] animate-pulse', queued: 'bg-[var(--at-warn)]' };

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date (in the page language). */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return translate('dash.ago.now');
  if (minutes < 60) return translate('dash.ago.minutes', { n: minutes });
  if (minutes < 60 * 24) return translate('dash.ago.hours', { n: Math.round(minutes / 60) });
  if (minutes < 60 * 24 * 7) return translate('dash.ago.days', { n: Math.round(minutes / 1440) });
  return formatDate(iso);
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return <div className="px-5 py-4">
    <p className="text-xs text-[var(--at-muted)]">{label}</p>
    <p className="mt-1 text-2xl font-bold text-[var(--at-text)]">{value === null ? <Loader2 size={20} className="animate-spin" aria-label={translate('common.loading')} /> : formatNumber(value)}</p>
  </div>;
}

const Dashboard: React.FC = () => {
  const t = useT();
  const { user } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    Promise.all([getWorkspaces(signal), getRecentJobs(5, signal)])
      .then(([list, jobs]) => setData({ workspaces: [...list.workspaces].sort(byRecent), jobs: jobs.jobs, stats: workspaceStats(list, jobs) }))
      .catch(err => { if (!signal?.aborted) setError(err instanceof Error ? err.message : translate('dash.loadError')); });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // The learning path to pick up, if any. A failure only leaves the card out: the dashboard is not about learning.
  const [learning, setLearning] = useState<ReturnType<typeof pathToContinue>>(null);
  useEffect(() => {
    const controller = new AbortController();
    getMyPaths(controller.signal).then(paths => setLearning(pathToContinue(paths))).catch(() => { /* no card */ });
    return () => controller.abort();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dash.greeting.morning') : hour < 18 ? t('dash.greeting.afternoon') : t('dash.greeting.evening');
  const displayName = user?.name?.split(' ')[0] || t('dash.greeting.fallbackName');
  const stats = data?.stats;
  const isEmpty = data !== null && data.workspaces.length === 0;
  const metric = (value: number | undefined) => value ?? (error ? 0 : null);

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--at-text)]">{greeting}, <span className="at-script">{displayName}</span></h2>
            <p className="mt-2 text-sm text-[var(--at-muted)]">{t('dash.subtitle')}</p>
          </div>
          {!isEmpty && <Link to="/projects" className="shrink-0 h-10 px-5 rounded-full bg-[var(--at-panel-2)] hover:bg-[var(--at-line)] border border-[var(--at-line)] text-[var(--at-text)] text-sm font-medium transition-colors flex items-center gap-2">
            <FolderGit2 size={16} className="text-[var(--at-link)]" aria-hidden="true" /> {t('dash.openWorkspaces')}
          </Link>}
        </header>

        {error && (
          <div role="alert" className="rounded-xl border border-[var(--at-danger)]/40 bg-[var(--at-danger)]/5 p-4 text-sm text-[var(--at-danger-text)] flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => { setError(null); load(); }} className="h-8 px-3 rounded-full border border-[var(--at-danger)]/40 text-xs font-semibold">{t('common.tryAgain')}</button>
          </div>
        )}

        {learning && <ContinueLearning path={learning.path} others={learning.others} />}

        {isEmpty ? (
          <section aria-labelledby="get-started-title" className={`${panel} p-8`}>
            <h3 id="get-started-title" className="text-xl font-bold text-[var(--at-text)] tracking-tight">{t('dash.getStarted')}</h3>
            <p className="text-sm text-[var(--at-muted)] mt-1 mb-6">{t('dash.getStartedBody')}</p>
            <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
              {GET_STARTED.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex items-start gap-3 rounded-xl border border-[var(--at-line)] p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--at-panel-2)] text-[var(--at-link)]"><Icon size={15} aria-hidden="true" /></span>
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--at-text)]">{i + 1}. {t(title)}</h4>
                    <p className="text-xs text-[var(--at-muted)] mt-0.5">{t(text)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3">
              <Link to="/projects" className="h-10 px-5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-semibold text-sm flex items-center gap-2">
                <Plus size={16} aria-hidden="true" /> {t('dash.createFirst')}
              </Link>
              <Link to="/workspace/sample/shophub" className="h-10 px-5 rounded-full bg-[var(--at-panel-2)] hover:bg-[var(--at-line)] border border-[var(--at-line)] text-[var(--at-text)] text-sm flex items-center gap-2">
                <Eye size={16} className="text-[var(--at-link)]" aria-hidden="true" /> {t('dash.exploreSample')}
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* The four figures in one strip: what you have, how much is mined, and whether anything is running. */}
            <section aria-label={t('dash.summary')} className={`${panel} grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-[var(--at-line)] overflow-hidden`}>
              <Metric label={t('dash.metric.workspaces')} value={metric(stats?.workspaces)} />
              <Metric label={t('dash.metric.mined')} value={metric(stats?.mined)} />
              <Metric label={t('dash.metric.commits')} value={metric(stats?.commitsFound)} />
              <Metric label={t('dash.metric.jobs')} value={metric(stats?.activeJobs)} />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <section aria-labelledby="workspaces-title" className="lg:col-span-2">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 id="workspaces-title" className={sectionTitle}>{t('dash.yourWorkspaces')}</h3>
                  <Link to="/projects" className="text-sm text-[var(--at-link)] hover:underline">{t('dash.viewAll')}</Link>
                </div>
                {data === null ? (
                  !error && <div className="flex items-center justify-center p-8"><Loader2 size={24} className="animate-spin text-[var(--at-link)]" aria-label={t('common.loading')} /></div>
                ) : (
                  <ul className={`${panel} divide-y divide-[var(--at-line)]`}>
                    {data.workspaces.slice(0, 5).map(w => {
                      const step = nextStep(w);
                      return (
                        <li key={w.id} className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-3 px-5 py-4">
                          <div className="w-full sm:w-auto sm:flex-1 min-w-0">
                            <Link to={`/project?projectId=${encodeURIComponent(w.id)}`} className="block truncate text-sm font-semibold text-[var(--at-text)] hover:text-[var(--at-link)]">{w.name}</Link>
                            <p className="mt-0.5 text-xs text-[var(--at-muted)]">
                              {translateOr(`status.${w.status}`, STATUS_LABELS[w.status])}{w.totalCommits !== null && ` · ${t('dash.commits', { count: w.totalCommits })}`}
                            </p>
                          </div>
                          <Link to={step.to} title={translateOr(`step.${step.id}.hint`, step.hint, { count: w.totalCommits ?? 0 })} className="shrink-0 self-start sm:self-auto h-9 px-4 rounded-full border border-[var(--at-line)] hover:bg-[var(--at-panel-2)] text-[var(--at-link)] text-sm flex items-center gap-2">
                            {translateOr(`step.${step.id}.label`, step.label)} <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="activity-title">
                <h3 id="activity-title" className={`${sectionTitle} mb-3`}>{t('dash.activity')}</h3>
                {data && data.jobs.length === 0 ? (
                  <p className={`${panel} p-5 text-sm text-[var(--at-muted)]`}>{t('dash.activityEmpty')}</p>
                ) : (
                  <ul className={`${panel} divide-y divide-[var(--at-line)]`}>
                    {data?.jobs.map(job => (
                      <li key={job.id} className="flex items-start gap-3 px-5 py-3">
                        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${JOB_DOT[job.status] ?? 'bg-[var(--at-muted)]'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--at-text)]">{job.project}</p>
                          <p className="truncate text-xs text-[var(--at-muted)]" title={job.error}>
                            <span className="sr-only">{job.status}: </span>{job.kind === 'scan' ? t('dash.job.scan') : job.kind === 'watch' ? kindLabel('watch') : t('dash.job.mining')} · {localizeStage(job.stage)}
                          </p>
                        </div>
                        {job.createdAt && <time dateTime={job.createdAt} title={formatDateTime(job.createdAt)} className="shrink-0 text-xs text-[var(--at-muted)]">{ago(job.createdAt)}</time>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
