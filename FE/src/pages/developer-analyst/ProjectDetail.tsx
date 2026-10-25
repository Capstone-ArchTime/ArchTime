import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Box, GitCommit, Clock, Layers, ArrowRight, SearchCode, Loader2, ExternalLink, FolderGit2 } from 'lucide-react';
import { getMiningOverview, type MiningOverview } from '@/features/mining-api';
import { getSnapshotPage, getWorkspace, nextStep, STATUS_LABELS, structuralChanges, type SnapshotRow, type Workspace } from '@/features/workspace-summary';

const mono = { fontFamily: '"JetBrains Mono", monospace' };
type Loaded = { workspace: Workspace; mining: MiningOverview | null; recent: SnapshotRow[]; latest: SnapshotRow | null };

function Metric({ icon: Icon, value, label }: { icon: React.ElementType; value: React.ReactNode; label: string }) {
  return (
    <div className="bg-[#11161b] border border-[#242527] p-5 flex items-center gap-4">
      <div className="w-12 h-12 bg-[#242527] flex items-center justify-center text-[#f4f4f6] shrink-0"><Icon size={22} aria-hidden="true" /></div>
      <div className="min-w-0">
        <div className="text-xl font-bold font-mono text-[#f4f4f6] truncate" style={mono}>{value}</div>
        <div className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-widest font-bold mt-1" style={mono}>{label}</div>
      </div>
    </div>
  );
}

