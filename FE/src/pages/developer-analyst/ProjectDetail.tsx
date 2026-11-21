import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { backTo } from '@/components/layout/back-link';
import MiningPanel from '@/components/MiningPanel';
import { translateOr } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { defineMessages, message, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load this workspace.', details: 'Workspace details', choose: 'Choose a workspace',
  chooseBody: 'Open a workspace from the list to see its repository, mining progress and recent structural changes.', goWorkspaces: 'Go to workspaces',
  tryAgain: 'Try again', loading: 'Loading workspace', workspaces: 'Workspaces', noDescription: 'No description was given when this workspace was created.',
  status: 'Status', notScanned: 'Not scanned', commitsFound: 'Commits found', commitsMined: 'Commits mined', newest: 'Newest mined commit',
  views: 'Workspace views', overview: 'Overview', architecture: 'Architecture', compare: 'Compare', evidence: 'Evidence', reports: 'Reports',
  nextStep: 'Next step: {label}', openArchitecture: 'Open architecture', scan: 'Scan repository', openMining: 'Open mining',
  latest: 'Latest mined revision', unknownAuthor: 'Unknown author', recorded: '{modules} modules and {dependencies} dependencies recorded at this commit.',
  compareEarlier: 'Compare with an earlier commit', noneMined: 'No commits have been mined yet. Once mining stores a commit, its modules and dependencies show here.',
  recent: 'Recent structural changes', depsChange: '+{added} / −{removed} dependencies', noChanges: 'No structural changes found in the mined commits yet.', viewAll: 'View all changes',
}, {
  loadFailed: 'Không tải được không gian làm việc này.', details: 'Chi tiết không gian làm việc', choose: 'Chọn không gian làm việc',
  chooseBody: 'Mở một không gian làm việc trong danh sách để xem repository, tiến độ mining và các thay đổi cấu trúc gần đây.', goWorkspaces: 'Tới danh sách',
  tryAgain: 'Thử lại', loading: 'Đang tải không gian làm việc', workspaces: 'Không gian làm việc', noDescription: 'Không gian làm việc này chưa có mô tả.',
  status: 'Trạng thái', notScanned: 'Chưa quét', commitsFound: 'Commit tìm thấy', commitsMined: 'Commit đã mining', newest: 'Commit mới nhất đã mining',
  views: 'Các chế độ xem', overview: 'Tổng quan', architecture: 'Kiến trúc', compare: 'So sánh', evidence: 'Bằng chứng', reports: 'Báo cáo',
  nextStep: 'Bước tiếp theo: {label}', openArchitecture: 'Mở kiến trúc', scan: 'Quét repository', openMining: 'Mở Mining',
  latest: 'Phiên bản mới nhất đã mining', unknownAuthor: 'Không rõ tác giả', recorded: 'Ghi nhận {modules} module và {dependencies} phụ thuộc tại commit này.',
  compareEarlier: 'So sánh với một commit trước đó', noneMined: 'Chưa có commit nào được mining. Khi mining lưu một commit, các module và phụ thuộc của nó sẽ hiện ở đây.',
  recent: 'Thay đổi cấu trúc gần đây', depsChange: '+{added} / −{removed} phụ thuộc', noChanges: 'Chưa thấy thay đổi cấu trúc nào trong các commit đã mining.', viewAll: 'Xem mọi thay đổi',
});
import { Box, GitCommit, Clock, Layers, ArrowRight, SearchCode, Loader2, ExternalLink, FolderGit2 } from 'lucide-react';
import { getMiningOverview, type MiningOverview } from '@/features/mining-api';
import { getSnapshotPage, getWorkspace, nextStep, STATUS_LABELS, structuralChanges, type SnapshotRow, type Workspace } from '@/features/workspace-summary';

const mono = { fontFamily: '"JetBrains Mono", monospace' };
type Loaded = { workspace: Workspace; mining: MiningOverview | null; recent: SnapshotRow[]; latest: SnapshotRow | null };

function Metric({ icon: Icon, value, label }: { icon: React.ElementType; value: React.ReactNode; label: string }) {
  return (
    <div className="bg-[var(--at-panel)] border border-[var(--at-line)] p-5 flex items-center gap-4">
      <div className="w-12 h-12 bg-[var(--at-line)] flex items-center justify-center text-[var(--at-text)] shrink-0"><Icon size={22} aria-hidden="true" /></div>
      <div className="min-w-0">
        <div className="text-xl font-bold font-mono text-[var(--at-text)] truncate" style={mono}>{value}</div>
        <div className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-widest font-bold mt-1" style={mono}>{label}</div>
      </div>
    </div>
  );
}

