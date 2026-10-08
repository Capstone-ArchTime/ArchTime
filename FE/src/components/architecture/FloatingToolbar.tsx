import type { ReactNode, Ref } from 'react';
import { Dropdown, Popover, Select, Tooltip } from 'antd';
import { Check, ChevronDown, Download, Ellipsis, Expand, Hash, Keyboard, Map as MapIcon, Maximize, Minimize, Minus, Moon, PanelRight, Plus, Route, Scan, Shapes, Sun } from 'lucide-react';
import type { Viewport } from './ArchitectureDiagram';
import type { ExportFormat } from './export';
import type { ComponentRole } from '@/features/architecture/types';

type Option = { value: string; label: string };

function Tool({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return <Tooltip title={shortcut ? <span>{label} <kbd className="ml-1 rounded bg-white/10 px-1 font-mono text-[10px]">{shortcut}</kbd></span> : label} placement="top">
    <button type="button" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={`h-8 min-w-8 shrink-0 px-1.5 flex items-center justify-center rounded-md text-[#cbd5e1] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent ${active ? 'bg-[#3b82f6]/15 text-[#60a5fa]' : ''}`}>
      {children}
    </button>
  </Tooltip>;
}
/** Below this artboard width the display and output tools fold into a "More" menu. */
const ROOMY = 860;
const mark = (on: boolean) => <span className="inline-flex w-4">{on && <Check size={13} />}</span>;

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[#2a3441]" />;

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
  inspector: boolean; onInspector: () => void;
  exporting: boolean; onExport: (format: ExportFormat) => void;
  onHelp: () => void;
  hasSelection: boolean;
}) {
  const v = p.viewport;
  const routeSet = !!(p.route?.[0] && p.route?.[1]);
  const compact = v.width > 0 && v.width < ROOMY;
  // Phone-sized: zoom steps, fit and frame stay in the zoom menu (and pinch), not as buttons.
  const tiny = v.width > 0 && v.width < 520;
  const exports = [{ key: 'svg', label: 'SVG image' }, { key: 'png', label: 'PNG image' }, { key: 'html', label: 'Standalone HTML' }, { key: 'json', label: 'Verified data (JSON)' }];
  return (
    <div data-overlay role="toolbar" aria-label="Diagram tools"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-xl border border-[#2a3441] bg-[#11161b]/95 px-2 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
      <Select ref={searchRef as never} showSearch allowClear size="small" variant="borderless" placeholder="Find…  /" aria-label="Find a node" className="w-32 shrink-0"
        optionFilterProp="label" options={p.options} value={p.focus} onChange={id => p.onFind(id ?? undefined)} />
      {p.focus && <Dropdown trigger={['click']} placement="top" menu={{
        selectable: true, selectedKeys: [p.reach],
        items: [{ key: 'direct', label: 'Direct neighbours' }, { key: 'upstream', label: 'Used by (everything that depends on it)' }, { key: 'downstream', label: 'Depends on (everything it needs)' }],
        onClick: ({ key }) => p.onReach(key as 'direct' | 'upstream' | 'downstream'),
      }}>
        <button type="button" aria-label="Dependency reach" className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-[#60a5fa] hover:bg-white/10">
          {p.reach === 'upstream' ? 'Used by' : p.reach === 'downstream' ? 'Depends on' : 'Direct'} <ChevronDown size={12} />
        </button>
      </Dropdown>}
      <Popover trigger="click" placement="top" title="Dependency route" content={
        <div className="flex flex-col gap-2 w-60">
          <Select aria-label="Route from" allowClear showSearch optionFilterProp="label" placeholder="From" options={p.options} value={p.route?.[0] || undefined} onChange={id => p.onRouteFrom(id ?? undefined)} />
          <Select aria-label="Route to" allowClear showSearch optionFilterProp="label" placeholder="To" options={p.options} value={p.route?.[1] || undefined} onChange={id => p.onRouteTo(id ?? undefined)} />
          <p className="text-xs text-[#94a3b8]">Highlights how the first depends on the second.</p>
        </div>}>
        <span><Tool label="Route between two nodes" active={routeSet}><Route size={16} /></Tool></span>
      </Popover>
      {p.roleOptions && <Popover trigger="click" placement="top" title="Show roles" content={
        <Select mode="multiple" aria-label="Role lens" allowClear placeholder="All roles" className="w-60" options={p.roleOptions} value={p.lens ?? []} onChange={(roles: ComponentRole[]) => p.onLens(roles)} />}>
        <span><Tool label="Filter by role" active={!!p.lens?.length}><Shapes size={16} /></Tool></span>
      </Popover>}

      <Divider />
      {!tiny && <Tool label="Zoom out" shortcut="-" onClick={v.zoomOut}><Minus size={16} /></Tool>}
      <Dropdown trigger={['click']} placement="top" menu={{
        items: [
          ...(tiny ? [{ key: 'in', label: 'Zoom in  (+)' }, { key: 'out', label: 'Zoom out  (-)' }] : []),
          { key: 'fit', label: 'Fit diagram  (0)' }, { key: 'sel', label: 'Zoom to selection  (F)', disabled: !p.hasSelection },
          { type: 'divider' }, { key: '0.5', label: '50%' }, { key: '1', label: '100%' }, { key: '2', label: '200%' },
        ],
        onClick: ({ key }) => (key === 'fit' ? v.fit() : key === 'sel' ? v.frameSelection() : key === 'in' ? v.zoomIn() : key === 'out' ? v.zoomOut() : v.setZoom(Number(key))),
      }}>
        <button type="button" aria-label={`Zoom ${Math.round(v.zoom * 100)}%, choose a level`} className="h-8 w-12 shrink-0 rounded-md font-mono text-xs text-[#cbd5e1] hover:bg-white/10">{Math.round(v.zoom * 100)}%</button>
      </Dropdown>
      {!tiny && <>
      <Tool label="Zoom in" shortcut="+" onClick={v.zoomIn}><Plus size={16} /></Tool>
      <Tool label="Fit diagram" shortcut="0" onClick={v.fit}><Expand size={16} /></Tool>
      <Tool label="Zoom to selection" shortcut="F" disabled={!p.hasSelection} onClick={v.frameSelection}><Scan size={16} /></Tool>
      </>}

      {compact && <>
        <Divider />
        <Dropdown trigger={['click']} placement="topRight" menu={{
          items: [
            { key: 'weights', label: <span className="flex items-center">{mark(p.weights)}Dependency counts  <kbd className="ml-auto pl-4 text-[10px] opacity-60">W</kbd></span> },
            { key: 'theme', label: <span className="flex items-center">{mark(p.light)}Light theme <kbd className="ml-auto pl-4 text-[10px] opacity-60">T</kbd></span> },
            { key: 'minimap', label: <span className="flex items-center">{mark(v.minimap)}Minimap <kbd className="ml-auto pl-4 text-[10px] opacity-60">M</kbd></span> },
            { key: 'inspector', label: <span className="flex items-center">{mark(p.inspector)}Details panel</span> },
            { type: 'divider' },
            { key: 'export', label: 'Export', disabled: p.exporting, children: exports },
            { key: 'fullscreen', label: v.fullscreen ? 'Exit full screen' : 'Full screen' },
            { key: 'help', label: 'Keyboard and mouse  ?' },
          ],
          onClick: ({ key, keyPath }) => {
            if (keyPath.length > 1) p.onExport(key as ExportFormat);
            else if (key === 'weights') p.onWeights();
            else if (key === 'theme') p.onTheme();
            else if (key === 'minimap') v.toggleMinimap();
            else if (key === 'inspector') p.onInspector();
            else if (key === 'fullscreen') v.toggleFullscreen();
            else if (key === 'help') p.onHelp();
          },
        }}>
          <span><Tool label="More"><Ellipsis size={16} /></Tool></span>
        </Dropdown>
      </>}
      {!compact && <>
      <Divider />
      <Tool label="Dependency counts on all arrows" shortcut="W" active={p.weights} onClick={p.onWeights}><Hash size={16} /></Tool>
      <Tool label={p.light ? 'Dark theme' : 'Light theme'} shortcut="T" onClick={p.onTheme}>{p.light ? <Moon size={16} /> : <Sun size={16} />}</Tool>
      <Tool label="Minimap" shortcut="M" active={v.minimap} onClick={v.toggleMinimap}><MapIcon size={16} /></Tool>
      <Tool label="Details panel" active={p.inspector} onClick={p.onInspector}><PanelRight size={16} /></Tool>

      <Divider />
      <Dropdown trigger={['click']} placement="top" menu={{ items: exports, onClick: ({ key }) => p.onExport(key as ExportFormat) }}>
        <span><Tool label="Export" disabled={p.exporting}><Download size={16} /></Tool></span>
      </Dropdown>
      <Tool label={v.fullscreen ? 'Exit full screen' : 'Full screen'} onClick={v.toggleFullscreen}>{v.fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</Tool>
      <Tool label="Keyboard and mouse" shortcut="?" onClick={p.onHelp}><Keyboard size={16} /></Tool>
      </>}
    </div>
  );
}
