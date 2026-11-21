import { apiRequest } from '@/api/client';
import { getWorkspaces, mayHaveSnapshots, type Workspace } from '@/features/workspace-summary';
import { Link as RouterLink } from 'react-router-dom';
import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Details } from '@/components/PageHeader';
import {
  Search,
  ArrowRight,
  Box,
  Layers,
  GitCommit,
  X,
  Code2,
  FileCode,
  FolderKanban,
  ChevronDown,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { Modal } from 'antd';
import { getArchitecture } from '@/features/architecture/api';
import { ROLE_LABEL } from '@/features/architecture/scene';
import { serializeHash } from '@/features/architecture/url-state';
import type { ComponentRole } from '@/features/architecture/types';
import { impactNote, andMore, changeLabel, deltaText, getEvidenceImpact, impactSummary, linkedCommitMissing, linkedEvidence } from '@/features/evidence-bridge';
import type { ComponentChange, EvidenceImpact, PairSample } from '@/features/evidence-bridge';
import { translateOr } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, message, useMessages } from '@/i18n/define';
import type { Params } from '@/i18n';

const MSG = defineMessages({
  compareFailed: 'Could not compare this commit.', impactError: 'Could not compare this commit with the architecture ({reason}).', tryAgain: 'Try again',
  comparingCommit: 'Comparing this commit with the one before it…', notGrouped: 'Not grouped into components yet.', groupIt: 'Group it in the Architecture Map',
  firstCommit: 'This is the first mined commit, so there is no earlier snapshot to compare with.',
  noneTouched: 'No component was touched: none of the files or dependencies that changed belong to a component.', affected: 'Affected components', noDepChange: 'no dependency change',
  unmapped: '{count} files in this change belong to no component', unmapped_one: '1 file in this change belongs to no component',
  deletedFiles: 'Files this commit deleted have no component in its grouping, so they are listed here too.',
  staleGrouping: 'The grouping stored for this commit is out of date, so the components shown may not match its current files.',
  resolvedNote: 'Dependencies are counted as resolved file-to-file imports, so these numbers can differ from the raw import counts at the top.',
  loading: 'Loading…', notAvailable: 'Not available: the comparison above did not load.', shownOnce: 'Shown once this commit is grouped into components.',
  firstNoChange: 'The first mined commit has no earlier snapshot, so no change can be shown.', between: 'between components', inside: 'inside one component', noComponent: 'to or from files in no component',
  noDeps: 'This commit added or removed no dependency that touches a component.',
  unmappedPairs: '{count} changed dependencies are between files that belong to no component.', unmappedPairs_one: '1 changed dependency is between files that belong to no component.',
  resolvedOnly: 'Resolved file-to-file imports only. A renamed file counts as one removal and one addition.',
  unknownAuthor: 'Unknown author', loadFailed: 'Could not load your workspaces.', noDiff: '// No diff recorded', snippetMissing: '// Diff snippet not found in stored patch',
  title: 'Changes & Evidence', intro: 'Each architectural change and the commits behind it.', workspace: 'Workspace:', noMined: 'No mined workspaces',
  search: 'Search changes', searchPlaceholder: 'Search changes...', clearSearch: 'Clear search', filterType: 'Filter by change type', allTypes: 'All change types',
  filterRepo: 'Filter by repository', allRepos: 'All repositories', loadingEvidence: 'Loading Evidence...',
  linkMissing: 'The commit in this link is not among the {n} most recent changes loaded here, so its detail cannot be opened.',
  change: 'Change', type: 'Type', repository: 'Repository', commit: 'Commit', files: 'Files', date: 'Date', action: 'Action',
  noWorkspace: 'No workspace has mined commits yet. Evidence is recorded while commits are mined: {link} and choose Mining.', goWorkspaces: 'go to Workspaces',
  noChanges: 'No architectural changes were recorded for the mined commits of this workspace.', noMatch: 'No changes match these filters.',
  fileCount: '{count} files', fileCount_one: '1 file', viewFor: 'View evidence for {title}', view: 'View', closeDetail: 'Close evidence detail',
  depsAdded: '+{n} dependencies added', depsRemoved: '−{n} removed', rawCounts: 'Raw import counts found by mining this commit and the one before it.',
  modified: 'Modified files ({n})', viewDiff: 'View diff', noFileDetails: 'No file details were collected for this commit.', depsChanged: 'Component dependencies changed', diff: 'Diff: {file}',
}, {
  compareFailed: 'Không so sánh được commit này.', impactError: 'Không so sánh được commit này với kiến trúc ({reason}).', tryAgain: 'Thử lại',
  comparingCommit: 'Đang so sánh commit này với commit trước…', notGrouped: 'Chưa được nhóm thành thành phần.', groupIt: 'Nhóm trong Bản đồ kiến trúc',
  firstCommit: 'Đây là commit đầu tiên đã mining, nên không có ảnh chụp trước để so sánh.',
  noneTouched: 'Không thành phần nào bị ảnh hưởng: không tệp hay phụ thuộc nào thay đổi thuộc về một thành phần.', affected: 'Thành phần bị ảnh hưởng', noDepChange: 'không đổi phụ thuộc',
  unmapped: '{count} tệp trong thay đổi này không thuộc thành phần nào',
  deletedFiles: 'Các tệp commit này xoá không có thành phần trong cách nhóm của nó, nên cũng được liệt kê ở đây.',
  staleGrouping: 'Cách nhóm lưu cho commit này đã cũ, nên các thành phần hiển thị có thể không khớp với tệp hiện tại.',
  resolvedNote: 'Phụ thuộc được đếm theo import tệp-tới-tệp đã phân giải, nên các con số này có thể khác số import thô ở trên.',
  loading: 'Đang tải…', notAvailable: 'Không có: phần so sánh phía trên chưa tải được.', shownOnce: 'Sẽ hiển thị khi commit này được nhóm thành thành phần.',
  firstNoChange: 'Commit đầu tiên đã mining không có ảnh chụp trước, nên không hiển thị được thay đổi.', between: 'giữa các thành phần', inside: 'trong một thành phần', noComponent: 'tới hoặc từ tệp không thuộc thành phần nào',
  noDeps: 'Commit này không thêm hay xoá phụ thuộc nào liên quan tới thành phần.',
  unmappedPairs: '{count} phụ thuộc thay đổi nằm giữa các tệp không thuộc thành phần nào.',
  resolvedOnly: 'Chỉ tính import tệp-tới-tệp đã phân giải. Tệp đổi tên được tính là một lần xoá và một lần thêm.',
  unknownAuthor: 'Không rõ tác giả', loadFailed: 'Không tải được các không gian làm việc của bạn.', noDiff: '// Không có diff được ghi lại', snippetMissing: '// Không tìm thấy đoạn diff trong bản vá đã lưu',
  title: 'Thay đổi & Bằng chứng', intro: 'Mỗi thay đổi kiến trúc và các commit đứng sau nó.', workspace: 'Không gian làm việc:', noMined: 'Chưa có không gian làm việc nào đã mining',
  search: 'Tìm thay đổi', searchPlaceholder: 'Tìm thay đổi...', clearSearch: 'Xoá tìm kiếm', filterType: 'Lọc theo loại thay đổi', allTypes: 'Mọi loại thay đổi',
  filterRepo: 'Lọc theo repository', allRepos: 'Mọi repository', loadingEvidence: 'Đang tải bằng chứng...',
  linkMissing: 'Commit trong liên kết này không nằm trong {n} thay đổi gần nhất được tải ở đây, nên không mở được chi tiết.',
  change: 'Thay đổi', type: 'Loại', repository: 'Repository', commit: 'Commit', files: 'Tệp', date: 'Ngày', action: 'Thao tác',
  noWorkspace: 'Chưa có không gian làm việc nào có commit đã mining. Bằng chứng được ghi lại trong lúc mining: {link} rồi chọn Mining.', goWorkspaces: 'tới Không gian làm việc',
  noChanges: 'Không có thay đổi kiến trúc nào được ghi lại cho các commit đã mining của không gian làm việc này.', noMatch: 'Không có thay đổi nào khớp bộ lọc.',
  fileCount: '{count} tệp', viewFor: 'Xem bằng chứng cho {title}', view: 'Xem', closeDetail: 'Đóng chi tiết bằng chứng',
  depsAdded: '+{n} phụ thuộc được thêm', depsRemoved: '−{n} bị xoá', rawCounts: 'Số import thô tìm được khi mining commit này và commit trước nó.',
  modified: 'Tệp đã sửa ({n})', viewDiff: 'Xem diff', noFileDetails: 'Không thu thập được chi tiết tệp cho commit này.', depsChanged: 'Phụ thuộc giữa thành phần đã thay đổi', diff: 'Diff: {file}',
});
const tx = (key: Parameters<typeof message<typeof MSG.en>>[1], params?: Params) => message(MSG, key, params);