const ProjectDetail: React.FC = () => {
  const m = useMessages(MSG);
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  // Results are kept with the workspace they belong to, so switching workspaces never shows the previous one.
  const [loaded, setLoaded] = useState<(Loaded & { id: string }) | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const data = loaded && loaded.id === projectId ? loaded : null;
  const error = failure && failure.id === projectId ? failure.message : null;
  // Scanning and mining open here, on the workspace itself, instead of sending the person back to the list to find it.
  const [miningOpen, setMiningOpen] = useState(false);

  const load = useCallback((id: string, signal?: AbortSignal) => {
    // The mining overview and commits are extras: a workspace whose history cannot be read still shows its own fields.
    Promise.all([
      getWorkspace(id, signal),
      getMiningOverview(id, signal).catch(() => null),
      getSnapshotPage(id, { limit: 100, summary: true }, signal).catch(() => null),
      getSnapshotPage(id, { limit: 1 }, signal).catch(() => null),
    ]).then(([workspace, mining, page, latest]) => setLoaded({ id, workspace, mining, recent: page ? structuralChanges(page.rows) : [], latest: latest?.rows[0] ?? null }))
      .catch(err => { if (!signal?.aborted) setFailure({ id, message: err instanceof Error ? err.message : message(MSG, 'loadFailed') }); });
  }, []);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    load(projectId, controller.signal);
    return () => controller.abort();
  }, [projectId, load]);

  if (!projectId) {
    return (
      <DashboardLayout title={m('details')}>
        <div className="max-w-xl mx-auto mt-16 bg-[var(--at-panel)] border border-[var(--at-line)] p-8 text-center">
          <FolderGit2 size={28} className="text-[var(--at-link)] mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-lg font-bold text-[var(--at-text)] mb-2">{m('choose')}</h2>
          <p className="text-sm text-[var(--at-muted)] mb-6">{m('chooseBody')}</p>
          <Link to="/projects" className="inline-flex h-10 px-5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-bold text-xs items-center">{m('goWorkspaces')}</Link>
        </div>
      </DashboardLayout>
    );
  }

  const w = data?.workspace;
  const q = `projectId=${encodeURIComponent(projectId)}`;
  const step = w ? nextStep(w) : null;
  const mined = data?.mining?.mined;
  const tabs = [
    { label: m('architecture'), to: `/workspace/${encodeURIComponent(projectId)}` },
    { label: m('compare'), to: `/compare?${q}` },
    { label: m('evidence'), to: `/evidence?${q}` },
    { label: m('reports'), to: '/reports' },
  ];

  return (
    <DashboardLayout title={w?.name}>
      <div className="max-w-[1400px] mx-auto flex flex-col min-h-0 pb-12">
        {error && (
          <div role="alert" className="border border-[var(--at-danger)]/40 bg-[var(--at-danger)]/5 p-4 text-sm text-[var(--at-danger-text)] flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => { setFailure(null); load(projectId); }} className="h-8 px-3 border border-[var(--at-danger)]/40 text-xs font-semibold">{m('tryAgain')}</button>
          </div>
        )}
        {!w ? (
          !error && <div className="flex items-center justify-center p-16"><Loader2 size={24} className="animate-spin text-[var(--at-link)]" aria-label={m('loading')} /></div>
        ) : (
          <>
            <div className="shrink-0 space-y-6 pt-2">
              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-mono text-[var(--at-muted)]" style={mono}>
                  <Link to="/projects" className="hover:text-[var(--at-text)] transition-colors">{m('workspaces')}</Link>
                  <span aria-hidden="true">/</span>
                  <span className="text-[var(--at-link)]">{w.name}</span>
                </div>
                <h2 className="text-4xl font-bold tracking-tight text-[var(--at-text)] mb-2 break-words">{w.name}</h2>
                <p className="text-[var(--at-muted)] text-sm max-w-xl leading-relaxed">
                  {w.description || m('noDescription')}
                </p>
                {w.repoUrl && (
                  <a href={w.repoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono text-[var(--at-link)] hover:underline break-all" style={mono}>
                    {w.repoUrl} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              <Metric icon={Layers} value={translateOr(`status.${w.status}`, STATUS_LABELS[w.status])} label={m('status')} />
              <Metric icon={GitCommit} value={w.totalCommits ?? m('notScanned')} label={m('commitsFound')} />
              <Metric icon={Box} value={mined ? mined.count : '—'} label={m('commitsMined')} />
              <Metric icon={Clock} value={mined?.lastDate ? formatDate(mined.lastDate) : '—'} label={m('newest')} />
            </div>

            <nav aria-label={m('views')} className="mt-8 border-b border-[var(--at-line)] flex gap-8 overflow-x-auto custom-scrollbar">
              <span aria-current="page" className="pb-3 border-b-2 border-[var(--at-accent)] text-[var(--at-link)] font-bold text-xs tracking-wider uppercase whitespace-nowrap">{m('overview')}</span>
              {tabs.map(t => (
                <Link key={t.label} to={t.to} state={backTo(`/project?${q}`, w.name)} className="pb-3 border-b-2 border-transparent hover:border-[var(--at-line-strong)] text-[var(--at-muted)] hover:text-[var(--at-text)] font-bold text-xs tracking-wider uppercase whitespace-nowrap transition-colors">{t.label}</Link>
              ))}
            </nav>

            <div className="flex flex-col xl:flex-row gap-6 mt-8">
              <div className="flex-[2.5] flex flex-col gap-6 min-w-0">
                {step && (
                  <section aria-labelledby="next-step-title" className="bg-[var(--at-panel)] border border-[var(--at-accent)]/30 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                      <h3 id="next-step-title" className="text-sm font-bold text-[var(--at-text)] tracking-wide uppercase mb-1">{m('nextStep', { label: translateOr(`step.${step.id}.label`, step.label) })}</h3>
                      <p className="text-xs text-[var(--at-muted)] leading-relaxed">{translateOr(`step.${step.id}.hint`, step.hint, { count: w.totalCommits ?? 0 })}</p>
                    </div>
                    {step.action === 'open' && <Link to={step.to} className="shrink-0 h-9 px-4 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] text-xs font-bold flex items-center gap-2">
                      {m('openArchitecture')} <ArrowRight size={14} aria-hidden="true" />
                    </Link>}
                    {(step.action === 'scan' || step.action === 'mine') && <button type="button" onClick={() => setMiningOpen(true)} aria-haspopup="dialog"
                      className="shrink-0 h-9 px-4 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] text-xs font-bold flex items-center gap-2">
                      {step.action === 'scan' ? m('scan') : m('openMining')} <ArrowRight size={14} aria-hidden="true" />
                    </button>}
                  </section>
                )}

                <section aria-labelledby="latest-title" className="bg-[var(--at-panel)] border border-[var(--at-line)]">
                  <div className="p-4 border-b border-[var(--at-line)] bg-[var(--at-panel-2)]">
                    <h3 id="latest-title" className="text-sm font-bold text-[var(--at-text)] tracking-wide uppercase">{m('latest')}</h3>
                  </div>
                  {data.latest ? (
                    <div className="p-5 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-mono text-[var(--at-link)]" style={mono}><GitCommit size={14} aria-hidden="true" /> {data.latest.hash}</div>
                      <p className="text-sm font-bold text-[var(--at-text)]">{data.latest.title}</p>
                      <p className="text-xs text-[var(--at-muted)]">{data.latest.author || m('unknownAuthor')} · {formatDate(data.latest.date)}</p>
                      <p className="text-xs text-[var(--at-muted)]">{m('recorded', { modules: data.latest.modules, dependencies: data.latest.dependencies })}</p>
                      <Link to={`/compare?${q}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--at-link)] hover:underline">{m('compareEarlier')} <ArrowRight size={12} aria-hidden="true" /></Link>
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-[var(--at-muted)]">{m('noneMined')}</p>
                  )}
                </section>
              </div>

              <div className="flex-1 flex flex-col gap-6 min-w-0">
                <section aria-labelledby="recent-changes-title" className="bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden flex flex-col flex-1">
                  <div className="p-5 border-b border-[var(--at-line)] bg-[var(--at-panel-2)]">
                    <h3 id="recent-changes-title" className="text-sm font-bold text-[var(--at-text)] tracking-wide uppercase">{m('recent')}</h3>
                  </div>
                  {data.recent.length ? (
                    <ul className="divide-y divide-[var(--at-line)] flex-1">
                      {data.recent.map(c => (
                        <li key={c.id}>
                          <Link to={`/evidence?${q}&commit=${encodeURIComponent(c.hash)}`} className="block p-4 hover:bg-[var(--at-line)]/30 transition-colors group">
                            <div className="flex items-center gap-2 mb-1.5 text-[10px] font-mono text-[var(--at-muted)]" style={mono}>
                              <span className="text-[var(--at-warn)]">{c.hash}</span>
                              <span>{formatDate(c.date)}</span>
                            </div>
                            <div className="text-sm font-bold text-[var(--at-text)] group-hover:text-[var(--at-link)] transition-colors line-clamp-2">{c.title}</div>
                            <div className="text-[10px] font-mono text-[var(--at-muted)] mt-1" style={mono}>{m('depsChange', { added: c.depAdded, removed: c.depRemoved })}</div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-5 text-sm text-[var(--at-muted)] flex-1">{m('noChanges')}</p>
                  )}
                  <div className="p-4 border-t border-[var(--at-line)] bg-[var(--at-page)]">
                    <Link to={`/evidence?${q}`} className="inline-flex h-9 px-4 items-center justify-center gap-2 text-[10px] font-mono font-bold text-[var(--at-muted)] border border-[var(--at-line)] hover:border-[var(--at-line-strong)] hover:text-[var(--at-text)] transition-colors uppercase w-full" style={mono}>
                      {m('viewAll')} <SearchCode size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
      {miningOpen && w && <MiningPanel project={{ id: projectId, name: w.name }} open onClose={() => setMiningOpen(false)} onChanged={() => load(projectId)} />}
    </DashboardLayout>
  );
};

export default ProjectDetail;
