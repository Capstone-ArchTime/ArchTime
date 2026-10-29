import { readTokens } from '@/auth/session';
import { getWorkspaces, mayHaveSnapshots, type Workspace } from '@/features/workspace-summary';
import { Link as RouterLink } from 'react-router-dom';
import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
import { API_BASE_URL } from '@/auth/session';
import { Modal } from 'antd';
import { getArchitecture } from '@/features/architecture/api';
import { ROLE_LABEL } from '@/features/architecture/scene';
import { serializeHash } from '@/features/architecture/url-state';
import type { ComponentRole } from '@/features/architecture/types';
import { IMPACT_NOTE, andMore, changeLabel, deltaText, getEvidenceImpact, impactSummary, linkedCommitMissing, linkedEvidence } from '@/features/evidence-bridge';
import type { ComponentChange, EvidenceImpact, PairSample } from '@/features/evidence-bridge';

const monoStyle = { fontFamily: '"JetBrains Mono", monospace' };
const blockTitle = 'text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2';

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
      if (!controller.signal.aborted) setLoaded({ key, state: { status: 'error', message: cause instanceof Error ? cause.message : 'Could not compare this commit.' } });
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
  const color = sign === '+' ? 'text-[#4ade80]' : 'text-[#f87171]';
  return <ul className="space-y-0.5">
    {sample.pairs.map(p => <li key={`${p.source}\u0000${p.target}`} className={`text-[11px] font-mono break-all ${color}`} style={monoStyle}>{sign} {p.source} → {p.target}</li>)}
    {more && <li className="text-[11px] text-[#94a3b8]">{more}</li>}
  </ul>;
}

function ImpactMessage({ state, retry, loading }: { state: ImpactState; retry: () => void; loading: string }) {
  if (state.status === 'loading') return <p role="status" className="text-xs text-[#94a3b8]">{loading}</p>;
  if (state.status === 'error') return <p className="text-xs text-slate-300">Could not compare this commit with the architecture ({state.message}). <button type="button" onClick={retry} className="text-[#93c5fd] underline hover:text-[#bfdbfe]">Try again</button></p>;
  return null;
}

/** Which components this commit's change touched, and what is not in any component. Everything here is inference, and says so. */
function AffectedComponents({ state, projectId, retry }: { state: ImpactState; projectId: string; retry: () => void }) {
  const waiting = <ImpactMessage state={state} retry={retry} loading="Comparing this commit with the one before it…" />;
  if (state.status !== 'done') return waiting;
  const { impact, names } = state;
  const map = `/workspace/${encodeURIComponent(projectId)}${serializeHash({ project: projectId, snapshot: impact.snapshot.id })}`;
  return <div className="space-y-3">
    <p className="text-sm text-[#f4f4f6]">{impactSummary(impact)}</p>
    {impact.hasBaseline && <p className="text-[11px] leading-snug text-[#94a3b8]">Counted as resolved file-to-file imports, so these numbers can differ from the raw import counts in "Evidence Suggests" above.</p>}
    {!impact.grouped && <div className="border border-[#242527] bg-[#080b0e] p-4 text-xs leading-relaxed text-slate-300">
      <p className="font-bold text-[#f4f4f6]">This commit has not been grouped into components yet.</p>
      <p className="mt-1">Group its files in the Architecture Map to see which components it changed.</p>
      <RouterLink to={map} className="mt-2 inline-block text-[#93c5fd] hover:text-[#bfdbfe] hover:underline">Open the Architecture Map for this commit</RouterLink>
    </div>}
    {impact.grouped && !impact.hasBaseline && <p className="text-xs text-[#94a3b8]">This is the first mined commit, so there is no earlier snapshot to compare with.</p>}
    {impact.grouped && impact.hasBaseline && <>
      {impact.components.length === 0
        ? <p className="text-xs text-[#94a3b8]">No component was touched: none of the files or dependencies that changed belong to a component.</p>
        : <ul className="flex flex-wrap gap-2" aria-label="Affected components">{impact.components.map(c => {
          const role = names.get(c.id)?.role;
          return <li key={c.id} className="border border-[#242527] bg-[#080b0e] px-2.5 py-1.5 text-xs">
            <span className="font-bold text-[#f4f4f6]">{nameOf(names, c.id)}</span>
            {role && <span className="ml-2 border border-[#3b82f6]/40 px-1.5 font-mono text-[10px] uppercase text-[#93c5fd]" style={monoStyle}>{ROLE_LABEL[role]}</span>}
            <span className="ml-2 text-[#94a3b8]">{deltaText({ added: c.pairsAdded, removed: c.pairsRemoved }) || 'no dependency change'}</span>
          </li>;
        })}</ul>}
      {impact.unmappedFiles.total > 0 && <details className="text-xs text-slate-300">
        <summary className="cursor-pointer select-none hover:text-white">{impact.unmappedFiles.total} {impact.unmappedFiles.total === 1 ? 'file' : 'files'} in this change belong to no component</summary>
        <ul className="mt-1.5 space-y-0.5 text-[#94a3b8]">
          {impact.unmappedFiles.files.map(f => <li key={f} className="break-all font-mono text-[11px]" style={monoStyle}>{f}</li>)}
          {andMore(impact.unmappedFiles.total, impact.unmappedFiles.files.length) && <li>{andMore(impact.unmappedFiles.total, impact.unmappedFiles.files.length)}</li>}
        </ul>
        <p className="mt-1.5 text-[#94a3b8]">Files this commit deleted have no component in its grouping, so they are listed here too.</p>
      </details>}
      {impact.mapping.stale && <p className="text-xs text-[#fcd34d]">The grouping stored for this commit is out of date, so the components shown may not match its current files.</p>}
    </>}
    <p className="text-[11px] leading-snug text-[#94a3b8]">{IMPACT_NOTE}</p>
  </div>;
}