const monoStyle = { fontFamily: 'var(--at-font-mono)' };
const blockTitle = 'text-[11px] font-semibold text-[var(--at-muted)] uppercase tracking-[0.14em] flex items-center gap-2';

type ComponentNames = Map<string, { name: string; role: ComponentRole }>;
type ImpactState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; impact: EvidenceImpact; names: ComponentNames };

/**
 * What one commit changed in components (the evidence impact endpoint), asked when its drawer opens. The names and roles of
 * the components come from the stored grouping of the same snapshot; they are optional, and the ids stand in without them.
 */
function useEvidenceImpact(projectId: string, evidenceId: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; state: ImpactState } | null>(null);
  const key = projectId && evidenceId ? `${projectId}:${evidenceId}:${attempt}` : '';
  useEffect(() => {
    if (!key || !evidenceId) return;
    const controller = new AbortController();
    getEvidenceImpact(projectId, evidenceId, controller.signal).then(impact => {
      if (controller.signal.aborted) return;
      setLoaded({ key, state: { status: 'done', impact, names: new Map() } });
      if (!impact.grouped) return;
      getArchitecture(projectId, impact.snapshot.id, controller.signal).then(payload => {
        if (controller.signal.aborted || !payload.view) return;
        const names: ComponentNames = new Map(payload.view.components.map(c => [c.id, { name: c.name, role: c.role }]));
        setLoaded({ key, state: { status: 'done', impact, names } });
      }).catch(() => { /* names are optional */ });
    }).catch(cause => {
      if (!controller.signal.aborted) setLoaded({ key, state: { status: 'error', message: cause instanceof Error ? cause.message : tx('compareFailed') } });
    });
    return () => controller.abort();
  }, [key, projectId, evidenceId]);
  const state: ImpactState = loaded?.key === key ? loaded.state : { status: 'loading' };
  return { state, retry: () => setAttempt(n => n + 1) };
}

