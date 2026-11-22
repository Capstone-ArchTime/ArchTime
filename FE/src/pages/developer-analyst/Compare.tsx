import { apiRequest } from '@/api/client';
import { getWorkspaces, mayHaveSnapshots, type Workspace } from '@/features/workspace-summary';
import { Link, useLocation } from 'react-router-dom';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

import { App, Select } from 'antd';
import ComponentMatchPanel from '@/components/compare/ComponentMatchPanel';
import CompareDiagram, { GROUP_HEIGHT, GROUP_WIDTH } from '@/components/compare/CompareDiagram';
import CompareFilesDrawer from '@/components/compare/CompareFilesDrawer';
import { OTHER, buildCompareGraph, layoutCompareGraph, compareFiles } from '@/features/compare-graph';
import { getComponentMatch } from '@/features/component-matching';
import type { ComponentMatchResult } from '@/features/component-matching';
import { formatDate } from '@/i18n/format';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load your workspaces.', pickBoth: 'Please select a workspace and two revisions to compare.', compareFailed: 'Failed to compare revisions.',
  chooseTwo: 'Choose two different revisions to match their components.', matchFailed: 'Could not match components.', pressCompare: 'Choose two revisions and press Compare.',
  noData: 'No architecture data', noFiles: 'This revision has no recorded files.', title: 'Compare', intro: 'What changed in the structure between two revisions.',
  workspace: 'Workspace:', noMined: 'No mined workspaces', nothingTitle: 'Nothing to compare yet',
  nothingBody: 'Comparing needs a workspace with at least two mined commits. Create a workspace or mine more of its history.', goWorkspaces: 'Go to workspaces',
  noCommits: 'This workspace has no mined commits. Mine more of its history from {link} to compare two revisions.',
  oneCommit: 'This workspace has only one mined commit. Mine more of its history from {link} to compare two revisions.', workspaces: 'Workspaces',
  baseRevision: 'Base Revision', baseLabel: 'Base revision', targetRevision: 'Target Revision', targetLabel: 'Target revision', searchRevision: 'Search by version, hash or message',
  comparing: 'Comparing...', compare: 'Compare', modules: 'Modules', dependencies: 'Dependencies', files: 'Files', totalTarget: 'total in target', structural: 'Structural changes',
  changes: '{count} changes', changes_one: '1 change', noChanges: 'No changes', before: 'Before', after: 'After', selectBase: 'Select Base', selectTarget: 'Select Target',
  folderHelp: 'Click a folder to see its files. Files grouped by folder', levels: ' ({n} levels deep)', arrowsHelp: '; arrows are imports between folders, thicker for more imports.',
  folded: ' The {n} smallest folders share the "{other}" box.', dashed: ' Dashed outlines are folders that exist only in the other revision.',
  added: 'Added', removed: 'Removed', unchanged: 'Unchanged', changed: 'Changed', changeLog: 'Detailed Change Log',
  moduleAdded: 'Module Added', moduleAddedBody: 'New module introduced in the target revision. This component adds new functionality to the system architecture.', impact: 'Impact', plusComponent: '+1 Component',
  moduleRemoved: 'Module Removed', moduleRemovedBody: 'Module was removed or refactored out of the architecture. Check if functionality was merged into other components.', minusComponent: '-1 Component',
  depAdded: 'Dependency Added', depAddedBody: 'New dependency relationship established. This may indicate coupling or integration between components.',
  depRemoved: 'Dependency Removed', depRemovedBody: 'Dependency was removed. This may indicate decoupling or refactoring of module relationships.', report: 'GENERATE REPORT',
}, {
  loadFailed: 'Không tải được các không gian làm việc của bạn.', pickBoth: 'Hãy chọn một không gian làm việc và hai phiên bản để so sánh.', compareFailed: 'Không so sánh được hai phiên bản.',
  chooseTwo: 'Hãy chọn hai phiên bản khác nhau để đối chiếu thành phần.', matchFailed: 'Không đối chiếu được thành phần.', pressCompare: 'Chọn hai phiên bản rồi bấm So sánh.',
  noData: 'Không có dữ liệu kiến trúc', noFiles: 'Phiên bản này không có tệp nào được ghi nhận.', title: 'So sánh', intro: 'Cấu trúc đã thay đổi những gì giữa hai phiên bản.',
  workspace: 'Không gian làm việc:', noMined: 'Chưa có không gian làm việc nào đã mining', nothingTitle: 'Chưa có gì để so sánh',
  nothingBody: 'Cần một không gian làm việc có ít nhất hai commit đã mining. Hãy tạo không gian làm việc hoặc chạy mining thêm lịch sử.', goWorkspaces: 'Tới không gian làm việc',
  noCommits: 'Không gian làm việc này chưa có commit nào đã mining. Hãy chạy mining thêm lịch sử ở {link} để so sánh hai phiên bản.',
  oneCommit: 'Không gian làm việc này mới có một commit đã mining. Hãy chạy mining thêm lịch sử ở {link} để so sánh hai phiên bản.', workspaces: 'Không gian làm việc',
  baseRevision: 'Phiên bản gốc', baseLabel: 'Phiên bản gốc', targetRevision: 'Phiên bản đích', targetLabel: 'Phiên bản đích', searchRevision: 'Tìm theo phiên bản, hash hoặc thông điệp',
  comparing: 'Đang so sánh...', compare: 'So sánh', modules: 'Module', dependencies: 'Phụ thuộc', files: 'Tệp', totalTarget: 'tổng ở bản đích', structural: 'Thay đổi cấu trúc',
  changes: '{count} thay đổi', noChanges: 'Không có thay đổi', before: 'Trước', after: 'Sau', selectBase: 'Chọn bản gốc', selectTarget: 'Chọn bản đích',
  folderHelp: 'Bấm vào một thư mục để xem các tệp. Tệp được nhóm theo thư mục', levels: ' (sâu {n} cấp)', arrowsHelp: '; mũi tên là các import giữa thư mục, càng dày càng nhiều import.',
  folded: ' {n} thư mục nhỏ nhất dùng chung ô "{other}".', dashed: ' Viền nét đứt là thư mục chỉ có ở phiên bản còn lại.',
  added: 'Thêm', removed: 'Xoá', unchanged: 'Không đổi', changed: 'Thay đổi', changeLog: 'Nhật ký thay đổi chi tiết',
  moduleAdded: 'Thêm module', moduleAddedBody: 'Module mới xuất hiện ở phiên bản đích, bổ sung chức năng mới cho kiến trúc hệ thống.', impact: 'Ảnh hưởng', plusComponent: '+1 thành phần',
  moduleRemoved: 'Xoá module', moduleRemovedBody: 'Module đã bị xoá hoặc tách khỏi kiến trúc. Hãy kiểm tra xem chức năng có được gộp vào thành phần khác không.', minusComponent: '-1 thành phần',
  depAdded: 'Thêm phụ thuộc', depAddedBody: 'Có quan hệ phụ thuộc mới. Điều này có thể cho thấy sự gắn kết hoặc tích hợp giữa các thành phần.',
  depRemoved: 'Xoá phụ thuộc', depRemovedBody: 'Phụ thuộc đã bị xoá. Điều này có thể cho thấy việc tách rời hoặc tái cấu trúc quan hệ giữa các module.', report: 'TẠO BÁO CÁO',
});

