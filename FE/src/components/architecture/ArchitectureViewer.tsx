import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Modal } from 'antd';
import { ArrowLeft, ChevronDown, ChevronUp, Layers, PanelRight } from 'lucide-react';
import ArchitectureDiagram from './ArchitectureDiagram';
import type { Viewport } from './ArchitectureDiagram';
import FloatingToolbar from './FloatingToolbar';
import Inspector from './Inspector';
import LayersPanel from './LayersPanel';
import { exportDiagram } from './export';
import type { ExportFormat } from './export';
import { validateView } from '@/features/architecture/validate';
import { layoutGraph } from '@/features/architecture/layout';
import { validateLayout } from '@/features/architecture/layout-validate';
import { classScene, componentScene, ROLE_LABEL } from '@/features/architecture/scene';
import { computeHighlight } from '@/features/architecture/highlight';
import { parseHash } from '@/features/architecture/url-state';
import type { ViewerState } from '@/features/architecture/url-state';
import { THEMES } from '@/features/architecture/theme';
import { COMPONENT_ROLES } from '@/features/architecture/types';
import type { ArchitectureView, ComponentRole } from '@/features/architecture/types';
import type { SnapshotSummary } from '@/features/architecture/api';

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
const sectionTitle = 'text-[10px] font-mono uppercase tracking-wider text-[#94a3b8]';
/** Below this width the side panels would squeeze the artboard, so they become drawers over it, closed by default. */
const WIDE = 1100;

/**
 * The workspace around one verified view, laid out like a design tool: layers on the left, the artboard in the middle
 * with a floating toolbar, properties on the right. The source of the view (sample or server) is chosen by the page;
 * `base` carries that choice so it is kept in the URL together with the viewer state.
 */
