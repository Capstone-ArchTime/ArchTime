// How the components of one snapshot came about, read from the server's component lineage (BE ArchitectureService.lineage,
// domain/architecture/matching.ts trackLineages): which are new, split off, merged or renamed since the previous snapshot
// that has components, which disappeared, and the names a component had before. Components are matched through the files
// they hold, with the evidence rule of Compare, so a new grouping of the same files is not reported as a change.
// Pure, so it is tested under Node.

import type { SnapshotSummary } from './api';
import { defineMessages, message } from '../../i18n/define.ts';
import type { Params } from '../../i18n/index.ts';

const TEXT = defineMessages({
  added: 'NEW', addedHelp: 'new since the previous snapshot', split: 'SPLIT', splitHelp: 'split off an earlier component',
  merged: 'MERGED', mergedHelp: 'several earlier components merged into it', renamed: 'RENAMED', renamedHelp: 'the same files under a new name',
  restructured: 'REGROUPED', restructuredHelp: 'files of several components regrouped, with file evidence', and: ' and ',
  removedDeleted: '{was} removed: its files were deleted', removedMoved: '{was} removed: its files went to other components', isAdded: '{now} added',
  splitInto: '{was} split into {now}', mergedInto: '{was} merged into {now}', renamedTo: '{was} renamed to {now}', regrouped: '{was} regrouped into {now}',
}, {
  added: 'MỚI', addedHelp: 'mới kể từ ảnh chụp trước', split: 'TÁCH', splitHelp: 'tách ra từ một thành phần trước đó',
  merged: 'GỘP', mergedHelp: 'nhiều thành phần trước đó gộp vào', renamed: 'ĐỔI TÊN', renamedHelp: 'cùng các tệp nhưng tên mới',
  restructured: 'NHÓM LẠI', restructuredHelp: 'tệp của nhiều thành phần được nhóm lại, có bằng chứng từ tệp', and: ' và ',
  removedDeleted: '{was} bị xoá: các tệp của nó đã bị xoá', removedMoved: '{was} bị xoá: các tệp của nó chuyển sang thành phần khác', isAdded: '{now} được thêm',
  splitInto: '{was} được tách thành {now}', mergedInto: '{was} được gộp vào {now}', renamedTo: '{was} được đổi tên thành {now}', regrouped: '{was} được nhóm lại thành {now}',
});
const tx = (key: Parameters<typeof message<typeof TEXT.en>>[1], params?: Params) => message(TEXT, key, params);

export type EvolutionKind = 'kept' | 'renamed' | 'split' | 'merged' | 'restructured' | 'removed' | 'added';
export interface LineageMember { snapshotId: string; componentId: string; name: string }
export interface LineageChange { kind: EvolutionKind; before: string[]; after: string[]; reason?: string }
export interface LineagePayload {
  /** Oldest first. */
  snapshots: SnapshotSummary[];
  lineages: { id: string; members: LineageMember[] }[];
  /** snapshotId -> componentId -> lineage id */
  byComponent: Record<string, Record<string, string>>;
  steps: { from: string; to: string; changes: LineageChange[] }[];
}

/** What is drawn on a component of the map. Kept components carry no mark. */
export type MarkKind = Exclude<EvolutionKind, 'kept' | 'removed'>;
// Read when shown, so the words follow the chosen language.
const markOf = (kind: MarkKind, color: string) => ({ color, get label() { return tx(kind); }, get help() { return tx(`${kind}Help`); } });
export const EVOLUTION_MARK: Record<MarkKind, { readonly label: string; color: string; readonly help: string }> = {
  added: markOf('added', '#34d399'),
  split: markOf('split', '#fbbf24'),
  merged: markOf('merged', '#c084fc'),
  renamed: markOf('renamed', '#38bdf8'),
  restructured: markOf('restructured', '#fb923c'),
};