const Compare: React.FC = () => {
  const { message } = App.useApp();
  const m = useMessages(MSG);
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
    }).catch(e => { if (!controller.signal.aborted) { setProjectsList([]); message.error(e instanceof Error ? e.message : m('loadFailed')); } });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the message function changes with the language; reloading then is not needed
  }, [location.search, message]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchSnapshots = async () => {
      try {
        // The pickers need names, dates and titles only; the graphs of the two chosen revisions come with the comparison.
        // Without summary=1 a workspace of 1,000 snapshots sent ~36 MB and took ~3.8 s (N-02, docs/report-5-test-plan-and-results.md).
        const data = await apiRequest<{ data?: { snapshots?: any[] } }>(`/projects/${selectedProjectId}/snapshots?summary=1`);
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
      message.warning(m('pickBoth'));
      return;
    }
    setLoading(true);
    loadMatch(selectedProjectId, baseId, targetId);
    try {
      const data = await apiRequest<{ data?: unknown }>(`/projects/${selectedProjectId}/snapshots/compare?baseId=${encodeURIComponent(baseId)}&targetId=${encodeURIComponent(targetId)}`);
      setCompareData(data.data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : m('compareFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Component matching runs next to the file comparison; its failure (e.g. no components yet) does not hide the file diff.
  const loadMatch = (projectId: string, base: string, target: string) => {
    if (base === target) {
      setMatch({ result: null, error: m('chooseTwo'), loading: false, baseId: base, targetId: target });
      return;
    }
    setMatch({ result: null, error: null, loading: true, baseId: base, targetId: target });
    getComponentMatch(projectId, base, target)
      .then(result => setMatch(cur => (cur && cur.baseId === base && cur.targetId === target ? { ...cur, result, loading: false } : cur)))
      .catch(err => setMatch(cur => (cur && cur.baseId === base && cur.targetId === target ? { ...cur, error: err instanceof Error ? err.message : m('matchFailed'), loading: false } : cur)));
  };

  const revisionOptions = useMemo(() => snapshots.map(s => ({
    value: s.id as string,
    label: `${s.version || s.hash.substring(0, 7)} · ${formatDate(s.date, {}, m.language)}${s.title ? ` · ${s.title}` : ''}`,
  })), [snapshots, m.language]);
  const getBaseSnapshot = () => snapshots.find(s => s.id === baseId);
  const getTargetSnapshot = () => snapshots.find(s => s.id === targetId);

  // Both revisions grouped by folder and laid out together, so a folder sits in the same place on both sides.
  const graph = useMemo(() => (compareData ? buildCompareGraph(compareData.baseSnapshot, compareData.targetSnapshot) : null), [compareData]);
  const graphLayout = useMemo(() => (graph ? layoutCompareGraph(graph, { width: GROUP_WIDTH, height: GROUP_HEIGHT }) : null), [graph]);

  // Clicking a folder box lists its files; a file shows its imports before and after.
  const files = useMemo(() => (compareData && graph ? compareFiles(compareData.baseSnapshot, compareData.targetSnapshot, graph.fileGroup) : new Map()), [compareData, graph]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  // Stable, so the two drawings (memoised) only redraw when the outlined folder changes.
  const openFolder = useCallback((group: string) => { setOpenGroup(group); setOpenFile(null); }, []);
  const showFile = (path: string | null) => {
    if (path) { const f = files.get(path); if (f) setOpenGroup(f.group); }
    setOpenFile(path);
  };

  const drawing = (side: 'base' | 'target', label: string) => {
    if (!graph || !graphLayout) return <div className="flex h-full items-center justify-center text-sm text-[var(--at-muted)]">{m('pressCompare')}</div>;
    const files = side === 'base' ? graph.totals.baseFiles : graph.totals.targetFiles;
    if (!files) return <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm text-[var(--at-muted)]">{m('noData')}</p>
      <p className="text-xs text-[var(--at-muted)]">{m('noFiles')}</p>
    </div>;
    return <CompareDiagram graph={graph} layout={graphLayout} side={side} label={label} selected={openGroup} onOpen={openFolder} />;
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-8 flex flex-col min-h-0">
        
        {/* HEADER */}
        <div className="shrink-0">
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
                onChange={(e) => { setSelectedProjectId(e.target.value); setCompareData(null); setMatch(null); }}
                className="appearance-none bg-transparent border-none text-xs font-bold text-[var(--at-text)] pl-2 pr-10 h-full outline-none cursor-pointer w-48"
              >
                {projectsList?.length ? projectsList.map(p => (
                  <option key={p.id} value={p.id} className="bg-[var(--at-panel-2)]">{p.name}</option>
                )) : <option value="" className="bg-[var(--at-panel-2)]">{m('noMined')}</option>}
              </select>
              <ChevronDown size={14} className="text-[var(--at-muted)] absolute right-3 pointer-events-none group-hover:text-[var(--at-text)]" />
            </div>
          </div>
          
          <div className="h-[1px] w-full bg-gradient-to-r from-[var(--at-line)] to-transparent mt-4"></div>
        </div>

        {projectsList?.length === 0 ? (
          <section className="bg-[var(--at-panel)] border border-dashed border-[var(--at-line)] p-10 text-center" aria-labelledby="no-compare-title">
            <h3 id="no-compare-title" className="text-lg font-bold text-[var(--at-text)] mb-2">{m('nothingTitle')}</h3>
            <p className="text-sm text-[var(--at-muted)] max-w-md mx-auto mb-6">{m('nothingBody')}</p>
            <Link to="/projects" className="inline-flex h-10 px-5 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-bold text-xs items-center">{m('goWorkspaces')}</Link>
          </section>
        ) : <>
        {snapshotsLoaded && snapshots.length < 2 && (
          <p role="status" className="bg-[var(--at-panel)] border border-[var(--at-line)] p-4 text-sm text-[var(--at-muted)]">
            {m.rich(snapshots.length === 0 ? 'noCommits' : 'oneCommit', { link: <Link key="l" to="/projects" className="text-[var(--at-link)] hover:underline">{m('workspaces')}</Link> })}
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
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('baseRevision')}</h3>
            <div className="flex items-center gap-4 relative z-10">
              <Select
                showSearch
                optionFilterProp="label"
                aria-label={m('baseLabel')}
                placeholder={m('searchRevision')}
                value={baseId || undefined}
                onChange={(value: string) => setBaseId(value)}
                options={revisionOptions}
                size="large"
                className="w-full max-w-[420px]"
                popupMatchSelectWidth={false}
              />
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
              className="h-10 px-6 bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] text-[var(--at-on-fill)] font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? m('comparing') : m('compare')}
            </button>
          </div>

          {/* TARGET REVISION */}
          <div className="flex-1 bg-[var(--at-panel)] border border-[var(--at-line)] p-5 relative overflow-hidden group border-r-2 border-r-[var(--at-accent)]/50">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCommit size={64} className="text-[var(--at-link)]" />
            </div>
            <h3 className="text-[10px] font-mono font-semibold text-[var(--at-link)] tracking-widest uppercase mb-4"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('targetRevision')}</h3>
            <div className="flex items-center gap-4 relative z-10">
              <Select
                showSearch
                optionFilterProp="label"
                aria-label={m('targetLabel')}
                placeholder={m('searchRevision')}
                value={targetId || undefined}
                onChange={(value: string) => setTargetId(value)}
                options={revisionOptions}
                size="large"
                className="w-full max-w-[420px]"
                popupMatchSelectWidth={false}
              />
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
              style={{ fontFamily: 'var(--at-font-mono)' }}>{m('modules')}</h4>
              <div className="text-xl font-bold font-mono flex items-center gap-2"
              style={{ fontFamily: 'var(--at-font-mono)' }}>
                <span className="text-[var(--at-success)]">+{compareData.diff.nodesAdded.length}</span>
                <span className="text-[var(--at-muted)]">/</span>
                <span className="text-[var(--at-danger)]">-{compareData.diff.nodesRemoved.length}</span>
              </div>
            </div>
            
            <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[var(--at-muted)] tracking-widest uppercase mb-2"
              style={{ fontFamily: 'var(--at-font-mono)' }}>{m('dependencies')}</h4>
              <div className="flex items-center gap-2 text-xl font-bold font-mono"
              style={{ fontFamily: 'var(--at-font-mono)' }}>
                <span className="text-[var(--at-success)]">+{compareData.diff.edgesAdded.length}</span>
                <span className="text-[var(--at-muted)]">/</span>
                <span className="text-[var(--at-danger)]">-{compareData.diff.edgesRemoved.length}</span>
              </div>
            </div>

            <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-4 flex flex-col justify-between">
              <h4 className="text-[10px] font-mono font-semibold text-[var(--at-muted)] tracking-widest uppercase mb-2"
              style={{ fontFamily: 'var(--at-font-mono)' }}>{m('files')}</h4>
              <div className="text-xl font-bold text-[var(--at-text)] flex items-center gap-2">
                {compareData.targetSnapshot.files} <span className="text-xs font-sans text-[var(--at-muted)] font-normal">{m('totalTarget')}</span>
              </div>
            </div>

            <div className="bg-[var(--at-panel-2)] border border-[var(--at-warn)]/30 p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute inset-0 bg-[var(--at-warn)]/5 pointer-events-none"></div>
              <h4 className="text-[10px] font-mono font-semibold text-[var(--at-warn)] tracking-widest uppercase mb-2 z-10"
              style={{ fontFamily: 'var(--at-font-mono)' }}>{m('structural')}</h4>
              <div className="text-xl font-bold font-mono text-[var(--at-warn)] flex items-center gap-1 z-10"
              style={{ fontFamily: 'var(--at-font-mono)' }}>
                {(() => { const n = compareData.diff.nodesAdded.length + compareData.diff.nodesRemoved.length + compareData.diff.edgesAdded.length + compareData.diff.edgesRemoved.length; return n ? m('changes', { count: n }) : m('noChanges'); })()}
              </div>
            </div>
          </div>
        )}

        {match && (
          <ComponentMatchPanel projectId={selectedProjectId} baseId={match.baseId} targetId={match.targetId} result={match.result} error={match.error} loading={match.loading} />
        )}

        {/* SIDE-BY-SIDE GRAPH CONTAINER */}
        <div className="flex flex-col xl:flex-row gap-6 shrink-0">
          
          {/* LEFT: BEFORE GRAPH */}
          <div className="flex-1 flex flex-col bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[var(--at-line)] flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--at-line-strong)]"></div>
                <span className="text-xs font-bold text-[var(--at-text)] tracking-wide uppercase">{m('before')}</span>
              </div>
              <div className="text-[10px] font-mono text-[var(--at-muted)]"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{getBaseSnapshot()?.version || getBaseSnapshot()?.hash.substring(0, 7) || m('selectBase')}</div>
            </div>
            
            <div className="relative w-full h-[420px] p-3">
              {drawing('base', m('before'))}
            </div>
          </div>

          {/* RIGHT: AFTER GRAPH */}
          <div className="flex-1 flex flex-col bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden shadow-2xl relative">
            <div className="p-4 border-b border-[var(--at-line)] flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--at-accent)] animate-pulse motion-reduce:animate-none shadow-[0_0_8px_var(--at-glow)]"></div>
                <span className="text-xs font-bold text-[var(--at-text)] tracking-wide uppercase">{m('after')}</span>
              </div>
              <div className="text-[10px] font-mono text-[var(--at-muted)]"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{getTargetSnapshot()?.version || getTargetSnapshot()?.hash.substring(0, 7) || m('selectTarget')}</div>
            </div>
            
            <div className="relative w-full h-[420px] p-3">
              {drawing('target', m('after'))}
            </div>
          </div>
          
        </div>

        {/* CHANGE LEGEND */}
        <CompareFilesDrawer group={openGroup} file={openFile} files={files} onFile={showFile} onClose={() => { setOpenGroup(null); setOpenFile(null); }} />
        {graph && <p className="text-center text-xs text-[var(--at-muted)]">
          {m('folderHelp')}{graph.depth > 1 ? m('levels', { n: graph.depth }) : ''}{m('arrowsHelp')}
          {graph.folded > 0 ? m('folded', { n: graph.folded, other: OTHER }) : ''}{m('dashed')}
        </p>}
        <div className="flex flex-wrap items-center justify-center gap-6 py-2">
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[var(--at-success)] shadow-[0_0_5px_var(--at-success)]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('added')}</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[var(--at-danger)] shadow-[0_0_5px_var(--at-danger)]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('removed')}</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[var(--at-muted)]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('unchanged')}</span>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 bg-[var(--at-warn)]"></div>
             <span className="text-[10px] font-mono text-[var(--at-muted)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--at-font-mono)' }}>{m('changed')}</span>
          </div>
        </div>

        {/* CHANGE LIST */}
        {compareData && (
          <div className="shrink-0 space-y-4">
            <h3 className="text-sm font-bold text-[var(--at-text)] tracking-wide uppercase mb-4 flex items-center gap-2">
              <FileDiff size={16} className="text-[var(--at-link)]" />
              {m('changeLog')}
            </h3>

            <div className="bg-[var(--at-panel)] border border-[var(--at-line)] overflow-hidden divide-y divide-[var(--at-line)]">
              
              {compareData.diff.nodesAdded.map((node: any) => (
                <div key={`na-${node.id}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--at-panel-2)]/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[var(--at-success)]/10 border border-[var(--at-success)]/20 text-[var(--at-success)] text-[11px] font-mono font-bold uppercase tracking-widest"
              style={{ fontFamily: 'var(--at-font-mono)' }}>{m('moduleAdded')}</span>
                    </div>
                    <div className="text-sm font-bold text-[var(--at-text)] mb-1">{node.name}</div>
                    <p className="text-xs text-[var(--at-muted)]">{m('moduleAddedBody')}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--at-muted)]">{m('impact')}</div>
                    <div className="text-sm font-mono text-[var(--at-success)]">{m('plusComponent')}</div>
                  </div>
                </div>
              ))}
              
              {compareData.diff.nodesRemoved.map((node: any) => (
                <div key={`nr-${node.id}`} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--at-panel-2)]/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[var(--at-danger)]/10 border border-[var(--at-danger)]/20 text-[var(--at-danger)] text-[11px] font-mono font-bold uppercase tracking-widest"
              style={{ fontFamily: 'var(--at-font-mono)' }}>{m('moduleRemoved')}</span>
                    </div>
                    <div className="text-sm font-bold text-[var(--at-text)] mb-1">{node.name}</div>
                    <p className="text-xs text-[var(--at-muted)]">{m('moduleRemovedBody')}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--at-muted)]">{m('impact')}</div>
                    <div className="text-sm font-mono text-[var(--at-danger)]">{m('minusComponent')}</div>
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
                        <span className="px-2 py-0.5 bg-[var(--at-accent)]/10 border border-[var(--at-accent)]/20 text-[var(--at-link)] text-[11px] font-mono font-bold uppercase tracking-widest"
                style={{ fontFamily: 'var(--at-font-mono)' }}>{m('depAdded')}</span>
                        <span className="px-2 py-0.5 bg-[var(--at-panel-2)] border border-[var(--at-line)] text-[var(--at-muted)] text-[11px] font-mono"
                style={{ fontFamily: 'var(--at-font-mono)' }}>{edge.type || 'imports'}</span>
                      </div>
                      <div className="text-sm font-bold text-[var(--at-text)] mb-1 flex items-center gap-2">{src} <ArrowRight size={14} className="text-[var(--at-link)]" /> {tgt}</div>
                      <p className="text-xs text-[var(--at-muted)]">{m('depAddedBody')}</p>
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
                        <span className="px-2 py-0.5 bg-[var(--at-danger)]/10 border border-[var(--at-danger)]/20 text-[var(--at-danger)] text-[11px] font-mono font-bold uppercase tracking-widest"
                style={{ fontFamily: 'var(--at-font-mono)' }}>{m('depRemoved')}</span>
                        <span className="px-2 py-0.5 bg-[var(--at-panel-2)] border border-[var(--at-line)] text-[var(--at-muted)] text-[11px] font-mono"
                style={{ fontFamily: 'var(--at-font-mono)' }}>{edge.type || 'imports'}</span>
                      </div>
                      <div className="text-sm font-bold text-[var(--at-text)] mb-1 flex items-center gap-2 line-through opacity-70">{src} <ArrowRight size={14} className="text-[var(--at-danger)]" /> {tgt}</div>
                      <p className="text-xs text-[var(--at-muted)]">{m('depRemovedBody')}</p>
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
              {m('report')}
           </Link>
        </div>
        </>}
      </div>
    </DashboardLayout>
  );
};

export default Compare;
