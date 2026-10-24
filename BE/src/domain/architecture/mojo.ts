// MoJo distance and MoJoFM (Wen & Tzerpos): how many Move and Join operations turn one grouping of files into another.
// MoJoFM rescales that to [0, 100]: 100 when the two groupings are the same, 0 when A is as far from B as any grouping
// can be. Both groupings are compared over the files they have in common.
//
// mno(A, B), the fewest moves and joins turning A into B, is computed exactly (Wen & Tzerpos, 2003):
//   tag every file of A with its group in B; let M_i be the largest tag count inside cluster A_i, and let μ be the size
//   of a maximum matching between clusters of A and groups of B, using only the edges where a tag count equals M_i.
//   Then mno(A, B) = (n − Σ M_i) + (l − μ): files outside their cluster's chosen group are moved, and clusters sharing a
//   group are joined.

export type Grouping = ReadonlyMap<string, string>;

/** Restricts both groupings to the files they share. */
function common(a: Grouping, b: Grouping): { files: string[]; a: Map<string, string>; b: Map<string, string> } {
  const files = [...a.keys()].filter(f => b.has(f)).sort();
  return { files, a: new Map(files.map(f => [f, a.get(f)!])), b: new Map(files.map(f => [f, b.get(f)!])) };
}

/** Maximum bipartite matching (augmenting paths); left and right are indices into `edges`. */
function maxMatching(left: number, edges: number[][]): number {
  const matchRight = new Map<number, number>();
  const tryAugment = (u: number, seen: Set<number>): boolean => {
    for (const v of edges[u]) {
      if (seen.has(v)) continue;
      seen.add(v);
      const owner = matchRight.get(v);
      if (owner === undefined || tryAugment(owner, seen)) { matchRight.set(v, u); return true; }
    }
    return false;
  };
  let size = 0;
  for (let u = 0; u < left; u++) if (tryAugment(u, new Set())) size++;
  return size;
}

/** Fewest Move and Join operations that turn grouping A into grouping B (not symmetric). */
export function mno(a: Grouping, b: Grouping): number {
  const { files, a: ga, b: gb } = common(a, b);
  if (!files.length) return 0;
  const clusters = [...new Set(ga.values())].sort();
  const groups = [...new Set(gb.values())].sort();
  const ci = new Map(clusters.map((c, i) => [c, i])), gi = new Map(groups.map((g, i) => [g, i]));
  const counts = clusters.map(() => new Map<number, number>());
  for (const f of files) {
    const row = counts[ci.get(ga.get(f)!)!];
    const k = gi.get(gb.get(f)!)!;
    row.set(k, (row.get(k) ?? 0) + 1);
  }
  let kept = 0;
  const edges = counts.map(row => {
    const best = Math.max(...row.values());
    kept += best;
    return [...row].filter(([, n]) => n === best).map(([k]) => k);
  });
  return files.length - kept + clusters.length - maxMatching(clusters.length, edges);
}

/** MoJo distance: the smaller of the two directions. */
export const mojoDistance = (a: Grouping, b: Grouping) => Math.min(mno(a, b), mno(b, a));

/**
 * The largest mno(X, B) over every grouping X of B's files: n − g, where g counts the groups of B taken smallest first
 * while each is larger than the number counted so far (Wen & Tzerpos, 2004).
 */
export function maxMno(b: Grouping): number {
  const sizes = new Map<string, number>();
  for (const g of b.values()) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  let g = 0;
  for (const size of [...sizes.values()].sort((x, y) => x - y)) if (size > g) g++;
  return b.size - g;
}

export interface MojoFmResult {
  /** 0 to 100; 100 = A is B. */
  score: number;
  /** Moves and joins needed to turn A into B. */
  distance: number;
  /** Files both groupings contain. */
  common: number;
}

/**
 * MoJoFM of A against B, B being the grouping taken as right (a reference, or the later snapshot). Null when fewer than
 * two files are shared: nothing meaningful can be said.
 */
export function mojoFM(a: Grouping, b: Grouping): MojoFmResult | null {
  const { files, a: ga, b: gb } = common(a, b);
  if (files.length < 2) return null;
  const distance = mno(ga, gb);
  const max = maxMno(gb);
  return { score: max === 0 ? 100 : Math.round((1 - distance / max) * 10_000) / 100, distance, common: files.length };
}