/** The dependencies between components that this commit added or removed, with the file pairs behind each. */
function ChangedDependencies({ state }: { state: ImpactState }) {
  const note = (text: string) => <p className="text-xs text-[#94a3b8]">{text}</p>;
  if (state.status === 'loading') return note('Loading…');
  if (state.status === 'error') return note('Not available: the comparison above did not load.');
  const { impact, names } = state;
  if (!impact.grouped) return note('Shown once this commit is grouped into components.');
  if (!impact.hasBaseline) return note('The first mined commit has no earlier snapshot, so no change can be shown.');
  const kindWord = (e: ComponentChange) => (e.kind === 'cross' ? 'between components' : e.kind === 'internal' ? 'inside one component' : 'to or from files in no component');
  return <div className="space-y-3">
    {impact.componentEdges.length === 0 && note('This commit added or removed no dependency that touches a component.')}
    {impact.componentEdges.map(e => <div key={e.id} className="border border-[#242527] bg-[#161d24] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-[#f4f4f6]">{changeLabel(e, id => nameOf(names, id))}</span>
        <span className="text-[10px] font-mono uppercase text-[#94a3b8]" style={monoStyle}>{kindWord(e)} · +{e.added.total} / -{e.removed.total}</span>
      </div>
      <div className="mt-2 space-y-1.5"><PairList sample={e.added} sign="+" /><PairList sample={e.removed} sign="-" /></div>
    </div>)}
    {impact.unmappedPairs > 0 && note(`${impact.unmappedPairs} changed ${impact.unmappedPairs === 1 ? 'dependency is' : 'dependencies are'} between files that belong to no component.`)}
    <p className="text-[11px] leading-snug text-[#94a3b8]">Resolved file-to-file imports only. A renamed file counts as one removal and one addition.</p>
  </div>;
}

