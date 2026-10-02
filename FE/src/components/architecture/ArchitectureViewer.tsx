import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Dropdown, Modal, Segmented, Select, Switch } from 'antd';
import { ArrowLeft, Download, Keyboard } from 'lucide-react';
import ArchitectureDiagram from './ArchitectureDiagram';
import Inspector from './Inspector';
import { exportDiagram } from './export';
import type { ExportFormat } from './export';
import { validateView } from '@/features/architecture/validate';
import { layoutGraph } from '@/features/architecture/layout';
import { validateLayout } from '@/features/architecture/layout-validate';
import { classScene, componentScene, ROLE_LABEL, unitWord } from '@/features/architecture/scene';
import { computeHighlight } from '@/features/architecture/highlight';
import { parseHash } from '@/features/architecture/url-state';
import type { ViewerState } from '@/features/architecture/url-state';
import { THEMES } from '@/features/architecture/theme';
import { COMPONENT_ROLES } from '@/features/architecture/types';
import type { ArchitectureView, ComponentRole } from '@/features/architecture/types';

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Everything about looking at one verified view. The source of the view (sample or server) is chosen by the page;
 * `base` carries that choice so it is kept in the URL together with the viewer state.
 */
export default function ArchitectureViewer({ view, base, hash, commit, actions }: {
  view: ArchitectureView;
  base: ViewerState;
  hash: string;
  commit: (state: ViewerState, push?: boolean) => void;
  actions?: ReactNode;
}) {
  const { message } = App.useApp();
  const [themeName, setThemeName] = useState<'dark' | 'light'>('dark');
  const [weights, setWeights] = useState(false);
  const [hoverEdge, setHoverEdge] = useState<string | undefined>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<{ focus: () => void } | null>(null);
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
  const errors = verification.issues.filter(i => i.severity === 'error');
  const warnings = verification.issues.filter(i => i.severity === 'warning');

  const go = useCallback((next: ViewerState, push = false) => commit({ ...base, ...(detailId ? { detail: detailId } : {}), ...next }, push), [commit, base, detailId]);
  const clearSelection = useCallback(() => commit({ ...base, ...(detailId ? { detail: detailId } : {}), ...(state.lens ? { lens: state.lens } : {}) }), [commit, base, detailId, state.lens]);

  const focusNode = (id: string) => (state.focus === id && !state.route ? clearSelection() : go({ focus: id, ...(state.lens ? { lens: state.lens } : {}) }));
  const selectEdge = (id: string) => go({ edge: id, ...(state.lens ? { lens: state.lens } : {}) });
  const openDetail = (id: string) => { if (scene.mode === 'components') commit({ ...base, detail: id }, true); };
  const closeDetail = useCallback(() => commit({ ...base }, true), [commit, base]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
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
  const canvasHeight = 'h-[560px] lg:h-[calc(100dvh-300px)] lg:min-h-[480px]';

  if (errors.length > 0) {
    return <Alert type="error" showIcon title="This view failed verification and is not drawn" description={<ul className="list-disc pl-5">{errors.slice(0, 8).map((i, n) => <li key={n}><code>{i.code}</code> {i.message}</li>)}</ul>} />;
  }
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#94a3b8]" role="status">
        <span className="text-[#4ade80]">✓ Verified</span>
        <span>{view.components.length} components · {view.edges.length} dependencies · {view.classes.length} {unitWord(view, view.classes.length)} · generator: {view.generator}</span>
        {warnings.map((w, i) => <span key={i} className="text-[#fbbf24]">{w.code}: {w.message}</span>)}
        {layoutIssues.length > 0 && <span className="text-[#f87171]">Layout check: {layoutIssues.slice(0, 2).map(i => `${i.code} ${i.message}`).join('; ')}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {detailId && <Button icon={<ArrowLeft size={14} />} onClick={closeDetail}>All components{detailName ? ` (viewing ${detailName})` : ''}</Button>}
        <Dropdown trigger={['click']} menu={{ items: [{ key: 'svg', label: 'SVG image' }, { key: 'png', label: 'PNG image' }, { key: 'html', label: 'Standalone HTML' }, { key: 'json', label: 'Verified data (JSON)' }], onClick: ({ key }) => { void run(key as ExportFormat); } }}>
          <Button icon={<Download size={14} />} loading={exporting}>Export</Button>
        </Dropdown>
        <Button aria-label="Keyboard shortcuts" icon={<Keyboard size={14} />} onClick={() => setHelpOpen(true)} />
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <Select ref={searchRef as never} showSearch allowClear placeholder="Find (press /)" aria-label="Find a node" className="w-44" optionFilterProp="label" options={options}
        value={state.focus} onChange={id => (id ? go({ focus: id }) : clearSelection())} />
      <Segmented aria-label="Dependency reach" disabled={!state.focus} value={state.reach ?? 'direct'} options={[{ value: 'direct', label: 'Direct' }, { value: 'upstream', label: 'Used by' }, { value: 'downstream', label: 'Depends on' }]}
        onChange={value => state.focus && go({ focus: state.focus, ...(value === 'direct' ? {} : { reach: value as 'upstream' | 'downstream' }) })} />
      <span className="text-xs text-[#94a3b8]">Route</span>
      <Select aria-label="Route from" allowClear placeholder="From" className="w-32" options={options} value={state.route?.[0]} onChange={id => go(id ? { route: [id, state.route?.[1] ?? ''] as [string, string] } : {})} />
      <Select aria-label="Route to" allowClear placeholder="To" className="w-32" options={options} value={state.route?.[1]}
        onChange={id => (id && state.route?.[0] ? go({ route: [state.route[0], id] }) : id ? go({ route: [state.focus ?? '', id] }) : clearSelection())} />
      {scene.mode === 'components' && <Select mode="multiple" aria-label="Role lens" placeholder="Roles" maxTagCount="responsive" className="min-w-32" options={roleOptions} value={state.lens ?? []}
        onChange={(roles: ComponentRole[]) => commit({ ...base, ...state, lens: roles.length ? roles : undefined })} />}
      <label className="flex items-center gap-2 text-xs text-[#94a3b8]"><Switch size="small" checked={weights} onChange={setWeights} /> Counts</label>
      <label className="flex items-center gap-2 text-xs text-[#94a3b8]"><Switch size="small" checked={themeName === 'light'} onChange={on => setThemeName(on ? 'light' : 'dark')} /> Light theme</label>
    </div>

    {state.route && !highlight.primaryRoute && <Alert type="warning" showIcon title="No dependency path" description="The first component does not depend on the second, directly or through others." />}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <ArchitectureDiagram className={canvasHeight} scene={scene} layout={layout} theme={theme} title={view.title} highlight={highlight} selectedNode={state.focus} selectedEdge={state.edge}
        hoverEdge={hoverEdge} showWeights={weights} onNodeClick={focusNode} onNodeOpen={openDetail} onEdgeClick={selectEdge} onEdgeHover={setHoverEdge} />
      <div className="border border-[#222c37] bg-[#11161b] p-4 lg:max-h-[calc(100dvh-300px)] lg:min-h-[480px] overflow-auto">
        <Inspector view={view} scene={scene} theme={theme} selectedNode={state.focus} selectedEdge={state.edge} highlight={highlight} onSelectNode={focusNode} onSelectEdge={selectEdge} onOpen={openDetail} />
      </div>
    </div>

    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#94a3b8]" aria-label="Legend">
      {roleOptions.map(r => <li key={r.value} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5" style={{ background: THEMES.dark.role[r.value as ComponentRole] }} />{r.label}</li>)}
      <li className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2" style={{ borderColor: THEMES.dark.cycle }} />circular dependency</li>
      <li className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: THEMES.dark.edge }} />points upward</li>
    </ul>

    <Modal open={helpOpen} onCancel={() => setHelpOpen(false)} footer={null} title="Keyboard and mouse">
      <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
        {[['Click / Enter', 'Focus a component (click again to clear)'], ['Double-click / Shift+Enter', 'Show what is inside a component'], ['/', 'Find a component'], ['Esc', 'Clear focus, route or selection; then leave the inner view'], ['T', 'Toggle light / dark theme'], ['W', 'Show dependency counts on all arrows'], ['Drag', 'Pan'], ['Ctrl + scroll', 'Zoom'], ['?', 'This help']].map(([k, v]) => <div key={k} className="contents"><dt className="font-mono text-xs text-[#38bdf8]">{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </Modal>
  </>;
}
