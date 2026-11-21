import type { ReactNode, Ref } from 'react';
import { Dropdown, Popover, Select, Tooltip } from 'antd';
import { Check, ChevronDown, Download, Ellipsis, Expand, Hash, Keyboard, Map as MapIcon, Maximize, Minimize, Minus, Moon, PanelLeft, PanelRight, Plus, Route, Scan, Shapes, Sun } from 'lucide-react';
import type { Viewport } from './ArchitectureDiagram';
import type { ExportFormat } from './export';
import type { ComponentRole } from '@/features/architecture/types';
import { useMessages } from '@/i18n/define';
import { ARCH } from './messages';

type Option = { value: string; label: string };

function Tool({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return <Tooltip title={shortcut ? <span>{label} <kbd className="ml-1 rounded bg-[var(--at-hover)] px-1 font-mono text-[10px]">{shortcut}</kbd></span> : label} placement="top">
    <button type="button" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={`h-8 min-w-8 shrink-0 px-1.5 flex items-center justify-center rounded-md text-[var(--at-text)] transition-colors hover:bg-[var(--at-hover)] hover:text-[var(--at-text-strong)] disabled:opacity-35 disabled:hover:bg-transparent ${active ? 'bg-[var(--at-accent)]/15 text-[var(--at-link)]' : ''}`}>
      {children}
    </button>
  </Tooltip>;
}
/** Below this artboard width the display and output tools fold into a "More" menu. */
const ROOMY = 940;
const mark = (on: boolean) => <span className="inline-flex w-4">{on && <Check size={13} />}</span>;

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[var(--at-line)]" />;

/**
 * The artboard's controls in one floating bar at the bottom: find and trace on the left, view in the middle, display and
 * output on the right. Route and role filters open upwards so they never cover the toolbar's own row.
 */
export default function FloatingToolbar({ searchRef, ...p }: {
  viewport: Viewport;
  options: Option[];
  searchRef: Ref<unknown>;
  focus?: string;
  onFind: (id?: string) => void;
  reach: 'direct' | 'upstream' | 'downstream';
  onReach: (value: 'direct' | 'upstream' | 'downstream') => void;
  route?: [string, string];
  onRouteFrom: (id?: string) => void;
  onRouteTo: (id?: string) => void;
  roleOptions?: Option[];
  lens?: ComponentRole[];
  onLens: (roles: ComponentRole[]) => void;
  weights: boolean; onWeights: () => void;
  light: boolean; onTheme: () => void;
  layers: boolean; onLayers: () => void;
  inspector: boolean; onInspector: () => void;
  /** In-page full screen: only the artboard and this toolbar stay. */
  focusMode: boolean; onFocusMode: () => void;
  exporting: boolean; onExport: (format: ExportFormat) => void;
  onHelp: () => void;
  hasSelection: boolean;
}) {
  const v = p.viewport;
  const m = useMessages(ARCH);
  const routeSet = !!(p.route?.[0] && p.route?.[1]);
  const compact = v.width > 0 && v.width < ROOMY;
  // Phone-sized: zoom steps, fit and frame stay in the zoom menu (and pinch), not as buttons.
  const tiny = v.width > 0 && v.width < 520;
  const exports = [{ key: 'svg', label: m('svg') }, { key: 'png', label: m('png') }, { key: 'html', label: m('html') }, { key: 'json', label: m('json') }];
  return (
    <div data-overlay role="toolbar" aria-label={m('tools')}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-xl border border-[var(--at-line)] bg-[var(--at-panel)]/95 px-2 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
      <Select ref={searchRef as never} showSearch allowClear size="small" variant="borderless" placeholder={m('find')} aria-label={m('findNode')} className="w-32 shrink-0"
        optionFilterProp="label" options={p.options} value={p.focus} onChange={id => p.onFind(id ?? undefined)} />
      {p.focus && <Dropdown trigger={['click']} placement="top" menu={{
        selectable: true, selectedKeys: [p.reach],
        items: [{ key: 'direct', label: m('directNeighbours') }, { key: 'upstream', label: m('usedByAll') }, { key: 'downstream', label: m('dependsOnAll') }],
        onClick: ({ key }) => p.onReach(key as 'direct' | 'upstream' | 'downstream'),
      }}>
        <button type="button" aria-label={m('reach')} className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-[var(--at-link)] hover:bg-[var(--at-hover)]">
          {p.reach === 'upstream' ? m('usedBy') : p.reach === 'downstream' ? m('dependsOn') : m('direct')} <ChevronDown size={12} />
        </button>
      </Dropdown>}
      <Popover trigger="click" placement="top" title={m('route')} content={
        <div className="flex flex-col gap-2 w-60">
          <Select aria-label={m('routeFrom')} allowClear showSearch optionFilterProp="label" placeholder={m('from')} options={p.options} value={p.route?.[0] || undefined} onChange={id => p.onRouteFrom(id ?? undefined)} />
          <Select aria-label={m('routeTo')} allowClear showSearch optionFilterProp="label" placeholder={m('to')} options={p.options} value={p.route?.[1] || undefined} onChange={id => p.onRouteTo(id ?? undefined)} />
          <p className="text-xs text-[var(--at-muted)]">{m('routeHint')}</p>
        </div>}>
        <span><Tool label={m('routeTool')} active={routeSet}><Route size={16} /></Tool></span>
      </Popover>
      {p.roleOptions && <Popover trigger="click" placement="top" title={m('showRoles')} content={
        <Select mode="multiple" aria-label={m('roleLens')} allowClear placeholder={m('allRoles')} className="w-60" options={p.roleOptions} value={p.lens ?? []} onChange={(roles: ComponentRole[]) => p.onLens(roles)} />}>
        <span><Tool label={m('filterRole')} active={!!p.lens?.length}><Shapes size={16} /></Tool></span>
      </Popover>}

      <Divider />
      {!tiny && <Tool label={m('zoomOut')} shortcut="-" onClick={v.zoomOut}><Minus size={16} /></Tool>}
      <Dropdown trigger={['click']} placement="top" menu={{
        items: [
          ...(tiny ? [{ key: 'in', label: m('zoomInKey') }, { key: 'out', label: m('zoomOutKey') }] : []),
          { key: 'fit', label: m('fitKey') }, { key: 'sel', label: m('zoomSelKey'), disabled: !p.hasSelection },
          { type: 'divider' }, { key: '0.5', label: '50%' }, { key: '1', label: '100%' }, { key: '2', label: '200%' },
        ],
        onClick: ({ key }) => (key === 'fit' ? v.fit() : key === 'sel' ? v.frameSelection() : key === 'in' ? v.zoomIn() : key === 'out' ? v.zoomOut() : v.setZoom(Number(key))),
      }}>
        <button type="button" aria-label={m('zoomLevel', { pct: Math.round(v.zoom * 100) })} className="h-8 w-12 shrink-0 rounded-md font-mono text-xs text-[var(--at-text)] hover:bg-[var(--at-hover)]">{Math.round(v.zoom * 100)}%</button>
      </Dropdown>
      {!tiny && <>
      <Tool label={m('zoomIn')} shortcut="+" onClick={v.zoomIn}><Plus size={16} /></Tool>
      <Tool label={m('fit')} shortcut="0" onClick={v.fit}><Expand size={16} /></Tool>
      <Tool label={m('zoomSel')} shortcut="F" disabled={!p.hasSelection} onClick={v.frameSelection}><Scan size={16} /></Tool>
      </>}

      {compact && <>
        <Divider />
        <Dropdown trigger={['click']} placement="topRight" menu={{
          items: [
            { key: 'weights', label: <span className="flex items-center">{mark(p.weights)}{m('counts')}  <kbd className="ml-auto pl-4 text-[10px] opacity-60">W</kbd></span> },
            { key: 'theme', label: <span className="flex items-center">{mark(p.light)}{m('lightTheme')} <kbd className="ml-auto pl-4 text-[10px] opacity-60">T</kbd></span> },
            { key: 'minimap', label: <span className="flex items-center">{mark(v.minimap)}{m('minimap')} <kbd className="ml-auto pl-4 text-[10px] opacity-60">M</kbd></span> },
            { key: 'layers', label: <span className="flex items-center">{mark(p.layers)}{m('layersPanel')}</span> },
            { key: 'inspector', label: <span className="flex items-center">{mark(p.inspector)}{m('detailsPanel')}</span> },
            { type: 'divider' },
            { key: 'export', label: m('export'), disabled: p.exporting, children: exports },
            { key: 'fullscreen', label: <span className="flex items-center">{p.focusMode ? m('exitFullScreen') : m('fullScreen')}<kbd className="ml-auto pl-4 text-[10px] opacity-60">Shift+F</kbd></span> },
            { key: 'help', label: m('keyboardKey') },
          ],
          onClick: ({ key, keyPath }) => {
            if (keyPath.length > 1) p.onExport(key as ExportFormat);
            else if (key === 'weights') p.onWeights();
            else if (key === 'theme') p.onTheme();
            else if (key === 'minimap') v.toggleMinimap();
            else if (key === 'layers') p.onLayers();
            else if (key === 'inspector') p.onInspector();
            else if (key === 'fullscreen') p.onFocusMode();
            else if (key === 'help') p.onHelp();
          },
        }}>
          <span><Tool label={m('more')}><Ellipsis size={16} /></Tool></span>
        </Dropdown>
      </>}
      {!compact && <>
      <Divider />
      <Tool label={m('countsAll')} shortcut="W" active={p.weights} onClick={p.onWeights}><Hash size={16} /></Tool>
      <Tool label={p.light ? m('darkTheme') : m('lightTheme')} shortcut="T" onClick={p.onTheme}>{p.light ? <Moon size={16} /> : <Sun size={16} />}</Tool>
      <Tool label={m('minimap')} shortcut="M" active={v.minimap} onClick={v.toggleMinimap}><MapIcon size={16} /></Tool>
      <Tool label={m('layersPanel')} shortcut="Ctrl+\" active={p.layers} onClick={p.onLayers}><PanelLeft size={16} /></Tool>
      <Tool label={m('detailsPanel')} shortcut="Ctrl+\" active={p.inspector} onClick={p.onInspector}><PanelRight size={16} /></Tool>

      <Divider />
      <Dropdown trigger={['click']} placement="top" menu={{ items: exports, onClick: ({ key }) => p.onExport(key as ExportFormat) }}>
        <span><Tool label={m('export')} disabled={p.exporting}><Download size={16} /></Tool></span>
      </Dropdown>
      <Tool label={p.focusMode ? m('exitFullScreen') : m('fullScreen')} shortcut="Shift+F" active={p.focusMode} onClick={p.onFocusMode}>{p.focusMode ? <Minimize size={16} /> : <Maximize size={16} />}</Tool>
      <Tool label={m('keyboard')} shortcut="?" onClick={p.onHelp}><Keyboard size={16} /></Tool>
      </>}
    </div>
  );
}
