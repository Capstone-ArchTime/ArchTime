import { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { Scene } from '@/features/architecture/scene';
import { ROLE_LABEL } from '@/features/architecture/scene';
import type { DiagramTheme } from '@/features/architecture/theme';
import type { Highlight } from '@/features/architecture/highlight';
import type { SnapshotSummary } from '@/features/architecture/api';

/**
 * The left panel of the workspace. Layers: every box on the canvas, grouped by role; click selects and brings it into
 * view, double-click opens a component. Snapshots: the project's history, like pages of a design file.
 */
export default function LayersPanel({ scene, theme, highlight, selected, onSelect, onOpen, snapshots, snapshotId, onSnapshot }: {
  scene: Scene; theme: DiagramTheme; highlight: Highlight; selected?: string;
  onSelect: (id: string) => void; onOpen: (id: string) => void;
  snapshots?: SnapshotSummary[]; snapshotId?: string; onSnapshot?: (id: string) => void;
}) {
  const [tab, setTab] = useState<'layers' | 'snapshots'>('layers');
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const nodes = scene.nodes.filter(n => !q || n.title.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q));
  const groups = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const key = n.kind === 'neighbour' ? 'neighbour' : n.role ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  const label = (key: string) => (key === 'neighbour' ? 'Neighbours' : ROLE_LABEL[key as keyof typeof ROLE_LABEL] ?? key);
  const toggle = (key: string) => setClosed(s => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const tabClass = (t: string) => `px-2 py-1 text-xs font-medium rounded ${tab === t ? 'text-white bg-white/10' : 'text-[#94a3b8] hover:text-white'}`;

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex items-center gap-1 border-b border-[#222c37] px-2 py-1.5" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'layers'} className={tabClass('layers')} onClick={() => setTab('layers')}>Layers</button>
      {snapshots && <button type="button" role="tab" aria-selected={tab === 'snapshots'} className={tabClass('snapshots')} onClick={() => setTab('snapshots')}>Snapshots <span className="text-[#64748b]">{snapshots.length}</span></button>}
    </div>

    {tab === 'layers' && <>
      <label className="mx-2 my-2 flex items-center gap-2 rounded border border-[#222c37] bg-[#0b0f13] px-2">
        <Search size={13} className="text-[#64748b]" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search layers" aria-label="Search layers" className="h-7 w-full bg-transparent text-xs text-[#e2e8f0] outline-none placeholder:text-[#64748b]" />
      </label>
      <div className="min-h-0 flex-1 overflow-auto pb-3" role="tree" aria-label="Layers">
        {[...groups].map(([key, items]) => <div key={key} role="group" aria-label={label(key)}>
          <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-[#94a3b8] hover:text-white" aria-expanded={!closed.has(key)} onClick={() => toggle(key)}>
            {closed.has(key) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: key === 'neighbour' ? theme.muted : theme.role[key as keyof typeof theme.role] ?? theme.muted }} />
            {label(key)} <span className="ml-auto font-mono text-[#64748b]">{items.length}</span>
          </button>
          {!closed.has(key) && items.map(n => {
            const isSel = n.id === selected;
            const dim = !!highlight.nodes && !highlight.nodes.has(n.id);
            return <div key={n.id} role="treeitem" aria-selected={isSel} tabIndex={0}
              className={`mx-1 flex cursor-pointer flex-col rounded px-5 py-1 outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8] ${isSel ? 'bg-[#38bdf8]/15 text-white' : 'text-[#cbd5e1] hover:bg-white/5'} ${dim ? 'opacity-50' : ''}`}
              onClick={() => onSelect(n.id)} onDoubleClick={() => onOpen(n.id)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onOpen(n.id); else onSelect(n.id); } }}>
              <span className="truncate text-xs">{n.title}</span>
              <span className="truncate text-[10px] text-[#64748b]">{n.subtitle}</span>
            </div>;
          })}
        </div>)}
        {!nodes.length && <p className="px-3 py-4 text-xs text-[#64748b]">No layer matches “{query}”.</p>}
      </div>
    </>}

    {tab === 'snapshots' && snapshots && <ol className="min-h-0 flex-1 overflow-auto py-1" aria-label="Snapshots">
      {snapshots.map((s, i) => {
        const current = s.id === snapshotId || (!snapshotId && i === 0);
        return <li key={s.id}>
          <button type="button" aria-current={current} onClick={() => onSnapshot?.(s.id)}
            className={`flex w-full flex-col px-3 py-1.5 text-left ${current ? 'bg-[#38bdf8]/15' : 'hover:bg-white/5'}`}>
            <span className="flex items-center gap-2 text-xs"><code className="text-[#7dd3fc]">{s.hash}</code>{i === 0 && <span className="text-[10px] text-[#64748b]">latest</span>}</span>
            <span className="truncate text-[11px] text-[#cbd5e1]">{s.title.split('\n')[0]}</span>
            {s.date && <span className="text-[10px] text-[#64748b]">{new Date(s.date).toLocaleDateString()}</span>}
          </button>
        </li>;
      })}
      {!snapshots.length && <li className="px-3 py-4 text-xs text-[#64748b]">No snapshots yet. Mine the repository first.</li>}
    </ol>}
  </div>;
}
