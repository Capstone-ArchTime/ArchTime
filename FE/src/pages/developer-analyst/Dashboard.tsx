import { Link } from 'react-router-dom';
import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { FolderKanban, Activity, GitCommit, Layers, FolderGit2, ArrowRight, Loader2, Plus, ScanSearch, Pickaxe, Boxes, Eye } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { byRecent, getRecentJobs, getWorkspaces, nextStep, STATUS_LABELS, workspaceStats, type Workspace, type WorkspaceStats } from '@/features/workspace-summary';
import type { MiningJob } from '@/features/mining-jobs';

const mono = { fontFamily: '"JetBrains Mono", monospace' };

type Loaded = { workspaces: Workspace[]; jobs: MiningJob[]; stats: WorkspaceStats };

const GET_STARTED = [
  { icon: Plus, title: 'Create a workspace', text: 'Connect a GitHub repository by its URL.' },
  { icon: ScanSearch, title: 'Scan the history', text: 'ArchTime reads the commit list so you can pick what to analyze.' },
  { icon: Pickaxe, title: 'Mine commits', text: 'Analyze a date range or every commit to rebuild each revision.' },
  { icon: Boxes, title: 'Group files into components', text: 'Name the parts of the system and follow how they change.' },
];

function StatCard({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: number | null; note: string }) {
  return (
    <div className="bg-[#161d24] border border-[#242527] p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10"><Icon size={48} className="text-[#f4f4f6]" /></div>
      <h3 className="text-[10px] font-mono font-semibold text-[#94a3b8] tracking-widest uppercase mb-4" style={mono}>{label}</h3>
      <div className="text-4xl font-bold text-[#f4f4f6] mb-1">{value === null ? <Loader2 size={32} className="animate-spin" aria-label="Loading" /> : value}</div>
      <p className="text-xs text-[#94a3b8]">{note}</p>
    </div>
  );
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    Promise.all([getWorkspaces(signal), getRecentJobs(5, signal)])
      .then(([list, jobs]) => setData({ workspaces: [...list.workspaces].sort(byRecent), jobs: jobs.jobs, stats: workspaceStats(list, jobs) }))
      .catch(err => { if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Could not load your workspaces.'); });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.name?.split(' ')[0] || 'there';
  const stats = data?.stats;
  const isEmpty = data !== null && data.workspaces.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10">
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">{greeting}, {displayName}</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Reconstruct and trace how your software architecture evolves across repository history.
              </p>
            </div>
            <Link to="/projects" className="shrink-0 h-10 px-5 bg-[#161d24] hover:bg-[#242527] border border-[#242527] text-[#f4f4f6] font-medium text-xs transition-colors flex items-center gap-2">
              <FolderGit2 size={16} className="text-[#3b82f6]" aria-hidden="true" />
              {isEmpty ? 'Create a workspace' : 'Open workspaces'}
            </Link>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#242527] to-transparent mt-8"></div>
        </div>

        {error && (
          <div role="alert" className="border border-[#ef4444]/40 bg-[#ef4444]/5 p-4 text-sm text-[#fca5a5] flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => { setError(null); load(); }} className="h-8 px-3 border border-[#ef4444]/40 text-xs font-semibold">Try again</button>
          </div>
        )}

        {isEmpty ? (
          <section aria-labelledby="get-started-title" className="bg-[#11161b] border border-[#242527] p-8">
            <h3 id="get-started-title" className="text-xl font-bold text-[#f4f4f6] tracking-tight">Get started</h3>
            <p className="text-sm text-[#94a3b8] mt-1 mb-6 max-w-2xl">You have no workspaces yet. Four steps take a repository from its URL to a component map you can follow through time.</p>
            <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              {GET_STARTED.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="bg-[#161d24] border border-[#242527] p-5">
                  <div className="flex items-center gap-2 mb-3 text-[#3b82f6]">
                    <span className="text-[10px] font-mono font-bold" style={mono}>{String(i + 1).padStart(2, '0')}</span>
                    <Icon size={16} aria-hidden="true" />
                  </div>
                  <h4 className="text-sm font-bold text-[#f4f4f6] mb-1">{title}</h4>
                  <p className="text-xs text-[#94a3b8] leading-relaxed">{text}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3">
              <Link to="/projects" className="h-10 px-5 bg-[#3b82f6] hover:bg-[#60a5fa] text-[#080b0e] font-bold text-xs flex items-center gap-2">
                <Plus size={16} aria-hidden="true" /> Create your first workspace
              </Link>
              <Link to="/workspace/sample/shophub" className="h-10 px-5 bg-[#161d24] hover:bg-[#242527] border border-[#242527] text-[#f4f4f6] text-xs font-medium flex items-center gap-2">
                <Eye size={16} className="text-[#3b82f6]" aria-hidden="true" /> Explore a sample workspace
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={FolderKanban} label="My workspaces" value={stats?.workspaces ?? (error ? 0 : null)} note="Workspaces you can open" />
              <StatCard icon={GitCommit} label="Commits found" value={stats?.commitsFound ?? (error ? 0 : null)} note="Across scanned repositories" />
              <StatCard icon={Layers} label="Mined workspaces" value={stats?.mined ?? (error ? 0 : null)} note="With an architecture history" />
              <StatCard icon={Activity} label="Mining jobs" value={stats?.jobs ?? (error ? 0 : null)} note={stats ? `${stats.activeJobs} queued or running` : 'Scans and mining runs'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <section aria-labelledby="next-steps-title" className="lg:col-span-2">
                <div className="mb-6 flex items-end justify-between">
                  <div>
                    <h3 id="next-steps-title" className="text-xl font-bold text-[#f4f4f6] tracking-tight">Your workspaces</h3>
                    <p className="text-sm text-[#94a3b8] mt-1">Each one shows what to do next.</p>
                  </div>
                  <Link to="/projects" className="text-xs text-[#3b82f6] hover:underline">View all</Link>
                </div>
                {data === null ? (
                  !error && <div className="flex items-center justify-center p-8"><Loader2 size={24} className="animate-spin text-[#3b82f6]" aria-label="Loading" /></div>
                ) : (
                  <ul className="space-y-3">
                    {data.workspaces.slice(0, 5).map(w => {
                      const step = nextStep(w);
                      return (
                        <li key={w.id} className="bg-[#11161b] border border-[#242527] p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <Link to={`/project?projectId=${encodeURIComponent(w.id)}`} className="text-[#f4f4f6] text-sm font-bold hover:text-[#3b82f6] truncate block">{w.name}</Link>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[#94a3b8] mt-1" style={mono}>
                              <span>{STATUS_LABELS[w.status]}</span>
                              {w.totalCommits !== null && <><span aria-hidden="true">•</span><span>{w.totalCommits} commits</span></>}
                            </div>
                            <p className="text-xs text-[#94a3b8] mt-2">{step.hint}</p>
                          </div>
                          <Link to={step.to} className="shrink-0 h-9 px-4 bg-[#161d24] hover:bg-[#242527] border border-[#242527] text-[#3b82f6] text-xs font-semibold flex items-center gap-2">
                            {step.label} <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="recent-jobs-title">
                <div className="mb-6">
                  <h3 id="recent-jobs-title" className="text-xl font-bold text-[#f4f4f6] tracking-tight">Recent mining jobs</h3>
                  <p className="text-sm text-[#94a3b8] mt-1">Scans and mining runs you started.</p>
                </div>
                {data && data.jobs.length === 0 ? (
                  <p className="bg-[#11161b] border border-[#242527] p-6 text-sm text-[#94a3b8]">No jobs yet. Open <Link to="/projects" className="text-[#3b82f6] hover:underline">Workspaces</Link> and choose Manage mining.</p>
                ) : (
                  <ul className="space-y-3">
                    {data?.jobs.map(job => (
                      <li key={job.id} className="bg-[#11161b] border border-[#242527] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#f4f4f6] truncate">{job.project}</span>
                          <span className="text-[10px] font-mono uppercase text-[#94a3b8]" style={mono}>{job.status}</span>
                        </div>
                        <p className="text-xs text-[#94a3b8] mt-1">{job.kind === 'scan' ? 'Scan' : 'Mining'} · {job.stage}</p>
                        {job.createdAt && <p className="text-[10px] font-mono text-[#94a3b8] mt-1" style={mono}>{new Date(job.createdAt).toLocaleString()}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