const ProjectDetail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  // Results are kept with the workspace they belong to, so switching workspaces never shows the previous one.
  const [loaded, setLoaded] = useState<(Loaded & { id: string }) | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const data = loaded && loaded.id === projectId ? loaded : null;
  const error = failure && failure.id === projectId ? failure.message : null;

  const load = useCallback((id: string, signal?: AbortSignal) => {
    // The mining overview and commits are extras: a workspace whose history cannot be read still shows its own fields.
    Promise.all([
      getWorkspace(id, signal),
      getMiningOverview(id, signal).catch(() => null),
      getSnapshotPage(id, { limit: 100, summary: true }, signal).catch(() => null),
      getSnapshotPage(id, { limit: 1 }, signal).catch(() => null),
    ]).then(([workspace, mining, page, latest]) => setLoaded({ id, workspace, mining, recent: page ? structuralChanges(page.rows) : [], latest: latest?.rows[0] ?? null }))
      .catch(err => { if (!signal?.aborted) setFailure({ id, message: err instanceof Error ? err.message : 'Could not load this workspace.' }); });
  }, []);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    load(projectId, controller.signal);
    return () => controller.abort();
  }, [projectId, load]);

  if (!projectId) {
    return (
      <DashboardLayout title="Workspace details">
        <div className="max-w-xl mx-auto mt-16 bg-[#11161b] border border-[#242527] p-8 text-center">
          <FolderGit2 size={28} className="text-[#3b82f6] mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-lg font-bold text-[#f4f4f6] mb-2">Choose a workspace</h2>
          <p className="text-sm text-[#94a3b8] mb-6">Open a workspace from the list to see its repository, mining progress and recent structural changes.</p>
          <Link to="/projects" className="inline-flex h-10 px-5 bg-[#3b82f6] hover:bg-[#60a5fa] text-[#080b0e] font-bold text-xs items-center">Go to workspaces</Link>
        </div>
      </DashboardLayout>
    );
  }

  const w = data?.workspace;
  const q = `projectId=${encodeURIComponent(projectId)}`;
  const step = w ? nextStep(w) : null;
  const mined = data?.mining?.mined;
  const tabs = [
    { label: 'Architecture', to: `/workspace/${encodeURIComponent(projectId)}` },
    { label: 'History', to: `/history?${q}` },
    { label: 'Compare', to: `/compare?${q}` },
    { label: 'Evidence', to: `/evidence?${q}` },
    { label: 'Reports', to: '/reports' },
  ];

  return (
    <DashboardLayout title={w?.name}>
      <div className="max-w-[1400px] mx-auto flex flex-col min-h-0 pb-12">
        {error && (
          <div role="alert" className="border border-[#ef4444]/40 bg-[#ef4444]/5 p-4 text-sm text-[#fca5a5] flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => { setFailure(null); load(projectId); }} className="h-8 px-3 border border-[#ef4444]/40 text-xs font-semibold">Try again</button>
          </div>
        )}
        {!w ? (
          !error && <div className="flex items-center justify-center p-16"><Loader2 size={24} className="animate-spin text-[#3b82f6]" aria-label="Loading workspace" /></div>
        ) : (
          <>
            <div className="shrink-0 space-y-6 pt-2">
              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-mono text-[#94a3b8]" style={mono}>
                  <Link to="/projects" className="hover:text-[#f4f4f6] transition-colors">Workspaces</Link>
                  <span aria-hidden="true">/</span>
                  <span className="text-[#3b82f6]">{w.name}</span>
                </div>
                <h2 className="text-4xl font-bold tracking-tight text-[#f4f4f6] mb-2 break-words">{w.name}</h2>
                <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                  {w.description || 'No description was given when this workspace was created.'}
                </p>
                {w.repoUrl && (
                  <a href={w.repoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono text-[#3b82f6] hover:underline break-all" style={mono}>
                    {w.repoUrl} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              <Metric icon={Layers} value={STATUS_LABELS[w.status]} label="Status" />
              <Metric icon={GitCommit} value={w.totalCommits ?? 'Not scanned'} label="Commits found" />
              <Metric icon={Box} value={mined ? mined.count : '—'} label="Commits mined" />
              <Metric icon={Clock} value={mined?.lastDate ? new Date(mined.lastDate).toLocaleDateString() : '—'} label="Newest mined commit" />
            </div>

            <nav aria-label="Workspace views" className="mt-8 border-b border-[#242527] flex gap-8 overflow-x-auto custom-scrollbar">
              <span aria-current="page" className="pb-3 border-b-2 border-[#3b82f6] text-[#3b82f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap">Overview</span>
              {tabs.map(t => (
                <Link key={t.label} to={t.to} className="pb-3 border-b-2 border-transparent hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs tracking-wider uppercase whitespace-nowrap transition-colors">{t.label}</Link>
              ))}
            </nav>

            <div className="flex flex-col xl:flex-row gap-6 mt-8">
              <div className="flex-[2.5] flex flex-col gap-6 min-w-0">
                {step && (
                  <section aria-labelledby="next-step-title" className="bg-[#11161b] border border-[#3b82f6]/30 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                      <h3 id="next-step-title" className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase mb-1">Next step: {step.label}</h3>
                      <p className="text-xs text-[#94a3b8] leading-relaxed">{step.hint}</p>
                    </div>
                    <Link to={step.to} className="shrink-0 h-9 px-4 bg-[#3b82f6] hover:bg-[#60a5fa] text-[#080b0e] text-xs font-bold flex items-center gap-2">
                      {step.action === 'open' ? 'Open architecture' : 'Go to workspaces'} <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </section>
                )}

                <section aria-labelledby="latest-title" className="bg-[#11161b] border border-[#242527]">
                  <div className="p-4 border-b border-[#242527] bg-[#161d24]">
                    <h3 id="latest-title" className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase">Latest mined revision</h3>
                  </div>
                  {data.latest ? (
                    <div className="p-5 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-mono text-[#3b82f6]" style={mono}><GitCommit size={14} aria-hidden="true" /> {data.latest.hash}</div>
                      <p className="text-sm font-bold text-[#f4f4f6]">{data.latest.title}</p>
                      <p className="text-xs text-[#94a3b8]">{data.latest.author || 'Unknown author'} · {new Date(data.latest.date).toLocaleDateString()}</p>
                      <p className="text-xs text-[#94a3b8]">{data.latest.modules} modules and {data.latest.dependencies} dependencies recorded at this commit.</p>
                      <Link to={`/history?${q}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#3b82f6] hover:underline">View timeline <ArrowRight size={12} aria-hidden="true" /></Link>
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-[#94a3b8]">No commits have been mined yet. Once mining stores a commit, its modules and dependencies show here.</p>
                  )}
                </section>
              </div>

              <div className="flex-1 flex flex-col gap-6 min-w-0">
                <section aria-labelledby="recent-changes-title" className="bg-[#11161b] border border-[#242527] overflow-hidden flex flex-col flex-1">
                  <div className="p-5 border-b border-[#242527] bg-[#161d24]">
                    <h3 id="recent-changes-title" className="text-sm font-bold text-[#f4f4f6] tracking-wide uppercase">Recent structural changes</h3>
                  </div>
                  {data.recent.length ? (
                    <ul className="divide-y divide-[#242527] flex-1">
                      {data.recent.map(c => (
                        <li key={c.id}>
                          <Link to={`/evidence?${q}&commit=${encodeURIComponent(c.hash)}`} className="block p-4 hover:bg-[#242527]/30 transition-colors group">
                            <div className="flex items-center gap-2 mb-1.5 text-[10px] font-mono text-[#94a3b8]" style={mono}>
                              <span className="text-[#ffb03a]">{c.hash}</span>
                              <span>{new Date(c.date).toLocaleDateString()}</span>
                            </div>
                            <div className="text-sm font-bold text-[#f4f4f6] group-hover:text-[#3b82f6] transition-colors line-clamp-2">{c.title}</div>
                            <div className="text-[10px] font-mono text-[#94a3b8] mt-1" style={mono}>+{c.depAdded} / −{c.depRemoved} dependencies</div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-5 text-sm text-[#94a3b8] flex-1">No structural changes found in the mined commits yet.</p>
                  )}
                  <div className="p-4 border-t border-[#242527] bg-[#080b0e]">
                    <Link to={`/evidence?${q}`} className="inline-flex h-9 px-4 items-center justify-center gap-2 text-[10px] font-mono font-bold text-[#94a3b8] border border-[#242527] hover:border-[#5f636b] hover:text-[#f4f4f6] transition-colors uppercase w-full" style={mono}>
                      View all changes <SearchCode size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ProjectDetail;
