// Which component of one snapshot became which component of a later one.
// Every snapshot is clustered on its own, and component ids are slugs of names that a model may change, so ids cannot be
// compared across snapshots. Components are matched through the files they hold instead: a link between two components
// is backed by the files they share, and every kind of change (kept, renamed, split, merged, ...) is read off those links.
// Deterministic: the same inputs always give the same result, whatever order they arrive in.

export interface MatchComponent { id: string; name: string; memberIds: string[] }

export interface MatchOptions {
  /**
   * A link counts when more than this share of the earlier component's surviving files went to the later one, or more
   * than this share of the later component's files came from the earlier one. New files count against the second
   * share, so one old file in a mostly new component does not make that component a continuation. At 0.5 a link needs a strict
   * majority on one side, so a component split exactly in two halves is dissolved rather than merged into either.
   */
  dominance: number;
  /** Pair a vanished file with an appeared file of the same, otherwise unique, name as one file that moved. */
  detectMoves: boolean;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = { dominance: 0.5, detectMoves: true };

export interface FileMove { from: string; to: string }

export interface ComponentLink {
  before: string;
  after: string;
  /** Files the two components share, as named in the later snapshot. The evidence for the link. */
  shared: string[];
  /** Share of the earlier component's surviving files that are in the later one. */
  forward: number;
  /** Share of the later component's files (new ones included) that came from the earlier one. */
  backward: number;
}

export type ChangeKind = 'kept' | 'renamed' | 'split' | 'merged' | 'restructured' | 'removed' | 'added';

export interface ComponentChange {
  kind: ChangeKind;
  before: string[];
  after: string[];
  /**
   * removed: its files were deleted, or scattered over components it does not dominate.
   * added: made of new files, or assembled from files no earlier component dominated.
   */
  reason?: 'deleted' | 'dissolved' | 'new-files' | 'assembled';
}

export interface ComponentMatching {
  links: ComponentLink[];
  changes: ComponentChange[];
  /** The later component that continues each earlier one (one-to-one), or null when none does. */
  successor: Record<string, string | null>;
  moves: FileMove[];
  files: { common: number; added: number; removed: number; moved: number };
  summary: Record<ChangeKind, number>;
}

/** File names too common to say that two files are the same file. */
const GENERIC_NAMES = new Set([
  'index', '__init__', 'mod', 'main', 'app', 'types', 'utils', 'util', 'helpers', 'constants', 'config', 'package-info',
  'module-info', 'readme', 'setup', 'settings', 'routes', 'models', 'views', 'tests', 'test',
]);

const baseName = (path: string) => path.split('/').pop() ?? path;
const stem = (path: string) => baseName(path).replace(/\.[^.]+$/, '').toLowerCase();
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const round = (x: number) => Math.round(x * 10_000) / 10_000;

/** Vanished and appeared files that share a file name no other vanished or appeared file has. */
export function detectMoves(removed: string[], added: string[]): FileMove[] {
  const group = (paths: string[]) => {
    const out = new Map<string, string[]>();
    for (const p of paths) {
      const key = baseName(p);
      if (GENERIC_NAMES.has(stem(p))) continue;
      out.set(key, [...(out.get(key) ?? []), p]);
    }
    return out;
  };
  const gone = group(removed), appeared = group(added);
  const moves: FileMove[] = [];
  for (const [name, from] of gone) {
    const to = appeared.get(name);
    if (from.length === 1 && to?.length === 1) moves.push({ from: from[0], to: to[0] });
  }
  return moves.sort((a, b) => byText(a.from, b.from));
}

/**
 * Matches the components of an earlier snapshot (`before`) with those of a later one (`after`).
 * Components with no files are ignored.
 */
export function matchComponents(before: MatchComponent[], after: MatchComponent[], options: Partial<MatchOptions> = {}): ComponentMatching {
  const { dominance, detectMoves: findMoves } = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const earlier = [...before].filter(c => c.memberIds.length).sort((a, b) => byText(a.id, b.id));
  const later = [...after].filter(c => c.memberIds.length).sort((a, b) => byText(a.id, b.id));

  const ownerAfter = new Map<string, string>();
  for (const c of later) for (const f of c.memberIds) if (!ownerAfter.has(f)) ownerAfter.set(f, c.id);
  const filesBefore = new Set(earlier.flatMap(c => c.memberIds));
  const removedFiles = [...filesBefore].filter(f => !ownerAfter.has(f)).sort(byText);
  const addedFiles = [...ownerAfter.keys()].filter(f => !filesBefore.has(f)).sort(byText);
  const moves = findMoves ? detectMoves(removedFiles, addedFiles) : [];
  const movedTo = new Map(moves.map(m => [m.from, m.to]));

  /** Where an earlier file is in the later snapshot, or null when it is gone. */
  const carry = (f: string) => (ownerAfter.has(f) ? f : movedTo.get(f) ?? null);
  const inherited = new Set<string>(); // later files that existed before
  const sharedFiles = new Map<string, string[]>(); // "before\0after" -> files
  const survivors = new Map<string, number>();
  for (const a of earlier) {
    let alive = 0;
    for (const f of new Set(a.memberIds)) {
      const g = carry(f);
      if (!g) continue;
      alive++;
      inherited.add(g);
      const key = `${a.id}\u0000${ownerAfter.get(g)}`;
      sharedFiles.set(key, [...(sharedFiles.get(key) ?? []), g]);
    }
    survivors.set(a.id, alive);
  }
  const sizeAfter = new Map(later.map(b => [b.id, new Set(b.memberIds).size]));
  const preexisting = new Map(later.map(b => [b.id, new Set(b.memberIds.filter(f => inherited.has(f))).size]));

  const links: ComponentLink[] = [];
  for (const [key, files] of sharedFiles) {
    const [a, b] = key.split('\u0000');
    const forward = files.length / survivors.get(a)!;
    const backward = files.length / sizeAfter.get(b)!;
    if (forward > dominance || backward > dominance) {
      links.push({ before: a, after: b, shared: files.sort(byText), forward: round(forward), backward: round(backward) });
    }
  }
  links.sort((x, y) => byText(x.before, y.before) || byText(x.after, y.after));

  const changes = classify(earlier, later, links, survivors, preexisting);
  const summary = Object.fromEntries((['kept', 'renamed', 'split', 'merged', 'restructured', 'removed', 'added'] as ChangeKind[]).map(k => [k, 0])) as Record<ChangeKind, number>;
  for (const c of changes) summary[c.kind]++;

  return {
    links,
    changes,
    successor: successors(earlier, links),
    moves,
    files: { common: [...filesBefore].filter(f => ownerAfter.has(f)).length, added: addedFiles.length - moves.length, removed: removedFiles.length - moves.length, moved: moves.length },
    summary,
  };
}

/** Groups components connected by links and names each group by its shape: one-to-one, one-to-many, many-to-one, ... */
function classify(
  earlier: MatchComponent[], later: MatchComponent[], links: ComponentLink[],
  survivors: Map<string, number>, preexisting: Map<string, number>,
): ComponentChange[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const union = (x: string, y: string) => { const a = find(x), b = find(y); if (a !== b) parent.set(a < b ? b : a, a < b ? a : b); };
  const nodeA = (id: string) => `a:${id}`, nodeB = (id: string) => `b:${id}`;
  for (const l of links) union(nodeA(l.before), nodeB(l.after));

  const groups = new Map<string, { before: string[]; after: string[] }>();
  const linkedA = new Set(links.map(l => l.before)), linkedB = new Set(links.map(l => l.after));
  for (const id of linkedA) { const g = groups.get(find(nodeA(id))) ?? { before: [], after: [] }; g.before.push(id); groups.set(find(nodeA(id)), g); }
  for (const id of linkedB) { const g = groups.get(find(nodeB(id))) ?? { before: [], after: [] }; g.after.push(id); groups.set(find(nodeB(id)), g); }

  const names = new Map<string, string>([...earlier.map(c => [`a:${c.id}`, c.name] as const), ...later.map(c => [`b:${c.id}`, c.name] as const)]);
  const changes: ComponentChange[] = [];
  for (const g of groups.values()) {
    g.before.sort(byText); g.after.sort(byText);
    const kind: ChangeKind = g.before.length === 1 && g.after.length === 1
      ? (sameName(names.get(nodeA(g.before[0]))!, names.get(nodeB(g.after[0]))!) ? 'kept' : 'renamed')
      : g.before.length === 1 ? 'split' : g.after.length === 1 ? 'merged' : 'restructured';
    changes.push({ kind, before: g.before, after: g.after });
  }
  for (const c of earlier) if (!linkedA.has(c.id)) changes.push({ kind: 'removed', before: [c.id], after: [], reason: survivors.get(c.id) ? 'dissolved' : 'deleted' });
  for (const c of later) if (!linkedB.has(c.id)) changes.push({ kind: 'added', before: [], after: [c.id], reason: preexisting.get(c.id) ? 'assembled' : 'new-files' });
  const first = (c: ComponentChange) => c.before[0] ?? `\uffff${c.after[0]}`; // added components last
  return changes.sort((x, y) => byText(first(x), first(y)) || byText(x.after.join(), y.after.join()));
}

/**
 * One-to-one continuation: the strongest links are taken first, and each component is used once. In a split the part
 * that took the most files continues the original; in a merge the original that gave the most files continues.
 */
function successors(earlier: MatchComponent[], links: ComponentLink[]): Record<string, string | null> {
  const out: Record<string, string | null> = Object.fromEntries(earlier.map(c => [c.id, null]));
  const taken = new Set<string>();
  const ranked = [...links].sort((x, y) =>
    y.shared.length - x.shared.length || (y.forward + y.backward) - (x.forward + x.backward) || byText(x.before, y.before) || byText(x.after, y.after));
  for (const l of ranked) {
    if (out[l.before] !== null || taken.has(l.after)) continue;
    out[l.before] = l.after;
    taken.add(l.after);
  }
  return out;
}

export interface LineageSnapshot { snapshotId: string; components: MatchComponent[] }

export interface Lineage {
  /** `<first snapshot>:<component id there>`. Stable as long as the history before it is unchanged. */
  id: string;
  /** The component in each snapshot, oldest first; a lineage ends when nothing continues it. */
  members: { snapshotId: string; componentId: string; name: string }[];
}

/**
 * Follows components through snapshots given oldest first, matching each consecutive pair. A component continues the
 * lineage of the earlier component it succeeds; any other component starts a new lineage.
 */
export function trackLineages(snapshots: LineageSnapshot[], options: Partial<MatchOptions> = {}): {
  lineages: Lineage[];
  /** snapshotId -> componentId -> lineage id */
  byComponent: Record<string, Record<string, string>>;
  steps: { from: string; to: string; matching: ComponentMatching }[];
} {
  const byComponent: Record<string, Record<string, string>> = {};
  const lineages = new Map<string, Lineage>();
  const steps: { from: string; to: string; matching: ComponentMatching }[] = [];
  const start = (snapshotId: string, c: MatchComponent) => {
    const id = `${snapshotId}:${c.id}`;
    lineages.set(id, { id, members: [{ snapshotId, componentId: c.id, name: c.name }] });
    return id;
  };

  snapshots.forEach((snap, i) => {
    const here: Record<string, string> = {};
    const live = snap.components.filter(c => c.memberIds.length).sort((a, b) => byText(a.id, b.id));
    if (i === 0) {
      for (const c of live) here[c.id] = start(snap.snapshotId, c);
    } else {
      const prev = snapshots[i - 1];
      const matching = matchComponents(prev.components, snap.components, options);
      steps.push({ from: prev.snapshotId, to: snap.snapshotId, matching });
      const continues = new Map<string, string>();
      for (const [a, b] of Object.entries(matching.successor)) if (b) continues.set(b, byComponent[prev.snapshotId][a]);
      for (const c of live) {
        const lineage = continues.get(c.id);
        if (lineage) {
          lineages.get(lineage)!.members.push({ snapshotId: snap.snapshotId, componentId: c.id, name: c.name });
          here[c.id] = lineage;
        } else {
          here[c.id] = start(snap.snapshotId, c);
        }
      }
    }
    byComponent[snap.snapshotId] = here;
  });

  return { lineages: [...lineages.values()], byComponent, steps };
}