const nameOf = (names: ComponentNames, id: string) => names.get(id)?.name ?? id;

/** One changed dependency list (added or removed): the file pairs as the server listed them, then "and N more". */
function PairList({ sample, sign }: { sample: PairSample; sign: '+' | '-' }) {
  if (!sample.total) return null;
  const more = andMore(sample.total, sample.pairs.length);
  const color = sign === '+' ? 'text-[var(--at-success)]' : 'text-[var(--at-danger)]';
  return <ul className="space-y-0.5">
    {sample.pairs.map(p => <li key={`${p.source}\u0000${p.target}`} className={`text-[11px] font-mono break-all ${color}`} style={monoStyle}>{sign} {p.source} → {p.target}</li>)}
    {more && <li className="text-[11px] text-[var(--at-muted)]">{more}</li>}
  </ul>;
}

function ImpactMessage({ state, retry, loading }: { state: ImpactState; retry: () => void; loading: string }) {
  if (state.status === 'loading') return <p role="status" className="text-xs text-[var(--at-muted)]">{loading}</p>;
  if (state.status === 'error') return <p className="text-xs text-[var(--at-muted)]">{tx('impactError', { reason: state.message })} <button type="button" onClick={retry} className="text-[var(--at-link)] underline hover:text-[var(--at-link-hover)]">{tx('tryAgain')}</button></p>;
  return null;
}

