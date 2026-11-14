// Temporal anchoring, an RQ1 variant of the recovered architecture.
// Clustering every snapshot from scratch can regroup files that did not change, so the evolution shows changes that
// are only noise. Here each snapshot starts from the grouping of the previous one: files that already existed keep
// their component, new files join the component most of their dependencies are in. The fresh grouping of the snapshot
// replaces the anchored one only when it is clearly better, that is, when its modularity is higher by more than a
// tolerance; then the architecture is taken to have really changed. Pure and deterministic, like the clustering.

import type { MatchComponent } from './matching.js';

export interface AnchorOptions {
  /** How much higher the modularity of the fresh grouping must be before it replaces the anchored one. */
  tolerance: number;
}
export const DEFAULT_ANCHOR_OPTIONS: AnchorOptions = { tolerance: 0.02 };

export interface Edge { source: string; target: string }

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Newman modularity of a grouping over the undirected, unweighted dependency graph: the share of edges inside
 * components minus what a random graph with the same degrees would put there. Edges with an end outside the grouping
 * and self-loops are ignored. 0 for a graph without edges.
 */
export function modularity(edges: Edge[], grouping: ReadonlyMap<string, string>): number {
  const seen = new Set<string>();
  const degree = new Map<string, number>();
  let m = 0, inside = 0;
  for (const e of edges) {
    if (e.source === e.target) continue;
    const a = grouping.get(e.source), b = grouping.get(e.target);
    if (a === undefined || b === undefined) continue;
    const key = e.source < e.target ? `${e.source}\u0000${e.target}` : `${e.target}\u0000${e.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    m++;
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
    if (a === b) inside++;
  }
  if (m === 0) return 0;
  let expected = 0;
  for (const d of degree.values()) expected += (d / (2 * m)) ** 2;
  return Math.round((inside / m - expected) * 10_000) / 10_000;
}

const groupingOf = (components: MatchComponent[]) => {
  const out = new Map<string, string>();
  for (const c of components) for (const f of c.memberIds) if (!out.has(f)) out.set(f, c.id);
  return out;
};

export interface AnchorResult {
  components: MatchComponent[];
  /** "anchored" when the previous grouping was carried over, "fresh" when the new clustering won. */
  chosen: 'anchored' | 'fresh';
  modularity: { anchored: number; fresh: number };
}

/**
 * Carries `previous` over to the files of `fresh` (the snapshot grouped on its own). Components of `previous` that keep
 * no file disappear; new files with no placed neighbour keep their fresh component, as a new component.
 */
export function anchorOn(previous: MatchComponent[], fresh: MatchComponent[], edges: Edge[], options: Partial<AnchorOptions> = {}): AnchorResult {
  const { tolerance } = { ...DEFAULT_ANCHOR_OPTIONS, ...options };
  const freshOwner = groupingOf(fresh);
  const files = [...freshOwner.keys()].sort(byText);
  const prevOwner = groupingOf(previous);
  const owner = new Map<string, string>();
  for (const f of files) { const c = prevOwner.get(f); if (c !== undefined) owner.set(f, c); }

  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    if (e.source === e.target || !freshOwner.has(e.source) || !freshOwner.has(e.target)) continue;
    neighbours.set(e.source, [...(neighbours.get(e.source) ?? []), e.target]);
    neighbours.set(e.target, [...(neighbours.get(e.target) ?? []), e.source]);
  }
  // New files join the component most of their placed neighbours are in; repeated so that chains of new files follow
  // each other. Ties go to the first component id.
  let pending = files.filter(f => !owner.has(f));
  for (let round = 0; round < 10 && pending.length; round++) {
    const placed: [string, string][] = [];
    for (const f of pending) {
      const votes = new Map<string, number>();
      for (const n of neighbours.get(f) ?? []) { const c = owner.get(n); if (c !== undefined) votes.set(c, (votes.get(c) ?? 0) + 1); }
      const best = [...votes.entries()].sort((x, y) => y[1] - x[1] || byText(x[0], y[0]))[0];
      if (best) placed.push([f, best[0]]);
    }
    if (!placed.length) break;
    for (const [f, c] of placed) owner.set(f, c);
    pending = pending.filter(f => !owner.has(f));
  }
  for (const f of pending) owner.set(f, `new:${freshOwner.get(f)!}`);

  const names = new Map<string, string>(previous.map(c => [c.id, c.name]));
  for (const c of fresh) names.set(`new:${c.id}`, c.name);
  const members = new Map<string, string[]>();
  for (const f of files) { const c = owner.get(f)!; members.set(c, [...(members.get(c) ?? []), f]); }
  const anchored = [...members.entries()].sort((x, y) => byText(x[0], y[0])).map(([id, memberIds]) => ({ id, name: names.get(id) ?? id, memberIds }));

  const q = { anchored: modularity(edges, groupingOf(anchored)), fresh: modularity(edges, freshOwner) };
  return q.fresh > q.anchored + tolerance
    ? { components: fresh, chosen: 'fresh', modularity: q }
    : { components: anchored, chosen: 'anchored', modularity: q };
}

/** Anchors a whole history, oldest first: the first snapshot keeps its own grouping. */
export function anchorSequence(snapshots: { components: MatchComponent[]; edges: Edge[] }[], options: Partial<AnchorOptions> = {}): AnchorResult[] {
  const out: AnchorResult[] = [];
  snapshots.forEach((s, i) => {
    if (i === 0) {
      const q = modularity(s.edges, groupingOf(s.components));
      out.push({ components: s.components, chosen: 'fresh', modularity: { anchored: q, fresh: q } });
    } else {
      out.push(anchorOn(out[i - 1].components, s.components, s.edges, options));
    }
  });
  return out;
}