export default function ArchitectureViewer({ view, base, hash, commit, overview, snapshots, snapshotId, onSnapshot }: {
  view: ArchitectureView;
  base: ViewerState;
  hash: string;
  commit: (state: ViewerState, push?: boolean) => void;
  /** Shown in the properties panel when nothing is selected: quality, AI results… */
  overview?: ReactNode;
  snapshots?: SnapshotSummary[];
  snapshotId?: string;
  onSnapshot?: (id: string) => void;
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
  const wide = width >= WIDE;
  // null = follow the layout (open when wide, closed when narrow); a choice sticks until the layout changes.
  const [leftChoice, setLeftChoice] = useState<{ open: boolean; wide: boolean } | null>(null);
  const [rightChoice, setRightChoice] = useState<{ open: boolean; wide: boolean } | null>(null);
  const left = leftChoice && leftChoice.wide === wide ? leftChoice.open : wide;
  const right = rightChoice && rightChoice.wide === wide ? rightChoice.open : wide;
  const setLeft = (open: boolean) => setLeftChoice({ open, wide });
  const setRight = (open: boolean) => setRightChoice({ open, wide });
  const [legend, setLegend] = useState(false);
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
  const highlight = useMemo(() => computeHighlight(scene, state), [scene, state]);
  const hasSelection = !!(state.focus || state.edge || state.route);
  const errors = verification.issues.filter(i => i.severity === 'error');
  const warnings = verification.issues.filter(i => i.severity === 'warning');

  const go = useCallback((next: ViewerState, push = false) => commit({ ...base, ...(detailId ? { detail: detailId } : {}), ...next }, push), [commit, base, detailId]);
  const clearSelection = useCallback(() => commit({ ...base, ...(detailId ? { detail: detailId } : {}), ...(state.lens ? { lens: state.lens } : {}) }), [commit, base, detailId, state.lens]);

  const focusNode = (id: string) => (state.focus === id && !state.route ? clearSelection() : go({ focus: id, ...(state.lens ? { lens: state.lens } : {}) }));
  const selectLayer = (id: string) => {
    go({ focus: id, ...(state.lens ? { lens: state.lens } : {}) });
    if (!wide) setLeft(false); // a drawer would hide what was just selected
    viewport.current?.reveal([id]);
  };
  const selectEdge = (id: string) => go({ edge: id, ...(state.lens ? { lens: state.lens } : {}) });
  const openDetail = (id: string) => { if (scene.mode === 'components') commit({ ...base, detail: id }, true); };
  const closeDetail = useCallback(() => commit({ ...base }, true), [commit, base]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      // Ctrl/Cmd + \ hides or shows the panels, as in design tools.
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') { event.preventDefault(); const show = !(left || right); setLeft(show); setRight(show); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); }
      else if (event.key === '?') setHelpOpen(true);
      else if (event.key.toLowerCase() === 't') setThemeName(v => (v === 'dark' ? 'light' : 'dark'));
      else if (event.key.toLowerCase() === 'w') setWeights(v => !v);
      else if (event.key === 'Escape') {
        if (state.focus || state.route || state.edge) clearSelection(); else if (detailId) closeDetail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const detailName = detailId ? view.components.find(c => c.id === detailId)?.name : undefined;
  async function run(format: ExportFormat) {
    setExporting(true);
    try { await exportDiagram(format, { scene, layout, theme, title: `${view.title}${detailName ? ` - ${detailName}` : ''}` }, view, theme.background); }
    catch (cause) { message.error(cause instanceof Error ? cause.message : 'The export failed.'); }
    finally { setExporting(false); }
  }

  const options = scene.nodes.map(n => ({ value: n.id, label: n.title }));
  const roleOptions = COMPONENT_ROLES.filter(r => view.components.some(c => c.role === r)).map(r => ({ value: r, label: ROLE_LABEL[r] }));
  const panel = 'rounded-lg border border-[#2a3441] bg-[#11161b]/95 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur';

  if (errors.length > 0) {
    return <div className="p-6"><Alert type="error" showIcon title="This view failed verification and is not drawn" description={<ul className="list-disc pl-5">{errors.slice(0, 8).map((i, n) => <li key={n}><code>{i.code}</code> {i.message}</li>)}</ul>} /></div>;
  }
  const drawer = wide ? '' : 'absolute inset-y-0 z-20 shadow-[0_0_40px_rgba(0,0,0,0.6)]';
  return <div ref={root} className="relative flex h-full min-h-0">
    {left && <aside aria-label="Layers" className={`${drawer} left-0 w-60 max-w-[85%] shrink-0 border-r border-[#222c37] bg-[#0d1116]`}>
      {!wide && <div className="flex justify-end border-b border-[#222c37] px-2 py-1"><Button size="small" type="text" onClick={() => setLeft(false)}>Close</Button></div>}
      <LayersPanel scene={scene} theme={theme} highlight={highlight} selected={state.focus} onSelect={selectLayer} onOpen={openDetail}
        snapshots={snapshots} snapshotId={snapshotId} onSnapshot={onSnapshot} />
    </aside>}

    <ArchitectureDiagram className="h-full min-w-0 flex-1" apiRef={viewport}
      gridColor={themeName === 'light' ? '#dbe2ea' : '#1c2530'} scene={scene} layout={layout} theme={theme} title={view.title} highlight={highlight}
      selectedNode={state.focus} selectedEdge={state.edge} hoverEdge={hoverEdge} showWeights={weights}
      onNodeClick={focusNode} onNodeOpen={openDetail} onEdgeClick={selectEdge} onEdgeHover={setHoverEdge}
      overlay={vp => <>
        <div data-overlay className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-start gap-2">
          {!wide && !left && <Button size="small" icon={<Layers size={14} />} onClick={() => setLeft(true)}>Layers</Button>}
          {detailId && <Button size="small" icon={<ArrowLeft size={14} />} onClick={closeDetail}>All components{detailName ? ` · inside ${detailName}` : ''}</Button>}
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

        {!wide && !right && <div data-overlay className="absolute right-3 top-3 z-10">
          <Button size="small" icon={<PanelRight size={14} />} onClick={() => setRight(true)}>{hasSelection ? 'Details' : 'Overview'}</Button>
        </div>}

        {state.route && !highlight.primaryRoute && <div data-overlay className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
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
          inspector={right} onInspector={() => setRight(!right)}
          exporting={exporting} onExport={format => { void run(format); }} onHelp={() => setHelpOpen(true)} hasSelection={hasSelection} />

        <Modal open={helpOpen} onCancel={() => setHelpOpen(false)} footer={null} title="Keyboard and mouse" getContainer={vp.container}>
          <dl className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
            {[
              ['Scroll / two fingers', 'Pan'], ['Drag the background', 'Pan'], ['Ctrl + scroll / pinch', 'Zoom at the pointer'],
              ['+  /  -', 'Zoom in / out'], ['0', 'Fit the whole diagram'], ['F', 'Zoom to the selection'], ['M', 'Show or hide the minimap'],
              ['Ctrl + \\', 'Hide or show the side panels'],
              ['Click / Enter', 'Focus a component (click again to clear)'], ['Double-click / Shift+Enter', 'Show what is inside a component'],
              ['/', 'Find a component'], ['Esc', 'Clear focus, route or selection; then leave the inner view'],
              ['T', 'Toggle light / dark theme'], ['W', 'Show dependency counts on all arrows'], ['?', 'This help'],
            ].map(([k, v]) => <div key={k} className="contents"><dt className="font-mono text-xs text-[#38bdf8]">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Modal>
      </>} />

    {right && <aside aria-label="Properties" className={`${drawer} right-0 w-72 max-w-[85%] shrink-0 overflow-auto border-l border-[#222c37] bg-[#0d1116]`}>
      {!wide && <div className="sticky top-0 z-10 flex justify-end border-b border-[#222c37] bg-[#0d1116] px-2 py-1">
        <Button size="small" type="text" onClick={() => setRight(false)}>Close</Button>
      </div>}
      <div className="space-y-5 p-4">
        <Inspector view={view} scene={scene} theme={theme} selectedNode={state.focus} selectedEdge={state.edge} highlight={highlight} onSelectNode={focusNode} onSelectEdge={selectEdge} onOpen={openDetail} />
        {!hasSelection && (warnings.length > 0 || layoutIssues.length > 0) && <section className="space-y-1 text-xs">
          <h3 className={sectionTitle}>Checks</h3>
          {warnings.map((w, i) => <p key={i} className="text-[#fbbf24]">{w.code}: {w.message}</p>)}
          {layoutIssues.slice(0, 3).map((i, n) => <p key={n} className="text-[#f87171]">Layout {i.code}: {i.message}</p>)}
        </section>}
        {!hasSelection && overview}
      </div>
    </aside>}
  </div>;
}
