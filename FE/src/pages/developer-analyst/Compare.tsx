import { apiRequest } from '@/api/client';
import { getWorkspaces, mayHaveSnapshots, type Workspace } from '@/features/workspace-summary';
import { Link, useLocation } from 'react-router-dom';
import React, { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  GitCommit,
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  FileDiff,
  Download,
  FolderKanban
} from 'lucide-react';

import { App } from 'antd';
import ComponentMatchPanel from '@/components/compare/ComponentMatchPanel';
import CompareDiagram, { GROUP_HEIGHT, GROUP_WIDTH } from '@/components/compare/CompareDiagram';
import CompareFilesDrawer from '@/components/compare/CompareFilesDrawer';
import { OTHER, buildCompareGraph, compareFiles } from '@/features/compare-graph';
import { layoutGraph } from '@/features/architecture/layout';
import { getComponentMatch } from '@/features/component-matching';
import type { ComponentMatchResult } from '@/features/component-matching';

const Compare: React.FC = () => {
  const { message } = App.useApp();
  const location = useLocation();
  const [projectsList, setProjectsList] = useState<Workspace[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [snapshotsFor, setSnapshotsFor] = useState('');
  const snapshotsLoaded = snapshotsFor === selectedProjectId;
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [baseId, setBaseId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [compareData, setCompareData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [match, setMatch] = useState<{ result: ComponentMatchResult | null; error: string | null; loading: boolean; baseId: string; targetId: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getWorkspaces(controller.signal).then(({ workspaces }) => {
      const pList = workspaces.filter(mayHaveSnapshots);
      setProjectsList(pList);
      const pId = new URLSearchParams(location.search).get('projectId');
      setSelectedProjectId(pList.find(p => p.id === pId)?.id ?? pList[0]?.id ?? '');
    }).catch(e => { if (!controller.signal.aborted) { setProjectsList([]); message.error(e instanceof Error ? e.message : 'Could not load your workspaces.'); } });
    return () => controller.abort();
  }, [location.search, message]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchSnapshots = async () => {
      try {
        const data = await apiRequest<{ data?: { snapshots?: any[] } }>(`/projects/${selectedProjectId}/snapshots`);
        {
          const sList = data.data?.snapshots || [];
          setSnapshots(sList);
          if (sList.length >= 2) {
            setBaseId(sList[sList.length - 1].id); // Oldest as base
            setTargetId(sList[0].id); // Newest as target
          } else if (sList.length === 1) {
            setBaseId(sList[0].id);
            setTargetId(sList[0].id);
          } else {
            setBaseId('');
            setTargetId('');
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSnapshotsFor(selectedProjectId);
      }
    };
    fetchSnapshots();
  }, [selectedProjectId]);

  const handleCompare = async () => {
    if (!selectedProjectId || !baseId || !targetId) {
      message.warning('Please select a workspace and two revisions to compare.');
      return;
    }
    setLoading(true);
    loadMatch(selectedProjectId, baseId, targetId);
    try {
      const data = await apiRequest<{ data?: unknown }>(`/projects/${selectedProjectId}/snapshots/compare?baseId=${encodeURIComponent(baseId)}&targetId=${encodeURIComponent(targetId)}`);
      setCompareData(data.data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to compare revisions.');
    } finally {
      setLoading(false);
    }
  };

  // Component matching runs next to the file comparison; its failure (e.g. no components yet) does not hide the file diff.
  const loadMatch = (projectId: string, base: string, target: string) => {
    if (base === target) {
      setMatch({ result: null, error: 'Choose two different revisions to match their components.', loading: false, baseId: base, targetId: target });
      return;
    }
    setMatch({ result: null, error: null, loading: true, baseId: base, targetId: target });
    getComponentMatch(projectId, base, target)
      .then(result => setMatch(m => (m && m.baseId === base && m.targetId === target ? { ...m, result, loading: false } : m)))
      .catch(err => setMatch(m => (m && m.baseId === base && m.targetId === target ? { ...m, error: err instanceof Error ? err.message : 'Could not match components.', loading: false } : m)));
  };

  const getBaseSnapshot = () => snapshots.find(s => s.id === baseId);
  const getTargetSnapshot = () => snapshots.find(s => s.id === targetId);

  // Both revisions grouped by folder and laid out together, so a folder sits in the same place on both sides.
  const graph = useMemo(() => (compareData ? buildCompareGraph(compareData.baseSnapshot, compareData.targetSnapshot) : null), [compareData]);
  const graphLayout = useMemo(() => (graph ? layoutGraph(graph.groups.map(g => ({ id: g.id, width: GROUP_WIDTH, height: GROUP_HEIGHT })), graph.links.map(l => ({ id: l.id, source: l.source, target: l.target })), { nodeGap: 22, layerGap: 70 }) : null), [graph]);

  // Clicking a folder box lists its files; a file shows its imports before and after.
  const files = useMemo(() => (compareData && graph ? compareFiles(compareData.baseSnapshot, compareData.targetSnapshot, graph.fileGroup) : new Map()), [compareData, graph]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const openFolder = (group: string) => { setOpenGroup(group); setOpenFile(null); };
  const showFile = (path: string | null) => {
    if (path) { const f = files.get(path); if (f) setOpenGroup(f.group); }
    setOpenFile(path);
  };

  const drawing = (side: 'base' | 'target', label: string) => {
    if (!graph || !graphLayout) return <div className="flex h-full items-center justify-center text-sm text-[var(--at-muted)]">Choose two revisions and press Compare.</div>;
    const files = side === 'base' ? graph.totals.baseFiles : graph.totals.targetFiles;
    if (!files) return <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm text-[var(--at-muted)]">No architecture data</p>
      <p className="text-xs text-[var(--at-muted)]">This revision has no recorded files.</p>
    </div>;
    return <CompareDiagram graph={graph} layout={graphLayout} side={side} label={label} selected={openGroup} onOpen={openFolder} />;
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-8 flex flex-col min-h-0">
        
        {/* HEADER */}
        <div className="shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--at-panel-2)] border border-[var(--at-line)] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--at-accent)] shadow-[0_0_5px_#3b82f6]"></div>
            <span className="text-[10px] font-mono text-[var(--at-link)] tracking-wider font-semibold uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Architecture Diff</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--at-text)] mb-2">Compare Architecture</h2>
          <p className="text-[var(--at-muted)] text-sm max-w-xl leading-relaxed">
            Compare two repository revisions and identify structural changes.
          </p>

          <div className="mt-6 mb-2 flex items-center gap-4">
            <div className="relative group flex items-center h-10 bg-[var(--at-page)] border border-[var(--at-line)] hover:border-[#5f636b] transition-colors">
              <FolderKanban size={16} className="text-[var(--at-muted)] ml-4" />
              <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase pl-2" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Workspace:</span>
              <select 
                value={selectedProjectId} 
                onChange={(e) => { setSelectedProjectId(e.target.value); setCompareData(null); setMatch(null); }}
                className="appearance-none bg-transparent border-none text-xs font-bold text-[var(--at-text)] pl-2 pr-10 h-full outline-none cursor-pointer w-48"
              >
                {projectsList?.length ? projectsList.map(p => (
                  <option key={p.id} value={p.id} className="bg-[var(--at-panel-2)]">{p.name}</option>
                )) : <option value="" className="bg-[var(--at-panel-2)]">No mined workspaces</option>}
              </select>
              <ChevronDown size={14} className="text-[var(--at-muted)] absolute right-3 pointer-events-none group-hover:text-[var(--at-text)]" />
            </div>
          </div>
          
          <div className="h-[1px] w-full bg-gradient-to-r from-[var(--at-line)] to-transparent mt-4"></div>
        </div>

        {projectsList?.length === 0 ? (
          <section className="bg-[var(--at-panel)] border border-dashed border-[var(--at-line)] p-10 text-center" aria-labelledby="no-compare-title">
            <h3 id="no-compare-title" className="text-lg font-bold text-[var(--at-text)] mb-2">Nothing to compare yet</h3>
            <p className="text-sm text-[var(--at-muted)] max-w-md mx-auto mb-6">Comparing needs a workspace with at least two mined commits. Create a workspace or mine more of its history.</p>
            <Link to="/projects" className="inline-flex h-10 px-5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-bold text-xs items-center">Go to workspaces</Link>
          </section>
        ) : <>
        {snapshotsLoaded && snapshots.length < 2 && (
          <p role="status" className="bg-[var(--at-panel)] border border-[var(--at-line)] p-4 text-sm text-[var(--at-muted)]">
            This workspace has {snapshots.length === 0 ? 'no mined commits' : 'only one mined commit'}. Mine more of its history from <Link to="/projects" className="text-[var(--at-link)] hover:underline">Workspaces</Link> to compare two revisions.
          </p>
        )}
        {/* REVISION SELECTORS */}
        <div className="flex flex-col md:flex-row items-stretch gap-4 shrink-0">
          
          {/* BASE REVISION */}
          <div className="flex-1 bg-[var(--at-panel)] border border-[var(--at-line)] p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCommit size={64} className="text-[var(--at-muted)]" />
            </div>
            <h3 className="text-[10px] font-mono font-semibold text-[var(--at-muted)] tracking-widest uppercase mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Base Revision</h3>
            <div className="flex items-center gap-4 relative z-10">
              <select 
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                className="bg-[var(--at-page)] border border-[var(--at-line)] text-lg font-bold text-[var(--at-text)] p-2 outline-none w-full max-w-[250px]"
              >
                {snapshots.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.version || s.hash.substring(0, 7)} ({new Date(s.date).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            {getBaseSnapshot() && (
              <div className="mt-3 text-xs text-[var(--at-muted)]">
                {getBaseSnapshot()?.title}
              </div>
            )}
          </div>

          {/* ARROW & COMPARE BUTTON */}
          <div className="flex flex-col justify-center items-center px-4 gap-2">
            <div className="w-10 h-10 rounded-full bg-[var(--at-panel-2)] border border-[var(--at-line)] flex items-center justify-center text-[var(--at-muted)]">
              <ArrowRightLeft size={18} />
            </div>
            <button 
              onClick={handleCompare}
              disabled={loading || snapshots.length < 2}
              className="px-4 py-1.5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-bold text-[10px] tracking-wider transition-colors shadow-[0_0_10px_rgba(56,189,248,0.15)] uppercase disabled:opacity-50"
            >
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </div>

          {/* TARGET REVISION */}
          <div className="flex-1 bg-[var(--at-panel)] border border-[var(--at-line)] p-5 relative overflow-hidden group border-r-2 border-r-[var(--at-accent)]/50">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCommit size={64} className="text-[var(--at-link)]" />
            </div>
            <h3 className="text-[10px] font-mono font-semibold text-[var(--at-link)] tracking-widest uppercase mb-4"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Target Revision</h3>
            <div className="flex items-center gap-4 relative z-10">
              <select 
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="bg-[var(--at-page)] border border-[var(--at-line)] text-lg font-bold text-[var(--at-text)] p-2 outline-none w-full max-w-[250px]"
              >
                {snapshots.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.version || s.hash.substring(0, 7)} ({new Date(s.date).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            {getTargetSnapshot() && (
              <div className="mt-3 text-xs text-[var(--at-muted)]">
                {getTargetSnapshot()?.title}
              </div>
            )}
          </div>
          
        </div>

        {/* SUMMARY METRICS */}
        {compareData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[var(--at-muted)] tracking-widest uppercase mb-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Modules</h4>
              <div className="text-xl font-bold font-mono flex items-center gap-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                <span className="text-[#22c55e]">+{compareData.diff.nodesAdded.length}</span>
                <span className="text-[var(--at-muted)]">/</span>
                <span className="text-[#ef4444]">-{compareData.diff.nodesRemoved.length}</span>
              </div>
            </div>
            
            <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[var(--at-muted)] tracking-widest uppercase mb-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependencies</h4>
              <div className="flex items-center gap-2 text-xl font-bold font-mono"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                <span className="text-[#22c55e]">+{compareData.diff.edgesAdded.length}</span>
                <span className="text-[var(--at-muted)]">/</span>
                <span className="text-[#ef4444]">-{compareData.diff.edgesRemoved.length}</span>
              </div>
            </div>

            <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[var(--at-muted)] tracking-widest uppercase mb-2"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Files</h4>
              <div className="text-xl font-bold text-[var(--at-text)] flex items-center gap-2">
                {compareData.targetSnapshot.files} <span className="text-xs font-sans text-[var(--at-muted)] font-normal">total in target</span>
              </div>
            </div>

            <div className="bg-[var(--at-panel-2)] border border-[var(--at-warn)]/30 p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute inset-0 bg-[var(--at-warn)]/5 pointer-events-none"></div>
              <h4 className="text-[10px] font-mono font-semibold text-[var(--at-warn)] tracking-widest uppercase mb-2 z-10"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Arch Changes</h4>
              <div className="text-xl font-bold font-mono text-[var(--at-warn)] flex items-center gap-1 z-10"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                {compareData.diff.nodesAdded.length + compareData.diff.nodesRemoved.length + compareData.diff.edgesAdded.length + compareData.diff.edgesRemoved.length > 0 ? 'Detected' : 'None'}
              </div>
            </div>
          </div>
        )}

        {match && (
          <ComponentMatchPanel projectId={selectedProjectId} baseId={match.baseId} targetId={match.targetId} result={match.result} error={match.error} loading={match.loading} />
        )}

        {/* SIDE-BY-SIDE GRAPH CONTAINER */}
        <div className="flex flex-col 2xl:flex-row gap-6 shrink-0">
          
          {/* LEFT: BEFORE GRAPH */}
          <div className="flex-1 flex flex-col bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[var(--at-line)] flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#5f636b]"></div>
                <span className="text-xs font-bold text-[var(--at-text)] tracking-wide uppercase">Before</span>
              </div>
              <div className="text-[10px] font-mono text-[var(--at-muted)]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{getBaseSnapshot()?.version || getBaseSnapshot()?.hash.substring(0, 7) || 'Select Base'}</div>
            </div>
            
            <div className="relative w-full h-[420px] p-3">
              {drawing('base', 'Before')}
            </div>
          </div>

          {/* RIGHT: AFTER GRAPH */}
          <div className="flex-1 flex flex-col bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[var(--at-line)] flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--at-accent)] animate-pulse motion-reduce:animate-none shadow-[0_0_8px_#3b82f6]"></div>
                <span className="text-xs font-bold text-[var(--at-text)] tracking-wide uppercase">After</span>
              </div>
              <div className="text-[10px] font-mono text-[var(--at-muted)]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>{getTargetSnapshot()?.version || getTargetSnapshot()?.hash.substring(0, 7) || 'Select Target'}</div>
            </div>
            
            <div className="relative w-full h-[420px] p-3">
              {drawing('target', 'After')}
            </div>
          </div>
          
        </div>

        {/* CHANGE LEGEND */}
        <CompareFilesDrawer group={openGroup} file={openFile} files={files} onFile={showFile} onClose={() => { setOpenGroup(null); setOpenFile(null); }} />
        {graph && <p className="text-center text-xs text-[var(--at-muted)]">
          Click a folder to see its files. Files grouped by folder{graph.depth > 1 ? ` (${graph.depth} levels deep)` : ''}; arrows are imports between folders, thicker for more imports.
          {graph.folded > 0 ? ` The ${graph.folded} smallest folders share the "${OTHER}" box.` : ''} Dashed outlines are folders that exist only in the other revision.
        </p>}
        <div className="flex flex-wrap items-center justify-center gap-6 py-2">
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#22c55e] shadow-[0_0_5px_#22c55e]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Added</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[#ef4444] shadow-[0_0_5px_#ef4444]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Removed</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[var(--at-muted)]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Unchanged</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[var(--at-warn)]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>Changed</span>
          </div>
        </div>

        {/* CHANGE LIST */}
        {compareData && (
          <div className="shrink-0 space-y-4">
            <h3 className="text-sm font-bold text-[var(--at-text)] tracking-wide uppercase mb-4 flex items-center gap-2">
              <FileDiff size={16} className="text-[var(--at-link)]" />
              Detailed Change Log
            </h3>

            <div className="bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden divide-y divide-[var(--at-line)]">
              
              {compareData.diff.nodesAdded.map((node: any) => (
                <div key={`na-${node.id}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--at-panel-2)]/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#22c55e] text-[9px] font-mono font-bold uppercase tracking-widest"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Added</span>
                    </div>
                    <div className="text-sm font-bold text-[var(--at-text)] mb-1">{node.name}</div>
                    <p className="text-xs text-[var(--at-muted)]">New module introduced in the target revision. This component adds new functionality to the system architecture.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--at-muted)]">Impact</div>
                    <div className="text-sm font-mono text-[#22c55e]">+1 Component</div>
                  </div>
                </div>
              ))}
              
              {compareData.diff.nodesRemoved.map((node: any) => (
                <div key={`nr-${node.id}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--at-panel-2)]/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] text-[9px] font-mono font-bold uppercase tracking-widest"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Module Removed</span>
                    </div>
                    <div className="text-sm font-bold text-[var(--at-text)] mb-1">{node.name}</div>
                    <p className="text-xs text-[var(--at-muted)]">Module was removed or refactored out of the architecture. Check if functionality was merged into other components.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--at-muted)]">Impact</div>
                    <div className="text-sm font-mono text-[#ef4444]">-1 Component</div>
                  </div>
                </div>
              ))}

              {compareData.diff.edgesAdded.map((edge: any, i: number) => {
                const src = compareData.targetSnapshot.nodes.find((n: any) => n.id === edge.source)?.name || edge.source;
                const tgt = compareData.targetSnapshot.nodes.find((n: any) => n.id === edge.target)?.name || edge.target;
                return (
                  <div key={`ea-${i}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--at-panel-2)]/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-[var(--at-accent)]/10 border border-[var(--at-accent)]/20 text-[var(--at-link)] text-[9px] font-mono font-bold uppercase tracking-widest"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependency Added</span>
                        <span className="px-2 py-0.5 bg-[var(--at-panel-2)] border border-[var(--at-line)] text-[var(--at-muted)] text-[9px] font-mono"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>{edge.type || 'imports'}</span>
                      </div>
                      <div className="text-sm font-bold text-[var(--at-text)] mb-1 flex items-center gap-2">{src} <ArrowRight size={14} className="text-[var(--at-link)]" /> {tgt}</div>
                      <p className="text-xs text-[var(--at-muted)]">New dependency relationship established. This may indicate coupling or integration between components.</p>
                    </div>
                  </div>
                );
              })}
              
              {compareData.diff.edgesRemoved.map((edge: any, i: number) => {
                const src = compareData.baseSnapshot.nodes.find((n: any) => n.id === edge.source)?.name || edge.source;
                const tgt = compareData.baseSnapshot.nodes.find((n: any) => n.id === edge.target)?.name || edge.target;
                return (
                  <div key={`er-${i}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--at-panel-2)]/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] text-[9px] font-mono font-bold uppercase tracking-widest"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>Dependency Removed</span>
                        <span className="px-2 py-0.5 bg-[var(--at-panel-2)] border border-[var(--at-line)] text-[var(--at-muted)] text-[9px] font-mono"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>{edge.type || 'imports'}</span>
                      </div>
                      <div className="text-sm font-bold text-[var(--at-text)] mb-1 flex items-center gap-2 line-through opacity-70">{src} <ArrowRight size={14} className="text-[#ef4444]" /> {tgt}</div>
                      <p className="text-xs text-[var(--at-muted)]">Dependency was removed. This may indicate decoupling or refactoring of module relationships.</p>
                    </div>
                  </div>
                );
              })}

            </div>
          </div>
        )}

        {/* BOTTOM CTA */}
        <div className="shrink-0 flex items-center justify-end gap-4 py-8">
           <Link to="/reports" className="h-10 px-5 bg-[var(--at-panel-2)] border border-[var(--at-line)] hover:border-[var(--at-accent)]/50 text-[var(--at-link)] font-bold text-xs transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(56,189,248,0.05)]">
              <Download size={16} />
              GENERATE REPORT
           </Link>
        </div>
        </>}
      </div>
    </DashboardLayout>
  );
};

export default Compare;
