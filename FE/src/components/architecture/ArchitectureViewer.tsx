import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Modal } from 'antd';
import { ArrowLeft, ChevronDown, ChevronUp, Layers, Minimize, PanelRight } from 'lucide-react';
import ArchitectureDiagram from './ArchitectureDiagram';
import type { Viewport } from './ArchitectureDiagram';
import FloatingToolbar from './FloatingToolbar';
import Inspector from './Inspector';
import IssuesPanel, { IssuesChip } from './IssuesPanel';
import LayersPanel from './LayersPanel';
import { exportDiagram } from './export';
import type { ExportFormat } from './export';
import { validateView } from '@/features/architecture/validate';
import { layoutGraph } from '@/features/architecture/layout';
import { validateLayout } from '@/features/architecture/layout-validate';
import { classScene, componentScene, ROLE_LABEL } from '@/features/architecture/scene';
import { computeHighlight } from '@/features/architecture/highlight';
import type { Highlight } from '@/features/architecture/highlight';
import { exportCaption, exportFileBase } from '@/features/architecture/export-file';
import type { ExportMeta } from '@/features/architecture/export-file';
import { issuesFor, planShow, summarize } from '@/features/architecture/issues';
import type { Issue, IssueAction, IssueInput } from '@/features/architecture/issues';
import { escapeAction, escapeTaken, isFocusKey, loadPanelChoice, resolvePanels, savePanelChoice, setPanel, togglePanels } from '@/features/architecture/panels';
import type { PanelChoice, PanelInput, Side } from '@/features/architecture/panels';
import { parseHash, serializeHash } from '@/features/architecture/url-state';
import type { ViewerState } from '@/features/architecture/url-state';
import { THEMES } from '@/features/architecture/theme';
import { COMPONENT_ROLES } from '@/features/architecture/types';
import type { ArchitectureView, ComponentRole } from '@/features/architecture/types';
import type { SnapshotSummary } from '@/features/architecture/api';

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
/** What "Show in diagram" highlights when an issue involves several components; valid only for the URL it was made at. */
interface Pin { at: string; id: string; title: string; nodes: Set<string>; edges: Set<string> }

/**
 * The workspace around one verified view, laid out like a design tool: layers on the left, the artboard in the middle
 * with a floating toolbar, properties on the right. The source of the view (sample or server) is chosen by the page;
 * `base` carries that choice so it is kept in the URL together with the viewer state. Panel rules (which are open at
 * which width, full screen, what is remembered) live in features/architecture/panels.ts.
 */
