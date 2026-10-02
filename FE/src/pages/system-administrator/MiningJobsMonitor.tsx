import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Progress, Select, Spin, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { apiRequest } from '@/api/client';
import { parseMiningJobs } from '@/features/mining-jobs';
import { cancelMiningJob } from '@/features/mining-api';
import { describeBatchProgress } from '@/features/mining-coverage';
import type { MiningJob } from '@/features/mining-jobs';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';

export default function MiningJobsMonitor() {
  const [jobs, setJobs] = useState<MiningJob[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [paused, setPaused] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  async function cancel(id: string) {
    setCancelError(null);
    try { await cancelMiningJob(id); setRevision(v => v + 1); }
    catch (cause) { setCancelError(cause instanceof Error ? cause.message : 'Could not cancel this job.'); }
  }
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = parseMiningJobs(await apiRequest('/projects/jobs', { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setJobs(data); setError(null); setUpdated(new Date().toLocaleTimeString());
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load jobs.'); }
      finally { if (!controller.signal.aborted) { setLoading(false); if (!paused) timer = setTimeout(load, 5000); } }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision, paused]);
  const filtered = jobs.filter(j => filter === 'all' || j.status === filter);
  const pagination = usePagination(filtered, filter);
  return <FeaturePage title="Mining Jobs Monitor" description="Monitor repository analysis jobs from the server." demo={false} actions={<div className="flex gap-2"><Button onClick={() => { setLoading(true); setPaused(v => !v); }}>{paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}</Button><Button loading={loading} onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Refresh</Button></div>}>
    {error && <Alert type="error" showIcon title={error} description={updated ? 'The last successfully loaded data remains visible.' : 'Jobs could not be loaded.'} action={<Button onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Retry</Button>} />}
    {cancelError && <Alert type="error" showIcon title={cancelError} closable onClose={() => setCancelError(null)} />}
    <div className="flex flex-wrap gap-3 items-center"><Select className="min-w-44" aria-label="Filter jobs by status" value={filter} onChange={setFilter} options={['all', 'queued', 'running', 'completed', 'failed', 'cancelled'].map(value => ({ value, label: value === 'all' ? 'All jobs' : value }))} /><span className="text-xs text-[#94a3b8]">{jobs.filter(j => j.status === 'running').length} running · {jobs.filter(j => j.status === 'queued').length} queued{updated ? ` · Last updated ${updated}` : ''}</span></div>
    {loading && !updated ? <div role="status" className="p-12 text-center"><Spin /><p>Loading jobs…</p></div> : !filtered.length && !error ? <Empty description="No jobs match this filter" /> : null}
    <div className="space-y-3">{pagination.items.map(job => <article key={job.id} className={featurePanel}>
      <div className="flex flex-wrap justify-between gap-3"><div><Tag color={job.status === 'failed' ? 'red' : job.status === 'completed' ? 'green' : job.status === 'cancelled' ? 'orange' : 'blue'}>{job.status}</Tag><h3 className="font-semibold mt-2">{job.project}</h3><p className="text-xs text-[#94a3b8] mt-2 break-all">{job.id} · Requested by {job.requestedBy} · {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Time not provided'}</p></div>{(job.status === 'queued' || job.status === 'running') && <Button danger onClick={() => cancel(job.id)}>{job.status === 'queued' ? 'Cancel' : 'Stop'}</Button>}</div>
      <p className="text-sm mt-3">{job.stage}{job.kind === 'mine' && job.total > 0 ? ` · ${describeBatchProgress(job)}` : ''}</p><Progress percent={job.progress} status={job.status === 'failed' ? 'exception' : job.status === 'completed' ? 'success' : 'normal'} />{job.error && <p role="alert" className="text-sm text-red-400 break-words">{job.error}</p>}
    </article>)}</div><PaginationBar {...pagination} />
  </FeaturePage>;
}
