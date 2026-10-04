// Deterministic grouping of source files into components.
// Louvain modularity optimisation on the dependency graph (plus a light pull towards files that share a folder),
// followed by rules that keep the component count inside a target range. No randomness: the same graph always
// produces the same groups, whatever order the input arrives in.

export interface ClusterGraph {
  files: string[];
  /** Directed dependencies; direction is ignored for grouping. */
  edges: { source: string; target: string; weight?: number }[];
}
export interface ClusterOptions {
  minComponents: number;
  maxComponents: number;
  /** Groups with fewer files than this are folded into a neighbour. */
  minSize: number;
  /** Strength of the pull between files in the same folder (a dependency counts as 1). */
  folderAffinity: number;
}
export interface ClusterResult {
  groups: string[][];
  /** Files that connect to nothing else and could not be placed with confidence. */
  leftovers: string[];
  resolution: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = { minComponents: 8, maxComponents: 15, minSize: 2, folderAffinity: 0.5 };

type Adj = Map<number, number>[];

function louvain(n: number, links: Adj, gamma: number): number[] {
  let adj: Adj = links.map(m => new Map(m));
  let self: number[] = new Array(n).fill(0);
  let size = n;
  let membership = Array.from({ length: n }, (_, i) => i);

  for (let level = 0; level < 20; level++) {
    const degree = adj.map((m, i) => [...m.values()].reduce((s, w) => s + w, 0) + 2 * self[i]);
    const m2 = degree.reduce((s, d) => s + d, 0);
    if (m2 === 0) break;
    const comm = Array.from({ length: size }, (_, i) => i);
    const total = [...degree];
    let moved = false;
    for (let pass = 0; pass < 100; pass++) {
      let changed = false;
      for (let i = 0; i < size; i++) {
        const ci = comm[i];
        total[ci] -= degree[i];
        const to = new Map<number, number>();
        for (const [j, w] of adj[i]) { if (j !== i) to.set(comm[j], (to.get(comm[j]) ?? 0) + w); }
        let best = ci;
        let bestGain = (to.get(ci) ?? 0) - (gamma * total[ci] * degree[i]) / m2;
        for (const c of [...to.keys()].sort((a, b) => a - b)) {
          const gain = to.get(c)! - (gamma * total[c] * degree[i]) / m2;
          if (gain > bestGain + 1e-12) { best = c; bestGain = gain; }
        }
        total[best] += degree[i];
        comm[i] = best;
        if (best !== ci) { changed = true; moved = true; }
      }
      if (!changed) break;
    }
    if (!moved) break;

    const renumber = new Map<number, number>();
    for (const c of comm) if (!renumber.has(c)) renumber.set(c, renumber.size);
    membership = membership.map(m => renumber.get(comm[m])!);
    const next: Adj = Array.from({ length: renumber.size }, () => new Map());
    const nextSelf: number[] = new Array(renumber.size).fill(0);
    for (let i = 0; i < size; i++) {
      const ci = renumber.get(comm[i])!;
      nextSelf[ci] += self[i];
      for (const [j, w] of adj[i]) {
        const cj = renumber.get(comm[j])!;
        if (ci === cj) { if (j > i) nextSelf[ci] += w; }
        else next[ci].set(cj, (next[ci].get(cj) ?? 0) + w);
      }
    }
    adj = next; self = nextSelf; size = renumber.size;
    if (size === 1) break;
  }
  const renumber = new Map<number, number>();
  return membership.map(c => { if (!renumber.has(c)) renumber.set(c, renumber.size); return renumber.get(c)!; });
}

interface Model {
  /** Node ids: real files first, then virtual folder hubs. */
  ids: string[];
  realCount: number;
  adj: Adj;
}

function buildModel(graph: ClusterGraph, folderAffinity: number): Model {
  const files = [...new Set(graph.files)].sort();
  const index = new Map(files.map((f, i) => [f, i]));
  const folders = [...new Set(files.map(f => f.slice(0, Math.max(0, f.lastIndexOf('/')))))].sort();
  const ids = [...files, ...folders.map(d => `folder:${d}`)];
  const adj: Adj = ids.map(() => new Map());
  const link = (a: number, b: number, w: number) => {
    if (a === b || w <= 0) return;
    adj[a].set(b, (adj[a].get(b) ?? 0) + w);
    adj[b].set(a, (adj[b].get(a) ?? 0) + w);
  };
  // A file that depends on, or is used by, everything (a composition root, a barrel) says little about which
  // files belong together, so each dependency is scaled down by how connected its two ends are.
  const degree = new Map<string, number>();
  for (const e of graph.edges) for (const f of [e.source, e.target]) degree.set(f, (degree.get(f) ?? 0) + 1);
  for (const e of graph.edges) {
    const a = index.get(e.source), b = index.get(e.target);
    if (a !== undefined && b !== undefined) link(a, b, (e.weight ?? 1) / Math.sqrt((degree.get(e.source) ?? 1) * (degree.get(e.target) ?? 1)));
  }
  const folderIndex = new Map(folders.map((d, i) => [d, files.length + i]));
  files.forEach((f, i) => link(i, folderIndex.get(f.slice(0, Math.max(0, f.lastIndexOf('/'))))!, folderAffinity));
  return { ids, realCount: files.length, adj };
}

/** Sizes count real files only. */
function groupsOf(model: Model, comm: number[]): number[][] {
  const map = new Map<number, number[]>();
  comm.forEach((c, i) => map.set(c, [...(map.get(c) ?? []), i]));
  return [...map.values()].sort((a, b) => a[0] - b[0]);
}
const realSize = (model: Model, g: number[]) => g.filter(i => i < model.realCount).length;

function connection(model: Model, a: number[], b: number[]): number {
  const inB = new Set(b);
  let sum = 0;
  for (const i of a) for (const [j, w] of model.adj[i]) if (inB.has(j)) sum += w;
  return sum;
}

function mergeInto(groups: number[][], from: number, to: number) {
  groups[to] = [...groups[to], ...groups[from]].sort((x, y) => x - y);
  groups.splice(from, 1);
  groups.sort((a, b) => a[0] - b[0]);
}

/** Folds groups that are too small into the neighbour they are most connected to. */
function foldSmall(model: Model, groups: number[][], minSize: number) {
  for (;;) {
    const order = groups.map((g, k) => ({ k, size: realSize(model, g), first: g[0] })).filter(x => x.size < minSize).sort((a, b) => a.size - b.size || a.first - b.first);
    let merged = false;
    for (const { k } of order) {
      let best = -1, bestW = 0;
      groups.forEach((other, o) => {
        if (o === k) return;
        const w = connection(model, groups[k], other);
        if (w > bestW + 1e-12) { best = o; bestW = w; }
      });
      if (best >= 0) { mergeInto(groups, k, best); merged = true; break; }
    }
    if (!merged) return;
  }
}

function partition(model: Model, gamma: number, minSize: number): number[][] {
  const groups = groupsOf(model, louvain(model.ids.length, model.adj, gamma));
  foldSmall(model, groups, minSize);
  return groups;
}

const LADDER_UP = [1.4, 2, 3, 5, 8];

export function clusterFiles(graph: ClusterGraph, options: Partial<ClusterOptions> = {}): ClusterResult {
  const o = { ...DEFAULT_CLUSTER_OPTIONS, ...options };
  const model = buildModel(graph, o.folderAffinity);
  if (model.realCount === 0) return { groups: [], leftovers: [], resolution: 1 };

  // Start at the standard resolution. Lowering it would glue whole subsystems together, so too many groups are
  // folded together afterwards instead; too few are first retried at a finer resolution.
  const effective = (gs: number[][]) => gs.filter(g => realSize(model, g) >= o.minSize).length;
  let gamma = 1;
  let groups = partition(model, gamma, o.minSize);
  if (effective(groups) < o.minComponents) {
    let best = { gamma, groups, distance: distance(effective(groups), o) };
    for (const g of LADDER_UP) {
      const trial = partition(model, g, o.minSize);
      const d = distance(effective(trial), o);
      if (d < best.distance) best = { gamma: g, groups: trial, distance: d };
      if (d === 0) break;
    }
    gamma = best.gamma; groups = best.groups;
  }

  // Too many: fold the smallest group into its closest neighbour.
  while (effective(groups) > o.maxComponents) {
    const order = groups.map((g, k) => ({ k, size: realSize(model, g), first: g[0] })).sort((a, b) => a.size - b.size || a.first - b.first);
    let done = false;
    for (const { k } of order) {
      let best = -1, bestW = 0;
      groups.forEach((other, i) => { if (i !== k) { const w = connection(model, groups[k], other); if (w > bestW + 1e-12) { best = i; bestW = w; } } });
      if (best >= 0) { mergeInto(groups, k, best); done = true; break; }
    }
    if (!done) break;
  }

  // Too few, or one group holds a quarter of all files: split the largest group that can be split into useful parts.
  const total = model.realCount;
  const giant = Math.max(o.minSize * 2, Math.ceil(total * 0.25));
  const unsplittable = new Set<number>();
  for (;;) {
    const count = effective(groups);
    const candidates = groups.map((g, k) => ({ k, size: realSize(model, g), first: g[0] })).filter(x => x.size >= o.minSize * 2 && !unsplittable.has(x.first)).sort((a, b) => b.size - a.size || a.first - b.first);
    const top = candidates[0];
    if (!top || count >= o.maxComponents || (count >= o.minComponents && top.size <= giant)) break;
    const parts = split(model, groups[top.k], o);
    if (parts.length < 2 || effective(groups) - 1 + parts.length > o.maxComponents) { unsplittable.add(top.first); continue; }
    groups.splice(top.k, 1, ...parts);
    groups.sort((a, b) => a[0] - b[0]);
  }

  const kept: string[][] = [];
  const leftovers: string[] = [];
  for (const g of groups) {
    const files = g.filter(i => i < model.realCount).map(i => model.ids[i]).sort();
    if (!files.length) continue;
    if (files.length < o.minSize) leftovers.push(...files); else kept.push(files);
  }
  kept.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
  return { groups: kept, leftovers: leftovers.sort(), resolution: gamma };
}

const distance = (count: number, o: ClusterOptions) => (count < o.minComponents ? o.minComponents - count : count > o.maxComponents ? count - o.maxComponents : 0);

function split(model: Model, group: number[], o: ClusterOptions): number[][] {
  const local = new Map(group.map((id, i) => [id, i]));
  const adj: Adj = group.map(() => new Map());
  for (const id of group) for (const [j, w] of model.adj[id]) { const lj = local.get(j); if (lj !== undefined) adj[local.get(id)!].set(lj, w); }
  const sub: Model = { ids: group.map(id => model.ids[id]), realCount: 0, adj };
  // Real files are not contiguous here, so size is checked against the original model.
  for (const gamma of [1.5, 2, 3, 5, 8]) {
    const comm = louvain(group.length, adj, gamma);
    const parts = groupsOf(sub, comm).map(p => p.map(i => group[i]));
    const sized = parts.filter(p => realSize(model, p) >= o.minSize);
    if (sized.length >= 2 && sized.length === parts.length) return parts;
    if (sized.length >= 2) { // fold the stragglers into the closest part
      const small = parts.filter(p => realSize(model, p) < o.minSize);
      for (const s of small) {
        let best = sized[0], bestW = -1;
        for (const p of sized) { const w = connection(model, s, p); if (w > bestW) { best = p; bestW = w; } }
        best.push(...s);
      }
      return sized.map(p => [...p].sort((a, b) => a - b));
    }
  }
  return [];
}
