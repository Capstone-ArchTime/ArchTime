import { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { Scene } from '@/features/architecture/scene';
import { ROLE_LABEL } from '@/features/architecture/scene';
import type { DiagramTheme } from '@/features/architecture/theme';
import type { Highlight } from '@/features/architecture/highlight';
import type { SnapshotSummary } from '@/features/architecture/api';
import { formatDate } from '@/i18n/format';
import { useMessages } from '@/i18n/define';
import { ARCH } from './messages';

/**
 * The left panel of the workspace. Layers: every box on the canvas, grouped by role; click selects and brings it into
 * view, double-click opens a component. Snapshots: the project's history, like pages of a design file.
 */
export default function LayersPanel({ scene, theme, highlight, selected, onSelect, onOpen, snapshots, snapshotId, onSnapshot }: {
  /** Absent while the snapshot has no drawing yet: only the snapshot list is shown. */
  scene?: Scene; theme?: DiagramTheme; highlight?: Highlight; selected?: string;
  onSelect?: (id: string) => void; onOpen?: (id: string) => void;
  snapshots?: SnapshotSummary[]; snapshotId?: string; onSnapshot?: (id: string) => void;
}) {
  const m = useMessages(ARCH);
  const [chosen, setTab] = useState<'layers' | 'snapshots'>('layers');
  const tab = scene ? chosen : 'snapshots';
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const nodes = (scene?.nodes ?? []).filter(n => !q || n.title.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q));
  const groups = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const key = n.kind === 'neighbour' ? 'neighbour' : n.role ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  // The snapshot list keeps each snapshot's place in the history (index 0 is the latest) while it is filtered.
  const [snapshotQuery, setSnapshotQuery] = useState('');
  const sq = snapshotQuery.trim().toLowerCase();
  const shownSnapshots = (snapshots ?? []).map((s, i) => ({ s, i })).filter(({ s }) => !sq || s.hash.toLowerCase().includes(sq) || s.title.toLowerCase().includes(sq));
  const label = (key: string) => (key === 'neighbour' ? 'Neighbours' : ROLE_LABEL[key as keyof typeof ROLE_LABEL] ?? key);
  const toggle = (key: string) => setClosed(s => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const tabClass = (t: string) => `px-2 py-1 text-xs font-medium rounded ${tab === t ? 'text-white bg-white/10' : 'text-[var(--at-muted)] hover:text-white'}`;

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex items-center gap-1 border-b border-[var(--at-line)] px-2 py-1.5" role="tablist">
      {scene && <button type="button" role="tab" aria-selected={tab === 'layers'} className={tabClass('layers')} onClick={() => setTab('layers')}>{m('layers')}</button>}
      {snapshots && <button type="button" role="tab" aria-selected={tab === 'snapshots'} className={tabClass('snapshots')} onClick={() => setTab('snapshots')}>{m('snapshots')} <span className="text-[var(--at-muted)]">{snapshots.length}</span></button>}
    </div>

    {tab === 'layers' && scene && theme && highlight && <>
      <label className="mx-2 my-2 flex items-center gap-2 rounded border border-[var(--at-line)] bg-[var(--at-panel-2)] px-2">
        <Search size={13} className="text-[var(--at-muted)]" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={m('searchLayers')} aria-label={m('searchLayers')} className="h-7 w-full bg-transparent text-xs text-[var(--at-text)] outline-none placeholder:text-[var(--at-muted)]" />
      </label>
      <div className="min-h-0 flex-1 overflow-auto pb-3" role="tree" aria-label={m('layers')}>
        {[...groups].map(([key, items]) => <div key={key} role="group" aria-label={label(key)}>
          <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--at-muted)] hover:text-white" aria-expanded={!closed.has(key)} onClick={() => toggle(key)}>
            {closed.has(key) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: key === 'neighbour' ? theme.muted : theme.role[key as keyof typeof theme.role] ?? theme.muted }} />
            {label(key)} <span className="ml-auto font-mono text-[var(--at-muted)]">{items.length}</span>
          </button>
          {!closed.has(key) && items.map(n => {
            const isSel = n.id === selected;
            const dim = !!highlight.nodes && !highlight.nodes.has(n.id);
            return <div key={n.id} role="treeitem" aria-selected={isSel} tabIndex={0}
              className={`mx-1 flex cursor-pointer flex-col rounded px-5 py-1 outline-none focus-visible:ring-1 focus-visible:ring-[var(--at-accent)] ${isSel ? 'bg-[var(--at-accent)]/15 text-white' : 'text-[var(--at-text)] hover:bg-white/5'} ${dim ? 'opacity-50' : ''}`}
              onClick={() => onSelect?.(n.id)} onDoubleClick={() => onOpen?.(n.id)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onOpen?.(n.id); else onSelect?.(n.id); } }}>
              <span className="truncate text-xs">{n.title}</span>
              <span className="truncate text-[10px] text-[var(--at-muted)]">{n.subtitle}</span>
            </div>;
          })}
        </div>)}
        {!nodes.length && <p className="px-3 py-4 text-xs text-[var(--at-muted)]">No layer matches “{query}”.</p>}
      </div>
    </>}

    {tab === 'snapshots' && snapshots && <>
      {snapshots.length > 8 && <label className="mx-2 my-2 flex items-center gap-2 rounded-lg border border-[var(--at-line)] bg-[var(--at-panel)] px-2 focus-within:border-[var(--at-link)]">
        <Search size={13} className="text-[var(--at-muted)]" />
        <input value={snapshotQuery} onChange={e => setSnapshotQuery(e.target.value)} placeholder={m('searchSnapshotsPlaceholder')} aria-label={m('searchSnapshots')} className="h-8 w-full bg-transparent text-xs text-[var(--at-text)] outline-none focus-visible:outline-none placeholder:text-[var(--at-muted)]" />
      </label>}
      <ol className="min-h-0 flex-1 overflow-auto pb-2" aria-label={m('snapshots')}>
        {shownSnapshots.map(({ s, i }) => {
          const current = s.id === snapshotId || (!snapshotId && i === 0);
          return <li key={s.id}>
            <button type="button" aria-current={current} onClick={() => onSnapshot?.(s.id)} title={s.title}
              className={`relative flex w-full flex-col gap-0.5 px-4 py-2 text-left transition-colors ${current ? 'bg-white/[0.08]' : 'hover:bg-white/5'}`}>
              {current && <span aria-hidden="true" className="absolute inset-y-1.5 left-1 w-0.5 rounded-full bg-[var(--at-link)]" />}
              <span className={`truncate text-[13px] ${current ? 'font-medium text-white' : 'text-[var(--at-text)]'}`}>{s.title.split('\n')[0]}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--at-muted)]">
                <code className="text-[var(--at-link)]">{s.hash}</code>
                {s.date && <span>· {formatDate(s.date)}</span>}
                {i === 0 && <span className="ml-auto rounded-full border border-[var(--at-line)] px-1.5 text-[10px]">{m('latest')}</span>}
              </span>
            </button>
          </li>;
        })}
        {!snapshots.length && <li className="px-4 py-4 text-xs text-[var(--at-muted)]">{m('noSnapshots')}</li>}
        {snapshots.length > 0 && !shownSnapshots.length && <li className="px-4 py-4 text-xs text-[var(--at-muted)]">{m('noSnapshotMatch', { query: snapshotQuery })}</li>}
      </ol>
    </>}
  </div>;
}