/** Which components this commit's change touched, and what is not in any component. Everything here is inference, and says so. */
function AffectedComponents({ state, projectId, retry }: { state: ImpactState; projectId: string; retry: () => void }) {
  const waiting = <ImpactMessage state={state} retry={retry} loading={tx('comparingCommit')} />;
  if (state.status !== 'done') return waiting;
  const { impact, names } = state;
  const map = `/workspace/${encodeURIComponent(projectId)}${serializeHash({ project: projectId, snapshot: impact.snapshot.id })}`;
  return <div className="space-y-3">
    {impact.grouped
      ? <p className="text-sm text-[var(--at-text)]">{impactSummary(impact)}</p>
      : <p className="text-sm text-[var(--at-text)]">{tx('notGrouped')} <RouterLink to={map} className="text-[var(--at-link)] underline hover:text-[var(--at-link-hover)]">{tx('groupIt')}</RouterLink></p>}
    {impact.grouped && !impact.hasBaseline && <p className="text-xs text-[var(--at-muted)]">{tx('firstCommit')}</p>}
    {impact.grouped && impact.hasBaseline && <>
      {impact.components.length === 0
        ? <p className="text-xs text-[var(--at-muted)]">{tx('noneTouched')}</p>
        : <ul className="flex flex-wrap gap-2" aria-label={tx('affected')}>{impact.components.map(c => {
          const role = names.get(c.id)?.role;
          return <li key={c.id} className="border border-[var(--at-line)] bg-[var(--at-page)] px-2.5 py-1.5 text-xs">
            <span className="font-bold text-[var(--at-text)]">{nameOf(names, c.id)}</span>
            {role && <span className="ml-2 border border-[var(--at-accent)]/40 px-1.5 font-mono text-[10px] uppercase text-[var(--at-link)]" style={monoStyle}>{translateOr(`archRole.${role}`, ROLE_LABEL[role])}</span>}
            <span className="ml-2 text-[var(--at-muted)]">{deltaText({ added: c.pairsAdded, removed: c.pairsRemoved }) || tx('noDepChange')}</span>
          </li>;
        })}</ul>}
      {impact.unmappedFiles.total > 0 && <details className="text-xs text-[var(--at-muted)]">
        <summary className="cursor-pointer select-none hover:text-[var(--at-text-strong)]">{tx('unmapped', { count: impact.unmappedFiles.total })}</summary>
        <ul className="mt-1.5 space-y-0.5 text-[var(--at-muted)]">
          {impact.unmappedFiles.files.map(f => <li key={f} className="break-all font-mono text-[11px]" style={monoStyle}>{f}</li>)}
          {andMore(impact.unmappedFiles.total, impact.unmappedFiles.files.length) && <li>{andMore(impact.unmappedFiles.total, impact.unmappedFiles.files.length)}</li>}
        </ul>
        <p className="mt-1.5 text-[var(--at-muted)]">{tx('deletedFiles')}</p>
      </details>}
      {impact.mapping.stale && <p className="text-xs text-[var(--at-warn)]">{tx('staleGrouping')}</p>}
    </>}
    <Details bodyClassName="text-xs">
      <p>{impactNote()}</p>
      {impact.hasBaseline && <p>{tx('resolvedNote')}</p>}
    </Details>
  </div>;
}

/** The dependencies between components that this commit added or removed, with the file pairs behind each. */
function ChangedDependencies({ state }: { state: ImpactState }) {
  const note = (text: string) => <p className="text-xs text-[var(--at-muted)]">{text}</p>;
  if (state.status === 'loading') return note(tx('loading'));
  if (state.status === 'error') return note(tx('notAvailable'));
  const { impact, names } = state;
  if (!impact.grouped) return note(tx('shownOnce'));
  if (!impact.hasBaseline) return note(tx('firstNoChange'));
  const kindWord = (e: ComponentChange) => (e.kind === 'cross' ? tx('between') : e.kind === 'internal' ? tx('inside') : tx('noComponent'));
  return <div className="space-y-3">
    {impact.componentEdges.length === 0 && note(tx('noDeps'))}
    {impact.componentEdges.map(e => <div key={e.id} className="border border-[var(--at-line)] bg-[var(--at-panel-2)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-[var(--at-text)]">{changeLabel(e, id => nameOf(names, id))}</span>
        <span className="text-[10px] font-mono uppercase text-[var(--at-muted)]" style={monoStyle}>{kindWord(e)} · +{e.added.total} / -{e.removed.total}</span>
      </div>
      <div className="mt-2 space-y-1.5"><PairList sample={e.added} sign="+" /><PairList sample={e.removed} sign="-" /></div>
    </div>)}
    {impact.unmappedPairs > 0 && note(tx('unmappedPairs', { count: impact.unmappedPairs }))}
    <p className="text-[11px] leading-snug text-[var(--at-muted)]">{tx('resolvedOnly')}</p>
  </div>;
}