export default function ArchitectureViewer({ view, base, hash, commit, overview, snapshots, snapshotId, onSnapshot, focusMode, onFocusMode, issueContext, onIssueAction, exportInfo }: {
  view: ArchitectureView;
  base: ViewerState;
  hash: string;
  commit: (state: ViewerState, push?: boolean) => void;
  /** Shown in the properties panel when nothing is selected: quality, AI results… */
  overview?: ReactNode;
  snapshots?: SnapshotSummary[];
  snapshotId?: string;
  onSnapshot?: (id: string) => void;
  /** Full screen: owned by the page, which also hides its own header. */
  focusMode: boolean;
  onFocusMode: (on: boolean) => void;
  /** What the issues list needs beyond the view: quality measures, staleness, the AI receipt, and whether the person may act. */
  issueContext?: Omit<IssueInput, 'view' | 'warnings' | 'layoutIssues'>;
  onIssueAction?: (action: IssueAction) => void;
  /** Names exported files and images (workspace, snapshot, date); never taken from the view's own title, which is a commit title. */
  exportInfo?: ExportMeta;
}) {
  const { message } = App.useApp();
  const [themeName, setThemeName] = useState<'dark' | 'light'>('dark');
  const [weights, setWeights] = useState(false);
  const [hoverEdge, setHoverEdge] = useState<string | undefined>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // The remembered choice (beside the artboard) and the drawers opened over it; see panels.ts for what follows from them.
  const [saved, setSaved] = useState<PanelChoice>(() => loadPanelChoice());
  const [drawers, setDrawers] = useState<PanelChoice>({});
  const panelInput: PanelInput = { width, focus: focusMode, saved, drawers };
  const { left, right, overlay, layout: panelLayout } = resolvePanels(panelInput);
  const applyPanels = (next: Pick<PanelInput, 'saved' | 'drawers'>) => {
    if (next.saved !== saved) { setSaved(next.saved); savePanelChoice(next.saved); }
    setDrawers(next.drawers);
  };
  const setSide = (side: Side, open: boolean) => applyPanels(setPanel(panelInput, side, open));
  const changeFocus = (on: boolean) => { setDrawers({}); onFocusMode(on); };
  /** The exit button disappears with the mode, so a keyboard user would land on <body>; hand focus to the toolbar's own full screen button (or "More" when it is folded). */
  const exitFocus = () => {
    changeFocus(false);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="toolbar"] [aria-label="Full screen"], [role="toolbar"] [aria-label="More"]')?.focus());
  };
  const [legend, setLegend] = useState(false);
  const [pin, setPin] = useState<Pin | null>(null);
  const searchRef = useRef<{ focus: () => void } | null>(null);
  const viewport = useRef<Viewport | null>(null);
  const theme = THEMES[themeName];

  // Ids in the URL are checked against what is actually on screen: first against the components, then against the class view if one is open.
  const detailId = parseHash(hash, { components: new Set(view.components.map(c => c.id)) }).detail;
  const scene = useMemo(() => (detailId ? classScene(view, detailId) : componentScene(view)), [view, detailId]);
  const state = useMemo<ViewerState>(() => {
    const known = { components: new Set([...scene.nodes.map(n => n.id), ...(detailId ? [detailId] : [])]), edges: new Set(scene.edges.map(e => e.id)) };
    return { ...parseHash(hash, known), ...base };
  }, [hash, scene, detailId, base]);

  const verification = useMemo(() => validateView(view), [view]);
  const layout = useMemo(() => layoutGraph(scene.nodes.map(n => ({ id: n.id, width: n.width, height: n.height, layer: n.layer })), scene.edges), [scene]);
  const layoutIssues = useMemo(() => validateLayout(layout), [layout]);
  // A pinned highlight (several components of one issue) belongs to the URL it was made at; any other change drops it.
  if (pin && pin.at !== hash) setPin(null); // adjusting state while rendering, so it cannot come back when the URL does
  const hasSelection = !!(state.focus || state.edge || state.route);
  const activePin = pin && pin.at === hash && !hasSelection ? pin : null;
  const computed = useMemo(() => computeHighlight(scene, state), [scene, state]);
  const highlight: Highlight = useMemo(() => (activePin ? { nodes: activePin.nodes, edges: activePin.edges, primaryRoute: null, routes: [] } : computed), [activePin, computed]);
  const errors = verification.issues.filter(i => i.severity === 'error');
  const warnings = useMemo(() => verification.issues.filter(i => i.severity === 'warning'), [verification]);

  // The issues belong to the whole map, so the chip says the same in the inner view: its layout problems are those of the component map.
  const mapLayoutIssues = useMemo(() => {
    if (scene.mode === 'components') return layoutIssues;
    const map = componentScene(view);
    return validateLayout(layoutGraph(map.nodes.map(n => ({ id: n.id, width: n.width, height: n.height, layer: n.layer })), map.edges));
  }, [scene.mode, layoutIssues, view]);
  const issues = useMemo(() => issuesFor({ ...issueContext, view, warnings, layoutIssues: mapLayoutIssues }), [issueContext, view, warnings, mapLayoutIssues]);
  const summary = useMemo(() => summarize(issues), [issues]);
  const verified = `${view.components.length} components · ${view.edges.length} dependencies`;

  const go = useCallback((next: ViewerState, push = false) => commit({ ...base, ...(detailId ? { detail: detailId } : {}), ...next }, push), [commit, base, detailId]);
  const clearSelection = useCallback(() => { setPin(null); commit({ ...base, ...(detailId ? { detail: detailId } : {}), ...(state.lens ? { lens: state.lens } : {}) }); }, [commit, base, detailId, state.lens]);

  const focusNode = (id: string) => (state.focus === id && !state.route ? clearSelection() : go({ focus: id, ...(state.lens ? { lens: state.lens } : {}) }));
  const selectLayer = (id: string) => {
    go({ focus: id, ...(state.lens ? { lens: state.lens } : {}) });
    if (overlay) setSide('left', false); // a drawer would hide what was just selected
    viewport.current?.reveal([id]);
  };
  const selectEdge = (id: string) => go({ edge: id, ...(state.lens ? { lens: state.lens } : {}) });
  const openDetail = (id: string) => { if (scene.mode === 'components') commit({ ...base, detail: id }, true); };
  const closeDetail = useCallback(() => commit({ ...base }, true), [commit, base]);

  /** "Show in diagram": the existing focus and edge selections for one component or edge, a pinned highlight for several. */
  const showIssue = (issue: Issue) => {
    const plan = planShow(issue);
    if (!plan) return;
    const known = new Set(view.components.map(c => c.id));
    if (plan.kind === 'focus') commit({ ...base, focus: plan.id });
    else if (plan.kind === 'edge') commit({ ...base, edge: plan.id });
    else {
      const nodes = new Set(plan.nodes.filter(id => known.has(id)));
      const edges = new Set(plan.edges);
      for (const e of view.edges) if (edges.has(e.id)) { nodes.add(e.source); nodes.add(e.target); }
      commit({ ...base });
      setPin({ at: serializeHash({ ...base }), id: issue.id, title: issue.title, nodes, edges });
    }
    if (overlay) setSide('right', false); // a drawer would hide what was just highlighted
    // The viewer redraws the component map first (the inner view has no such boxes), then brings them into view.
    requestAnimationFrame(() => viewport.current?.reveal(issue.components.filter(id => known.has(id))));
  };
  /** The chip: back to the overview, with the panel open and the list at the top. */
  const openIssues = () => {
    if (hasSelection || activePin) clearSelection();
    if (!right) setSide('right', true);
    requestAnimationFrame(() => document.getElementById('architecture-issues')?.scrollIntoView({ block: 'start' }));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      // Ctrl/Cmd + \ hides or shows the panels, as in design tools.
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') { event.preventDefault(); applyPanels(togglePanels(panelInput)); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isFocusKey(event)) { event.preventDefault(); changeFocus(!focusMode); return; }
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); }
      else if (event.key === '?') setHelpOpen(true);
      else if (event.key.toLowerCase() === 't') setThemeName(v => (v === 'dark' ? 'light' : 'dark'));
      else if (event.key.toLowerCase() === 'w') setWeights(v => !v);
      else if (event.key === 'Escape' && !helpOpen && !escapeTaken(event, document)) {
        // The browser's own full screen takes Esc itself; this is for the in-page mode.
        const action = escapeAction({ selection: hasSelection || !!activePin, detail: !!detailId, focus: focusMode });
        if (action === 'clear-selection') clearSelection(); else if (action === 'close-detail') closeDetail(); else if (action === 'exit-focus') changeFocus(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const detailName = detailId ? view.components.find(c => c.id === detailId)?.name : undefined;
  const caption = exportCaption({ ...exportInfo, detail: detailName });
  async function run(format: ExportFormat) {
    setExporting(true);
    try { await exportDiagram(format, { scene, layout, theme, title: caption.title, caption }, view, theme.background, exportFileBase({ ...exportInfo, detail: detailName })); }
    catch (cause) { message.error(`Could not export the ${format.toUpperCase()} file: ${cause instanceof Error ? cause.message : 'unknown error'}`); }
    finally { setExporting(false); }
  }

  const options = scene.nodes.map(n => ({ value: n.id, label: n.title }));
  const roleOptions = COMPONENT_ROLES.filter(r => view.components.some(c => c.role === r)).map(r => ({ value: r, label: ROLE_LABEL[r] }));
  const panel = 'rounded-lg border border-[#2a3441] bg-[#11161b]/95 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur';

  if (errors.length > 0) {
    return <div className="p-6"><Alert type="error" showIcon title="This view failed verification and is not drawn" description={<ul className="list-disc pl-5">{errors.slice(0, 8).map((i, n) => <li key={n}><code>{i.code}</code> {i.message}</li>)}</ul>} /></div>;
  }
  // Over the artboard the panels start below the full-screen exit button so it stays reachable.
  const rightButton = focusMode || (overlay && !right);
  const drawer = overlay ? `absolute z-20 shadow-[0_0_40px_rgba(0,0,0,0.6)] ${focusMode ? 'top-12 bottom-0' : 'inset-y-0'}` : '';
  const leftWidth = overlay ? 'w-60' : panelLayout === 'roomy' ? 'w-56' : 'w-52';
  const rightWidth = overlay || panelLayout === 'roomy' ? 'w-72' : 'w-64';
  return <div ref={root} className="relative flex h-full min-h-0">
    {left && <aside aria-label="Layers" className={`${drawer} left-0 ${leftWidth} max-w-[85%] shrink-0 border-r border-[#242527] bg-[#0d1116]`}>
      {overlay && <div className="flex justify-end border-b border-[#242527] px-2 py-1"><Button size="small" type="text" onClick={() => setSide('left', false)}>Close</Button></div>}
      <LayersPanel scene={scene} theme={theme} highlight={highlight} selected={state.focus} onSelect={selectLayer} onOpen={openDetail}
        snapshots={snapshots} snapshotId={snapshotId} onSnapshot={onSnapshot} />
    </aside>}

    <ArchitectureDiagram className="h-full min-w-0 flex-1" apiRef={viewport}
      gridColor={themeName === 'light' ? '#dbe2ea' : '#1c2530'} scene={scene} layout={layout} theme={theme} title={caption.title} highlight={highlight}
      selectedNode={state.focus} selectedEdge={state.edge} hoverEdge={hoverEdge} showWeights={weights}
      onNodeClick={focusNode} onNodeOpen={openDetail} onEdgeClick={selectEdge} onEdgeHover={setHoverEdge}
      overlay={vp => <>
        {/* Room is kept for the button at the top right (Exit full screen, Issues / Details), so on a phone the group wraps instead of sliding under it. */}
        <div data-overlay className={`absolute left-3 top-3 z-10 flex flex-wrap items-start gap-2 ${rightButton ? 'max-w-[calc(100%-9.5rem)]' : 'max-w-[calc(100%-1.5rem)]'}`}>
          {overlay && !left && <Button size="small" icon={<Layers size={14} />} onClick={() => setSide('left', true)}>Layers</Button>}
          {detailId && <Button size="small" icon={<ArrowLeft size={14} />} onClick={closeDetail}>All components{detailName ? ` · inside ${detailName}` : ''}</Button>}
          <IssuesChip summary={summary} verified={verified} onClick={openIssues} />
          <div className={`${panel} text-xs`}>
            <button type="button" className="flex items-center gap-1.5 px-2.5 py-1.5 text-[#cbd5e1] hover:text-white" aria-expanded={legend} onClick={() => setLegend(v => !v)}>
              Legend {legend ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {legend && <ul className="space-y-1 px-3 pb-2.5 text-[#94a3b8]" aria-label="Legend">
              {roleOptions.map(r => <li key={r.value} className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: theme.role[r.value as ComponentRole] }} />{r.label}</li>)}
              <li className="flex items-center gap-2"><span className="inline-block w-5 border-t-2" style={{ borderColor: theme.cycle }} />circular dependency</li>
              <li className="flex items-center gap-2"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: theme.edge }} />points upward</li>
            </ul>}
          </div>
        </div>

        {rightButton && <div data-overlay className="absolute right-3 top-3 z-30 flex items-start gap-2">
          {!focusMode && <Button size="small" icon={<PanelRight size={14} />} onClick={() => setSide('right', true)}>{hasSelection ? 'Details' : summary.count ? `Issues · ${summary.count}` : 'Overview'}</Button>}
          {focusMode && <Button size="small" type="primary" icon={<Minimize size={14} />} onClick={exitFocus}>Exit full screen</Button>}
        </div>}

        {activePin && <div data-overlay className="absolute bottom-[4.5rem] left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-[#2a3441] bg-[#11161b]/95 py-1 pl-3 pr-1 text-xs text-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
          <span className="min-w-0 truncate">Showing: {activePin.title}</span>
          <Button size="small" type="text" onClick={clearSelection}>Clear highlight</Button>
        </div>}

        {state.route && !highlight.primaryRoute &&<div data-overlay className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <Alert type="warning" showIcon title="No dependency path: the first does not depend on the second." />
        </div>}

        <FloatingToolbar viewport={vp} options={options} searchRef={searchRef} focus={state.focus}
          onFind={id => { if (id) { go({ focus: id }); vp.reveal([id]); } else clearSelection(); }}
          reach={state.reach ?? 'direct'} onReach={value => state.focus && go({ focus: state.focus, ...(value === 'direct' ? {} : { reach: value }) })}
          route={state.route}
          onRouteFrom={id => go(id ? { route: [id, state.route?.[1] ?? ''] as [string, string] } : {})}
          onRouteTo={id => (id && state.route?.[0] ? go({ route: [state.route[0], id] }) : id ? go({ route: [state.focus ?? '', id] }) : clearSelection())}
          roleOptions={scene.mode === 'components' ? roleOptions : undefined} lens={state.lens}
          onLens={roles => commit({ ...base, ...state, lens: roles.length ? roles : undefined })}
          weights={weights} onWeights={() => setWeights(v => !v)} light={themeName === 'light'} onTheme={() => setThemeName(v => (v === 'dark' ? 'light' : 'dark'))}
          layers={left} onLayers={() => setSide('left', !left)} inspector={right} onInspector={() => setSide('right', !right)}
          focusMode={focusMode} onFocusMode={() => changeFocus(!focusMode)}
          exporting={exporting} onExport={format => { void run(format); }} onHelp={() => setHelpOpen(true)} hasSelection={hasSelection || !!activePin} />

        <Modal open={helpOpen} onCancel={() => setHelpOpen(false)} footer={null} title="Keyboard and mouse" getContainer={vp.container}>
          <dl className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
            {[
              ['Scroll / two fingers', 'Pan'], ['Drag the background', 'Pan'], ['Ctrl + scroll / pinch', 'Zoom at the pointer'],
              ['+  /  -', 'Zoom in / out'], ['0', 'Fit the whole diagram'], ['F', 'Zoom to the selection'], ['M', 'Show or hide the minimap'],
              ['Shift + F', 'Full screen: only the diagram and its toolbar stay'],
              ['Ctrl + \\', 'Hide or show the side panels'],
              ['Click / Enter', 'Focus a component (click again to clear)'], ['Double-click / Shift+Enter', 'Show what is inside a component'],
              ['/', 'Find a component'], ['Esc', 'Clear focus, route or selection; then leave the inner view; then leave full screen'],
              ['T', 'Toggle light / dark theme'], ['W', 'Show dependency counts on all arrows'], ['?', 'This help'],
            ].map(([k, v]) => <div key={k} className="contents"><dt className="font-mono text-xs text-[#93c5fd]">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Modal>
      </>} />

    {right && <aside aria-label="Properties" className={`${drawer} right-0 ${rightWidth} max-w-[85%] shrink-0 overflow-auto border-l border-[#242527] bg-[#0d1116]`}>
      {overlay && <div className="sticky top-0 z-10 flex justify-end border-b border-[#242527] bg-[#0d1116] px-2 py-1">
        <Button size="small" type="text" onClick={() => setSide('right', false)}>Close</Button>
      </div>}
      <div className="space-y-4 p-3">
        {hasSelection && <button type="button" onClick={clearSelection} className="flex items-center gap-1.5 text-xs text-[#93c5fd] hover:text-[#bfdbfe]">
          <ArrowLeft size={12} aria-hidden /> Overview and issues{summary.count ? ` (${summary.count})` : ''}
        </button>}
        {!hasSelection && <IssuesPanel issues={issues} summary={summary} verified={verified} activeId={activePin?.id} inner={scene.mode !== 'components'} onShow={showIssue} onAction={onIssueAction} />}
        <Inspector view={view} scene={scene} theme={theme} selectedNode={state.focus} selectedEdge={state.edge} highlight={highlight} onSelectNode={focusNode} onSelectEdge={selectEdge} onOpen={openDetail} />
        {!hasSelection && overview}
      </div>
    </aside>}
  </div>;
}