export interface EvolutionMark { kind: MarkKind; label: string; color: string; from: string[] }
export interface EvolutionItem { kind: EvolutionKind; text: string; componentIds: string[] }
export interface Evolution {
  /** The snapshot compared with; null when this is the first snapshot with components (nothing to compare). */
  previous: SnapshotSummary | null;
  marks: Record<string, EvolutionMark>;
  items: EvolutionItem[];
  counts: Partial<Record<EvolutionKind, number>>;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const KINDS = new Set<EvolutionKind>(['kept', 'renamed', 'split', 'merged', 'restructured', 'removed', 'added']);

/** The lineage answer, keeping only well-formed entries. */
export function parseLineage(raw: unknown): LineagePayload {
  const r = obj(raw);
  const byComponent: LineagePayload['byComponent'] = {};
  for (const [snapshotId, map] of Object.entries(obj(r.byComponent))) {
    byComponent[snapshotId] = Object.fromEntries(Object.entries(obj(map)).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  }
  return {
    snapshots: arr(r.snapshots).map(obj).filter(s => str(s.id)).map(s => ({ id: str(s.id), hash: str(s.hash), title: str(s.title), date: str(s.date) })),
    lineages: arr(r.lineages).map(obj).filter(l => str(l.id)).map(l => ({
      id: str(l.id),
      members: arr(l.members).map(obj).map(m => ({ snapshotId: str(m.snapshotId), componentId: str(m.componentId), name: str(m.name) })),
    })),
    byComponent,
    steps: arr(r.steps).map(obj).filter(s => str(s.from) && str(s.to)).map(s => ({
      from: str(s.from), to: str(s.to),
      changes: arr(s.changes).map(obj).filter(c => KINDS.has(c.kind as EvolutionKind)).map(c => ({
        kind: c.kind as EvolutionKind, before: arr(c.before).map(str), after: arr(c.after).map(str), ...(str(c.reason) ? { reason: str(c.reason) } : {}),
      })),
    })),
  };
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')}${tx('and')}${names[names.length - 1]}`);

/** The evolution of `snapshotId` against the previous snapshot with components, or null when the lineage does not cover it. */
export function evolutionAt(lineage: LineagePayload | null, snapshotId: string | undefined): Evolution | null {
  if (!lineage || !snapshotId || !lineage.byComponent[snapshotId]) return null;
  const step = lineage.steps.find(s => s.to === snapshotId);
  if (!step) return { previous: null, marks: {}, items: [], counts: {} };

  const names = new Map<string, string>();
  for (const l of lineage.lineages) for (const m of l.members) names.set(`${m.snapshotId}:${m.componentId}`, m.name);
  const before = (id: string) => names.get(`${step.from}:${id}`) ?? id;
  const after = (id: string) => names.get(`${snapshotId}:${id}`) ?? id;

  const marks: Record<string, EvolutionMark> = {};
  const items: EvolutionItem[] = [];
  const counts: Evolution['counts'] = {};
  const mark = (kind: MarkKind, id: string, from: string[]) => { marks[id] = { kind, label: EVOLUTION_MARK[kind].label, color: EVOLUTION_MARK[kind].color, from }; };
  for (const change of step.changes) {
    const was = change.before.map(before), now = change.after.map(after);
    if (change.kind === 'kept') continue;
    counts[change.kind] = (counts[change.kind] ?? 0) + 1;
    if (change.kind === 'removed') {
      items.push({ kind: 'removed', text: tx(change.reason === 'deleted' ? 'removedDeleted' : 'removedMoved', { was: list(was) }), componentIds: [] });
      continue;
    }
    for (const id of change.after) mark(change.kind, id, was);
    const params = { was: list(was), now: list(now) };
    const text = change.kind === 'added' ? tx('isAdded', params)
      : change.kind === 'split' ? tx('splitInto', params)
      : change.kind === 'merged' ? tx('mergedInto', params)
      : change.kind === 'renamed' ? tx('renamedTo', params)
      : tx('regrouped', params);
    items.push({ kind: change.kind, text, componentIds: change.after });
  }
  return { previous: lineage.snapshots.find(s => s.id === step.from) ?? null, marks, items, counts };
}

export interface HistoryEntry { snapshot: SnapshotSummary | null; snapshotId: string; name: string }

/** The component's line through earlier snapshots, oldest first, ending at `snapshotId`; [] when the lineage does not know it. */
export function historyOf(lineage: LineagePayload | null, snapshotId: string | undefined, componentId: string | undefined): HistoryEntry[] {
  if (!lineage || !snapshotId || !componentId) return [];
  const id = lineage.byComponent[snapshotId]?.[componentId];
  const line = id ? lineage.lineages.find(l => l.id === id) : undefined;
  if (!line) return [];
  const order = new Map(lineage.snapshots.map((s, i) => [s.id, i]));
  const end = order.get(snapshotId) ?? Infinity;
  return line.members
    .filter(m => (order.get(m.snapshotId) ?? Infinity) <= end)
    .map(m => ({ snapshot: lineage.snapshots.find(s => s.id === m.snapshotId) ?? null, snapshotId: m.snapshotId, name: m.name }));
}