const Evidence: React.FC = () => {
  const m = useMessages(MSG);
  const location = useLocation();
  const [projectsList, setProjectsList] = useState<Workspace[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [evidenceData, setEvidenceData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // A link with ?commit=<hash> (the Architecture Map's "Changed in commits") opens that commit's drawer as soon as its evidence is
  // loaded. The link is followed from the address while rendering, so a second link while this page is open works too, and
  // closing the drawer remembers which link was closed so it does not open again.
  const commitParam = new URLSearchParams(location.search).get('commit');
  const [picked, setPicked] = useState<any | null>(null);
  const [closedLink, setClosedLink] = useState<string | null>(null);
  const selectedChange = picked ?? linkedEvidence(evidenceData, commitParam, closedLink);
  const [fileDiffModal, setFileDiffModal] = useState<{ visible: boolean, filename: string, content: string }>({
    visible: false,
    filename: '',
    content: ''
  });

  const impact = useEvidenceImpact(selectedProjectId, selectedChange?.id);
  const closeDrawer = useCallback(() => { setPicked(null); setClosedLink(commitParam); }, [commitParam, setPicked, setClosedLink]);
  const drawerRef = useFocusTrap(selectedChange !== null, closeDrawer);
  const commitAuthor: string = selectedChange?.diffBefore?.match(/Author:\s*(.*)/)?.[1] || m('unknownAuthor');
  
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [repository, setRepository] = useState('all');

  useEffect(() => {
    const controller = new AbortController();
    getWorkspaces(controller.signal).then(({ workspaces }) => {
      // Evidence is written while commits are mined, so only workspaces with mined commits can have any.
      const pList = workspaces.filter(mayHaveSnapshots);
      setProjectsList(pList);
      const pId = new URLSearchParams(location.search).get('projectId');
      setSelectedProjectId(pList.find(p => p.id === pId)?.id ?? pList[0]?.id ?? '');
    }).catch(e => { if (!controller.signal.aborted) { setProjectsList([]); setLoadError(e instanceof Error ? e.message : tx('loadFailed')); } });
    return () => controller.abort();
  }, [location.search]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchEvidences = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<{ data?: { evidences?: any[] } }>(`/projects/${selectedProjectId}/evidences?limit=100`);
        {
          const eList = data.data?.evidences || [];
          
          // formatting dates for UI
          const formatted = eList.map((e: any) => ({
            ...e,
            date: formatDateTime(e.date),
            sourceFiles: e.sourceFiles && e.sourceFiles.length > 0 ? e.sourceFiles : [],
            diffBefore: e.diffBefore || tx('noDiff'),
          }));
          setEvidenceData(formatted);
        }
      } catch (e) {
        console.error(e);
        setEvidenceData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEvidences();
  }, [selectedProjectId]);

  const filtered = evidenceData.filter(item =>
    (type === 'all' || item.type === type) && (repository === 'all' || item.repository === repository) &&
    [item.changeTitle, item.summary, item.commit].some(value => value.toLowerCase().includes(search.trim().toLowerCase())));
  
  const pagination = usePagination(filtered, JSON.stringify([search, type, repository, evidenceData]));

  // Helper to extract specific file diff from full patch
  const viewFileDiff = (filename: string, fullPatch: string) => {
    if (!fullPatch) return;
    // Basic extraction logic: split by diff --git
    const chunks = fullPatch.split('diff --git ');
    // Find the chunk for this file
    const fileChunk = chunks.find(chunk => chunk.includes(`b/${filename}`) || chunk.includes(`a/${filename}`));
    
    if (fileChunk) {
      setFileDiffModal({
        visible: true,
        filename,
        content: `diff --git ${fileChunk}`
      });
    } else {
      setFileDiffModal({
        visible: true,
        filename,
        content: m('snippetMissing')
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-6 flex flex-col min-h-[calc(100dvh-140px)] relative">
        
        {/* HEADER */}
        <div className="shrink-0 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[var(--at-text)] mb-2">{m('title')}</h2>
              <p className="text-[var(--at-muted)] text-sm max-w-xl leading-relaxed">
                {m('intro')}
              </p>

              <div className="mt-6 mb-2 flex items-center gap-4">
                <div className="relative group flex items-center h-10 rounded-[10px] bg-[var(--at-panel-2)] border border-[var(--at-line)] hover:border-[var(--at-line-strong)] transition-colors">
                  <FolderKanban size={16} className="text-[var(--at-muted)] ml-4" />
                  <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase pl-2" style={{ fontFamily: 'var(--at-font-mono)' }}>{m('workspace')}</span>
                  <select 
                    value={selectedProjectId} 
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="appearance-none bg-transparent border-none text-xs font-bold text-[var(--at-text)] pl-2 pr-10 h-full outline-none cursor-pointer w-48"
                  >
                    {projectsList?.length ? projectsList.map(p => (
                      <option key={p.id} value={p.id} className="bg-[var(--at-panel-2)]">{p.name}</option>
                    )) : <option value="" className="bg-[var(--at-panel-2)]">{m('noMined')}</option>}
                  </select>
                  <ChevronDown size={14} className="text-[var(--at-muted)] absolute right-3 pointer-events-none group-hover:text-[var(--at-text)]" />
                </div>
              </div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="flex flex-wrap items-center gap-3 bg-[var(--at-panel)] p-3 border border-[var(--at-line)]">
            <div className="flex-1 relative min-w-[200px]">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--at-muted)]" />
               <input
                 type="text"
                 aria-label={m('search')}
                 value={search}
                 onChange={event => setSearch(event.target.value)}
                 placeholder={m('searchPlaceholder')}
                 className="w-full rounded-[10px] bg-[var(--at-panel-2)] border border-[var(--at-line)] h-9 pl-9 pr-9 text-sm text-[var(--at-text)] placeholder-[var(--at-muted)] focus:outline-none focus:border-[var(--at-accent)]/50 transition-colors"
               />
               {search && (
                 <button 
                   onClick={() => setSearch('')}
                   className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--at-muted)] hover:text-[var(--at-text)] transition-colors"
                   aria-label={m('clearSearch')}
                 >
                   <X size={14} />
                 </button>
               )}
            </div>
            
            <select aria-label={m('filterType')} value={type} onChange={event => setType(event.target.value)} className="h-10 px-3 bg-[var(--at-page)] border border-[var(--at-line)] text-sm">
              <option value="all">{m('allTypes')}</option>{[...new Set(evidenceData.map(item => item.type))].map(value => <option key={value} value={value as string}>{value as string}</option>)}
            </select>
            <select aria-label={m('filterRepo')} value={repository} onChange={event => setRepository(event.target.value)} className="h-10 px-3 bg-[var(--at-page)] border border-[var(--at-line)] text-sm">
              <option value="all">{m('allRepos')}</option>{[...new Set(evidenceData.map(item => item.repository))].map(value => <option key={value} value={value as string}>{value as string}</option>)}
            </select>
          </div>
        </div>

        {/* CHANGE LIST TABLE */}
        <div className="flex-1 bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden flex flex-col relative">
          {loading && (
             <div className="absolute inset-0 bg-[var(--at-page)]/80 flex items-center justify-center z-10 backdrop-blur-sm">
               <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--at-accent)] border-t-transparent animate-spin"></div>
                  <span className="text-xs font-mono text-[var(--at-link)]">{m('loadingEvidence')}</span>
               </div>
             </div>
          )}

          {!loading && linkedCommitMissing(evidenceData, commitParam) && <p role="status" className="border-b border-[var(--at-line)] bg-[var(--at-panel-2)] px-4 py-3 text-xs text-[var(--at-warn)]">{m('linkMissing', { n: evidenceData.length })}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[var(--at-line)] bg-[var(--at-panel-2)]">
                  <th className="p-4 text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('change')}</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('type')}</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('repository')}</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('commit')}</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('files')}</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('date')}</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[var(--at-muted)] uppercase tracking-wider text-right"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--at-line)]">
                {!loading && !filtered.length && <tr><td colSpan={7} className="p-8 text-center text-sm text-[var(--at-muted)]" role="status">
                  {loadError ?? (projectsList?.length === 0
                    ? <>{m.rich('noWorkspace', { link: <RouterLink key="l" to="/projects" className="text-[var(--at-link)] hover:underline">{m('goWorkspaces')}</RouterLink> })}</>
                    : evidenceData.length === 0 ? m('noChanges') : m('noMatch'))}
                </td></tr>}
                {pagination.items.map((item: any) => (
                  <tr 
                    key={item.id} 
                    className="group hover:bg-[var(--at-line)]/30 transition-colors cursor-pointer"
                    onClick={() => setPicked(item)}
                  >
                    <td className="p-4 text-sm font-bold text-[var(--at-text)]">{item.changeTitle}</td>
                    <td className="p-4">
                       <span className="px-2 py-1 bg-[var(--at-warn)]/10 border border-[var(--at-warn)]/20 text-[var(--at-warn)] text-[11px] font-mono font-bold uppercase tracking-widest whitespace-nowrap"
            style={{ fontFamily: 'var(--at-font-mono)' }}>
                         {item.type}
                       </span>
                    </td>
                    <td className="p-4 text-xs font-mono text-[var(--at-muted)]"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{item.repository}</td>
                    <td className="p-4 text-xs font-mono text-[var(--at-link)] font-bold flex items-center gap-1.5"
            style={{ fontFamily: 'var(--at-font-mono)' }}>
                       <GitCommit size={14} /> {item.commit}
                    </td>
                    <td className="p-4 text-xs font-mono text-[var(--at-text)]"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('fileCount', { count: item.files })}</td>
                    <td className="p-4 text-xs text-[var(--at-muted)]">{item.date}</td>
                    <td className="p-4 text-right">
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           setPicked(item);
                         }}
                         aria-label={m('viewFor', { title: item.changeTitle })}
                         className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--at-muted)] group-hover:text-[var(--at-link)] transition-colors uppercase focus:outline-none focus-visible:text-[var(--at-link)]"
            style={{ fontFamily: 'var(--at-font-mono)' }}>
                          {m('view')} <ArrowRight size={14} />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationBar {...pagination} />
          </div>
        </div>

        {/* EVIDENCE DETAIL DRAWER (SLIDE OVER), in <body> so it covers the screen whatever its ancestors do */}
        {createPortal(<AnimatePresence>
          {selectedChange && (
            <>
              {/* BACKDROP */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/55 z-40"
                onClick={closeDrawer}
              />

              {/* DRAWER PANEL */}
              <motion.div
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="evidence-detail-title"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 bottom-0 w-[720px] max-w-[92vw] bg-[var(--at-solid)] border-l border-[var(--at-line)] shadow-2xl z-50 flex flex-col"
              >
                {/* Head: what changed, in which commit, by whom, and how much. Explanations stay under "Details". */}
                <div className="px-6 pt-5 pb-4 border-b border-[var(--at-line)] shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="inline-block rounded-full border border-[var(--at-warn)]/40 bg-[var(--at-warn)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--at-warn)]">
                        {selectedChange.type}
                      </span>
                      <h3 id="evidence-detail-title" className="mt-2 text-lg font-bold text-[var(--at-text)] leading-snug break-words">{selectedChange.changeTitle}</h3>
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--at-muted)]">
                        <code className="text-[var(--at-link)]" style={monoStyle}>{selectedChange.commit}</code>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[22rem]" title={commitAuthor}>{commitAuthor}</span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedChange.date}</span>
                      </p>
                    </div>
                    <button
                      onClick={closeDrawer}
                      aria-label={m('closeDetail')}
                      className="w-9 h-9 rounded-full border border-[var(--at-line)] hover:bg-[var(--at-panel-2)] text-[var(--at-text)] flex items-center justify-center transition-colors shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-[var(--at-success)]/10 border border-[var(--at-success)]/30 px-3 py-1 text-[var(--at-success)]">{m('depsAdded', { n: selectedChange.depsAdded })}</span>
                    <span className="rounded-full bg-[var(--at-danger)]/10 border border-[var(--at-danger)]/30 px-3 py-1 text-[var(--at-danger)]">{m('depsRemoved', { n: selectedChange.depsRemoved })}</span>
                    <span className="rounded-full border border-[var(--at-line)] px-3 py-1 text-[var(--at-text)]">{m('fileCount', { count: selectedChange.files })}</span>
                  </div>
                  <Details className="mt-3" bodyClassName="text-xs">
                    <p>{m('rawCounts')} {selectedChange.summary}</p>
                  </Details>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  {/* MODIFIED FILES: the most concrete evidence first */}
                  <section className="space-y-3">
                    <h4 className={blockTitle}><FileCode size={14} /> {m('modified', { n: selectedChange.files })}</h4>
                    {selectedChange.sourceFiles?.length > 0 ? (
                      <ul className="divide-y divide-[var(--at-line)] rounded-xl border border-[var(--at-line)] max-h-[300px] overflow-y-auto custom-scrollbar">
                        {selectedChange.sourceFiles.map((file: string, idx: number) => (
                          <li key={idx} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--at-panel-2)] transition-colors">
                            <span className="flex items-center gap-3 min-w-0">
                              <FileText size={14} className="text-[var(--at-muted)] shrink-0" aria-hidden="true" />
                              <span className="text-xs text-[var(--at-text)] truncate" style={monoStyle} title={file}>{file}</span>
                            </span>
                            <button
                              onClick={() => viewFileDiff(file, selectedChange.diffBefore)}
                              className="shrink-0 rounded-full border border-[var(--at-line)] px-3 py-1 text-xs text-[var(--at-link)] hover:bg-[var(--at-panel-2)] hover:text-[var(--at-link-hover)] transition-colors"
                            >
                              {m('viewDiff')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[var(--at-muted)]">{m('noFileDetails')}</p>
                    )}
                  </section>

                  {/* AFFECTED COMPONENTS: what this commit changed, projected on the components of its snapshot (inference) */}
                  <section className="space-y-3">
                    <h4 className={blockTitle}><Layers size={14} /> {m('affected')}</h4>
                    <AffectedComponents state={impact.state} projectId={selectedProjectId} retry={impact.retry} />
                  </section>

                  {/* COMPONENT DEPENDENCIES CHANGED */}
                  <section className="space-y-3 pb-8">
                    <h4 className={blockTitle}><Box size={14} /> {m('depsChanged')}</h4>
                    <ChangedDependencies state={impact.state} />
                  </section>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>, document.body)}

        {/* MODAL FOR INDIVIDUAL FILE DIFF */}
        <Modal
          centered
          title={
            <div className="flex items-center gap-2 text-[var(--at-text)] font-mono text-sm" style={{ fontFamily: 'var(--at-font-mono)' }}>
              <Code2 size={16} className="text-[var(--at-link)]" />
              {m('diff', { file: fileDiffModal.filename })}
            </div>
          }
          open={fileDiffModal.visible}
          onCancel={() => setFileDiffModal({ visible: false, filename: '', content: '' })}
          footer={null}
          width={900}
          className="dark-modal"
          styles={{
            container: { backgroundColor: 'var(--at-solid)', border: '1px solid var(--at-line)', padding: 0 },
            header: { backgroundColor: 'var(--at-panel-2)', borderBottom: '1px solid var(--at-line)', padding: '16px', margin: 0 },
            body: { padding: '0' }
          }}
          closeIcon={<X size={18} className="text-[var(--at-muted)] hover:text-[var(--at-text)]" />}
        >
          <div className="bg-[var(--at-page)] overflow-x-auto p-4 custom-scrollbar" style={{ maxHeight: '70vh' }}>
            <pre className="text-xs font-mono" style={{ fontFamily: 'var(--at-font-mono)' }}>
              <code>
                {fileDiffModal.content.split('\n').map((line, idx) => {
                  let textColor = 'text-[var(--at-text)]';
                  let bgColor = 'bg-transparent';
                  
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    textColor = 'text-[var(--at-success)]'; // green
                    bgColor = 'bg-[var(--at-success)]/10';
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    textColor = 'text-[var(--at-danger)]'; // red
                    bgColor = 'bg-[var(--at-danger)]/10';
                  } else if (line.startsWith('@@')) {
                    textColor = 'text-[var(--at-link)]'; // blue for chunks
                  } else if (line.startsWith('+++') || line.startsWith('---')) {
                    textColor = 'text-[var(--at-muted)] font-bold'; // gray for headers
                  }
                  
                  return (
                    <div key={idx} className={`px-2 py-0.5 whitespace-pre ${textColor} ${bgColor}`}>
                      {line || ' '}
                    </div>
                  );
                })}
              </code>
            </pre>
          </div>
        </Modal>
        
      </div>
    </DashboardLayout>
  );
};

export default Evidence;
