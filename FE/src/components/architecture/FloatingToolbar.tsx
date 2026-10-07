import type { ReactNode, Ref } from 'react';
import { Dropdown, Popover, Segmented, Select, Tooltip } from 'antd';
import { Download, Expand, Hash, Keyboard, Map as MapIcon, Maximize, Minimize, Minus, Moon, PanelRight, Plus, Route, Scan, Shapes, Sun } from 'lucide-react';
import type { Viewport } from './ArchitectureDiagram';
import type { ExportFormat } from './export';
import type { ComponentRole } from '@/features/architecture/types';

type Option = { value: string; label: string };

function Tool({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return <Tooltip title={shortcut ? <span>{label} <kbd className="ml-1 rounded bg-white/10 px-1 font-mono text-[10px]">{shortcut}</kbd></span> : label} placement="top">
    <button type="button" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={`h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-[#cbd5e1] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent ${active ? 'bg-[#38bdf8]/15 text-[#7dd3fc]' : ''}`}>
      {children}
    </button>
  </Tooltip>;
}
const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-[#2a3441]" />;

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
  return (
    <div data-overlay role="toolbar" aria-label="Diagram tools"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-xl border border-[#2a3441] bg-[#11161b]/95 px-2 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
      <Select ref={searchRef as never} showSearch allowClear size="small" variant="borderless" placeholder="Find…  /" aria-label="Find a node" className="w-40 shrink-0"
        optionFilterProp="label" options={p.options} value={p.focus} onChange={id => p.onFind(id ?? undefined)} />
      {p.focus && <Segmented size="small" aria-label="Dependency reach" value={p.reach}
        options={[{ value: 'direct', label: 'Direct' }, { value: 'upstream', label: 'Used by' }, { value: 'downstream', label: 'Depends on' }]}
        onChange={value => p.onReach(value as 'direct' | 'upstream' | 'downstream')} />}
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
      <Tool label="Zoom out" shortcut="-" onClick={v.zoomOut}><Minus size={16} /></Tool>
      <Dropdown trigger={['click']} placement="top" menu={{
        items: [
          { key: 'fit', label: 'Fit diagram  (0)' }, { key: 'sel', label: 'Zoom to selection  (F)', disabled: !p.hasSelection },
          { type: 'divider' }, { key: '0.5', label: '50%' }, { key: '1', label: '100%' }, { key: '2', label: '200%' },
        ],
        onClick: ({ key }) => (key === 'fit' ? v.fit() : key === 'sel' ? v.frameSelection() : v.setZoom(Number(key))),
      }}>
        <button type="button" aria-label={`Zoom ${Math.round(v.zoom * 100)}%, choose a level`} className="h-8 w-14 rounded-md font-mono text-xs text-[#cbd5e1] hover:bg-white/10">{Math.round(v.zoom * 100)}%</button>
      </Dropdown>
      <Tool label="Zoom in" shortcut="+" onClick={v.zoomIn}><Plus size={16} /></Tool>
      <Tool label="Fit diagram" shortcut="0" onClick={v.fit}><Expand size={16} /></Tool>
      <Tool label="Zoom to selection" shortcut="F" disabled={!p.hasSelection} onClick={v.frameSelection}><Scan size={16} /></Tool>

      <Divider />
      <Tool label="Dependency counts on all arrows" shortcut="W" active={p.weights} onClick={p.onWeights}><Hash size={16} /></Tool>
      <Tool label={p.light ? 'Dark theme' : 'Light theme'} shortcut="T" onClick={p.onTheme}>{p.light ? <Moon size={16} /> : <Sun size={16} />}</Tool>
      <Tool label="Minimap" shortcut="M" active={v.minimap} onClick={v.toggleMinimap}><MapIcon size={16} /></Tool>
      <Tool label="Details panel" active={p.inspector} onClick={p.onInspector}><PanelRight size={16} /></Tool>

      <Divider />
      <Dropdown trigger={['click']} placement="top" menu={{ items: [{ key: 'svg', label: 'SVG image' }, { key: 'png', label: 'PNG image' }, { key: 'html', label: 'Standalone HTML' }, { key: 'json', label: 'Verified data (JSON)' }], onClick: ({ key }) => p.onExport(key as ExportFormat) }}>
        <span><Tool label="Export" disabled={p.exporting}><Download size={16} /></Tool></span>
      </Dropdown>
      <Tool label={v.fullscreen ? 'Exit full screen' : 'Full screen'} onClick={v.toggleFullscreen}>{v.fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</Tool>
      <Tool label="Keyboard and mouse" shortcut="?" onClick={p.onHelp}><Keyboard size={16} /></Tool>
    </div>
  );
}
