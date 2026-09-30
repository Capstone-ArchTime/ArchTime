import SampleDataNotice from '@/components/SampleDataNotice';
import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Activity, Filter, XCircle, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useComingSoon } from '@/hooks/useComingSoon';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { API_BASE_URL } from '@/auth/session';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

type JobStatus = 'running' | 'queued' | 'completed' | 'failed';

const statusMeta: Record<JobStatus, { label: string; color: string; icon: typeof Loader2 }> = {
  running: { label: 'RUNNING', color: '#38bdf8', icon: Loader2 },
  queued: { label: 'QUEUED', color: '#5f636b', icon: Activity },
  completed: { label: 'COMPLETED', color: '#22c55e', icon: CheckCircle2 },
  failed: { label: 'FAILED', color: '#ef4444', icon: AlertTriangle },
};

const mockJobs: { id: string; repo: string; requestedBy: string; status: JobStatus; stage: string; progress: number; startedAgo: string }[] = [];

const filterOptions: { key: 'all' | JobStatus; label: string }[] = [
  { key: 'all', label: 'All Jobs' },
  { key: 'running', label: 'Running' },
  { key: 'queued', label: 'Queued' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

const MiningJobsMonitor: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'all' | JobStatus>('all');
  const notifyComingSoon = useComingSoon();
  const [jobsList, setJobsList] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchJobs = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`${API_BASE_URL}/projects/jobs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setJobsList(data.data.jobs.map((j: any) => ({
            id: j.id,
            repo: j.projectId?.name || 'Unknown Project',
            requestedBy: 'System', // from populated user if we had one
            status: j.status,
            stage: j.stage,
            progress: j.progress,
            startedAgo: new Date(j.createdAt).toLocaleTimeString(),
          })));
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const filtered = jobsList.filter((j) => activeFilter === 'all' || j.status === activeFilter);
  const pagination = usePagination(filtered, activeFilter);
  const runningCount = jobsList.filter((j) => j.status === 'running').length;
  const queuedCount = jobsList.filter((j) => j.status === 'queued').length;

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-8">
        <SampleDataNotice />

        {/* HEADER */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Mining Jobs Monitor</h2>
          <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
            Live status of Git mining and AST extraction jobs across the platform &mdash;{' '}
            <span className="text-[#38bdf8] font-semibold">{runningCount} running</span>,{' '}
            <span className="text-[#94a3b8] font-semibold">{queuedCount} queued</span>.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* FILTERS */}
        <div role="group" aria-label="Filter jobs by status" className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-[#94a3b8] mr-1" />
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              aria-pressed={activeFilter === opt.key}
              onClick={() => setActiveFilter(opt.key)}
              className={`h-8 px-3 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                activeFilter === opt.key
                  ? 'bg-[#38bdf8]/10 border-[#38bdf8]/40 text-[#38bdf8]'
                  : 'bg-[#161d24] border-[#222c37] text-[#94a3b8] hover:text-[#f4f4f6]'
              }`}
              style={{ fontFamily: fontFamily.mono }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* JOB LIST */}
        <div className="space-y-3">
          {pagination.items.map((job) => {
            const meta = statusMeta[job.status];
            const StatusIcon = meta.icon;
            return (
              <div key={job.id} className="bg-[#11161b] border border-[#222c37] p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-2 py-1 border"
                        style={{ fontFamily: fontFamily.mono, color: meta.color, borderColor: `${meta.color}33`, backgroundColor: `${meta.color}1A` }}
                      >
                        <StatusIcon size={11} className={job.status === 'running' ? 'animate-spin motion-reduce:animate-none' : ''} />
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>{job.id}</span>
                    </div>
                    <h4 className="text-[#f4f4f6] font-bold text-sm mb-1" style={{ fontFamily: fontFamily.mono }}>{job.repo}</h4>
                    <div className="text-xs text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                      {job.stage} &middot; requested by {job.requestedBy} &middot; {job.startedAgo}
                    </div>
                  </div>
                  {job.status === 'queued' && (
                    <button
                      onClick={() => notifyComingSoon(`Cancelling ${job.id}`)}
                      className="shrink-0 h-8 px-3 bg-[#161d24] border border-[#222c37] hover:border-[#ef4444]/50 text-[#ef4444] text-[10px] font-bold transition-colors flex items-center gap-1.5" style={{ fontFamily: fontFamily.mono }}>
                      <XCircle size={12} />
                      CANCEL
                    </button>
                  )}
                </div>
                {(job.status === 'running' || job.status === 'failed') && (
                  <div className="h-1.5 w-full bg-[#0b0f14] overflow-hidden">
                    <div
                      className="h-full transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                      style={{ width: `${job.progress}%`, backgroundColor: meta.color }}
                    ></div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-[#94a3b8]">No jobs match this filter.</p>
          )}
        </div>

        <PaginationBar {...pagination} />
        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default MiningJobsMonitor;