const Evidence: React.FC = () => {

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
    }).catch(e => { if (!controller.signal.aborted) { setProjectsList([]); setLoadError(e instanceof Error ? e.message : 'Could not load your workspaces.'); } });
    return () => controller.abort();
  }, [location.search]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchEvidences = async () => {
      setLoading(true);
      try {
        const token = readTokens().accessToken;
        const res = await fetch(`${API_BASE_URL}/projects/${selectedProjectId}/evidences?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const eList = data.data?.evidences || [];
          
          // formatting dates for UI
          const formatted = eList.map((e: any) => ({
            ...e,
            date: new Date(e.date).toLocaleString(),
            sourceFiles: e.sourceFiles && e.sourceFiles.length > 0 ? e.sourceFiles : [],
            diffBefore: e.diffBefore || '// No diff recorded',
          }));
          setEvidenceData(formatted);
        } else {
           setEvidenceData([]);
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
        content: '// Diff snippet not found in stored patch'
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161d24] border border-[#242527] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_5px_#3b82f6]"></div>
                <span className="text-[10px] font-mono text-[#93c5fd] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence Observatory</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Changes & Evidence</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Trace architectural changes back to commits, files and dependency evidence.
              </p>

              <div className="mt-6 mb-2 flex items-center gap-4">
                <div className="relative group flex items-center h-10 bg-[#080b0e] border border-[#242527] hover:border-[#5f636b] transition-colors">
                  <FolderKanban size={16} className="text-[#94a3b8] ml-4" />
                  <span className="text-[10px] font-mono text-[#94a3b8] uppercase pl-2" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Workspace:</span>
                  <select 
                    value={selectedProjectId} 
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="appearance-none bg-transparent border-none text-xs font-bold text-[#f4f4f6] pl-2 pr-10 h-full outline-none cursor-pointer w-48"
                  >
                    {projectsList?.length ? projectsList.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#161d24]">{p.name}</option>
                    )) : <option value="" className="bg-[#161d24]">No mined workspaces</option>}
                  </select>
                  <ChevronDown size={14} className="text-[#94a3b8] absolute right-3 pointer-events-none group-hover:text-[#f4f4f6]" />
                </div>
              </div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="flex flex-wrap items-center gap-3 bg-[#11161b] p-3 border border-[#242527]">
            <div className="flex-1 relative min-w-[200px]">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
               <input
                 type="text"
                 aria-label="Search changes"
                 value={search}
                 onChange={event => setSearch(event.target.value)}
                 placeholder="Search changes..."
                 className="w-full bg-[#080b0e] border border-[#242527] h-9 pl-9 pr-9 text-sm text-[#f4f4f6] placeholder-[#5f636b] focus:outline-none focus:border-[#3b82f6]/50 transition-colors"
               />
               {search && (
                 <button 
                   onClick={() => setSearch('')}
                   className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#f4f4f6] transition-colors"
                   aria-label="Clear search"
                 >
                   <X size={14} />
                 </button>
               )}
            </div>
            
            <select aria-label="Filter by change type" value={type} onChange={event => setType(event.target.value)} className="h-10 px-3 bg-[#080b0e] border border-[#242527] text-sm">
              <option value="all">All change types</option>{[...new Set(evidenceData.map(item => item.type))].map(value => <option key={value} value={value as string}>{value as string}</option>)}
            </select>
            <select aria-label="Filter by repository" value={repository} onChange={event => setRepository(event.target.value)} className="h-10 px-3 bg-[#080b0e] border border-[#242527] text-sm">
              <option value="all">All repositories</option>{[...new Set(evidenceData.map(item => item.repository))].map(value => <option key={value} value={value as string}>{value as string}</option>)}
            </select>
          </div>
        </div>

        {/* CHANGE LIST TABLE */}
        <div className="flex-1 bg-[#11161b] border border-[#242527] overflow-hidden flex flex-col relative">
          {loading && (
             <div className="absolute inset-0 bg-[#080b0e]/80 flex items-center justify-center z-10 backdrop-blur-sm">
               <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-[#3b82f6] border-t-transparent animate-spin"></div>
                  <span className="text-xs font-mono text-[#93c5fd]">Loading Evidence...</span>
               </div>
             </div>
          )}

          {!loading && linkedCommitMissing(evidenceData, commitParam) && <p role="status" className="border-b border-[#242527] bg-[#161d24] px-4 py-3 text-xs text-[#fcd34d]">The commit in this link is not among the {evidenceData.length} most recent changes loaded here, so its detail cannot be opened.</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#242527] bg-[#161d24]">
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Change</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Type</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Repository</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commit</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Date</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-wider text-right"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242527]">
                {!loading && !filtered.length && <tr><td colSpan={7} className="p-8 text-center text-sm text-[#94a3b8]" role="status">
                  {loadError ?? (projectsList?.length === 0
                    ? <>No workspace has mined commits yet. Evidence is recorded while commits are mined: <RouterLink to="/projects" className="text-[#93c5fd] hover:underline">go to Workspaces</RouterLink> and choose Manage mining.</>
                    : evidenceData.length === 0 ? 'No architectural changes were recorded for the mined commits of this workspace.' : 'No changes match these filters.')}
                </td></tr>}
                {pagination.items.map((item: any) => (
                  <tr 
                    key={item.id} 
                    className="group hover:bg-[#242527]/30 transition-colors cursor-pointer"
                    onClick={() => setPicked(item)}
                  >
                    <td className="p-4 text-sm font-bold text-[#f4f4f6]">{item.changeTitle}</td>
                    <td className="p-4">
                       <span className="px-2 py-1 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest whitespace-nowrap"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                         {item.type}
                       </span>
                    </td>
                    <td className="p-4 text-xs font-mono text-[#94a3b8]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{item.repository}</td>
                    <td className="p-4 text-xs font-mono text-[#93c5fd] font-bold flex items-center gap-1.5"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <GitCommit size={14} /> {item.commit}
                    </td>
                    <td className="p-4 text-xs font-mono text-[#f4f4f6]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{item.files} files</td>
                    <td className="p-4 text-xs text-[#94a3b8]">{item.date}</td>
                    <td className="p-4 text-right">
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           setPicked(item);
                         }}
                         aria-label={`View evidence for ${item.changeTitle}`}
                         className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#94a3b8] group-hover:text-[#93c5fd] transition-colors uppercase focus:outline-none focus-visible:text-[#93c5fd]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                          View <ArrowRight size={14} />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationBar {...pagination} />
          </div>
        </div>

        {/* EVIDENCE DETAIL DRAWER (SLIDE OVER) */}
        <AnimatePresence>
          {selectedChange && (
            <>
              {/* BACKDROP */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#080b0e]/50 backdrop-blur-sm z-40"
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
                className="absolute top-0 right-0 bottom-0 w-[800px] max-w-[90vw] bg-[#11161b] border-l border-[#242527] shadow-2xl z-50 flex flex-col"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-[#242527] bg-[#161d24] shrink-0">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <span className="px-2 py-1 bg-[#ffb03a]/10 border border-[#ffb03a]/20 text-[#ffb03a] text-[9px] font-mono font-bold uppercase tracking-widest mb-3 inline-block"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        {selectedChange.type}
                      </span>
                      <h3 id="evidence-detail-title" className="text-xl font-bold text-[#f4f4f6] leading-snug">{selectedChange.changeTitle}</h3>
                    </div>
                    <button
                      onClick={closeDrawer}
                      aria-label="Close evidence detail"
                      className="w-8 h-8 bg-[#242527] hover:bg-[#5f636b] text-[#f4f4f6] flex items-center justify-center transition-colors shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  
                  {/* AI Disclaimer */}
                  <div className="bg-[#3b82f6]/5 border border-[#3b82f6]/20 p-4 mt-4">
                     <p className="text-xs text-[#93c5fd] leading-relaxed">
                       <strong className="font-bold tracking-wide uppercase font-mono text-[10px]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence Suggests:</strong><br />
                       Raw import counts found by mining this commit and the one before it. {selectedChange.summary}
                     </p>
                  </div>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  
                  {/* AFFECTED COMPONENTS: what this commit changed, projected on the components of its snapshot (inference) */}
                  <div className="space-y-3">
                    <h4 className={blockTitle} style={monoStyle}>
                       <Layers size={14} /> Affected Components
                    </h4>
                    <AffectedComponents state={impact.state} projectId={selectedProjectId} retry={impact.retry} />
                  </div>

                  {/* EVIDENCE GRID */}
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-[#161d24] border border-[#242527] p-4">
                        <div className="text-[10px] font-mono text-[#94a3b8] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Commit Info</div>
                        <div className="text-sm font-mono font-bold text-[#93c5fd]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{selectedChange.commit}</div>
                        <div className="text-[10px] mt-1 text-[#f4f4f6] truncate" title={selectedChange.diffBefore?.match(/Author:\s*(.*)/)?.[1] || 'Unknown Author'}>
                          {selectedChange.diffBefore?.match(/Author:\s*(.*)/)?.[1] || 'Unknown Author'}
                        </div>
                        <div className="text-[10px] mt-1 text-[#94a3b8]">{selectedChange.date}</div>
                     </div>
                     <div className="bg-[#161d24] border border-[#242527] p-4">
                        <div className="text-[10px] font-mono text-[#94a3b8] mb-2 uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies Drift</div>
                        <div className="text-sm font-bold font-mono"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                           <span className="text-[#22c55e]">+{selectedChange.depsAdded} added</span> / <span className="text-[#ef4444]">-{selectedChange.depsRemoved} removed</span>
                        </div>
                     </div>
                  </div>

                  {/* MODIFIED FILES LIST */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-widest flex items-center gap-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                       <FileCode size={14} /> Modified Files ({selectedChange.files})
                    </h4>
                    
                    <div className="bg-[#11161b] border border-[#242527] overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                       <ul className="divide-y divide-[#242527]">
                         {selectedChange.sourceFiles?.length > 0 ? (
                           selectedChange.sourceFiles.map((file: string, idx: number) => (
                             <li key={idx} className="flex items-center justify-between p-3 hover:bg-[#161d24] transition-colors group">
                                <div className="flex items-center gap-3 truncate">
                                   <FileText size={14} className="text-[#94a3b8]" />
                                   <span className="text-xs font-mono text-[#f4f4f6] truncate" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{file}</span>
                                </div>
                                <button
                                  onClick={() => viewFileDiff(file, selectedChange.diffBefore)}
                                  className="shrink-0 ml-4 px-3 py-1 bg-[#242527] text-[10px] font-mono text-[#94a3b8] group-hover:text-[#93c5fd] transition-colors rounded-sm"
                                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                                >
                                  VIEW DIFF
                                </button>
                             </li>
                           ))
                         ) : (
                           <li className="p-4 text-xs text-[#94a3b8] italic">No file details collected.</li>
                         )}
                       </ul>
                    </div>
                  </div>

                  {/* COMPONENT DEPENDENCIES CHANGED */}
                  <div className="space-y-3 pb-8">
                     <h4 className={blockTitle} style={monoStyle}>
                       <Box size={14} /> Component Dependencies Changed
                     </h4>
                     <ChangedDependencies state={impact.state} />
                  </div>

                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* MODAL FOR INDIVIDUAL FILE DIFF */}
        <Modal
          centered
          title={
            <div className="flex items-center gap-2 text-[#f4f4f6] font-mono text-sm" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              <Code2 size={16} className="text-[#93c5fd]" />
              Diff: {fileDiffModal.filename}
            </div>
          }
          open={fileDiffModal.visible}
          onCancel={() => setFileDiffModal({ visible: false, filename: '', content: '' })}
          footer={null}
          width={900}
          className="dark-modal"
          styles={{
            container: { backgroundColor: '#11161b', border: '1px solid #242527', padding: 0 },
            header: { backgroundColor: '#161d24', borderBottom: '1px solid #242527', padding: '16px', margin: 0 },
            body: { padding: '0' }
          }}
          closeIcon={<X size={18} className="text-[#94a3b8] hover:text-[#f4f4f6]" />}
        >
          <div className="bg-[#080b0e] overflow-x-auto p-4 custom-scrollbar" style={{ maxHeight: '70vh' }}>
            <pre className="text-xs font-mono" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              <code>
                {fileDiffModal.content.split('\n').map((line, idx) => {
                  let textColor = 'text-[#f4f4f6]';
                  let bgColor = 'bg-transparent';
                  
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    textColor = 'text-[#22c55e]'; // green
                    bgColor = 'bg-[#22c55e]/10';
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    textColor = 'text-[#ef4444]'; // red
                    bgColor = 'bg-[#ef4444]/10';
                  } else if (line.startsWith('@@')) {
                    textColor = 'text-[#93c5fd]'; // blue for chunks
                  } else if (line.startsWith('+++') || line.startsWith('---')) {
                    textColor = 'text-[#94a3b8] font-bold'; // gray for headers
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
