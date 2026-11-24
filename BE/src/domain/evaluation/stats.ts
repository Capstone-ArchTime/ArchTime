// Statistics for the RQ1 report: the Wilcoxon signed-rank test for paired scores (two groupings of the same snapshots)
// and Cohen's kappa for the agreement of two annotators. Pure functions, no dependency.

export interface WilcoxonResult {
  /** Pairs with a non-zero difference (zero differences are dropped, Wilcoxon's method). */
  n: number;
  /** Rank sums of the positive (x > y) and negative differences. */
  wPlus: number;
  wMinus: number;
  /** Two-sided p-value; exact when n <= 25 and no absolute differences are tied, else the normal approximation. */
  p: number;
  exact: boolean;
  /** Matched-pairs rank-biserial correlation, -1..1: positive when x tends to be higher. */
  effect: number;
}

const round = (x: number, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits;

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Ranks of the values, 1-based, ties sharing the mean of their ranks. */
function ranks(values: number[]): { ranks: number[]; tieGroups: number[] } {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  const tieGroups: number[] = [];
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) out[order[k][1]] = r;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }
  return { ranks: out, tieGroups };
}

/** Number of subsets of {1..n} for each rank sum 0..n(n+1)/2. */
function signedRankCounts(n: number): number[] {
  const max = (n * (n + 1)) / 2;
  let counts = new Array<number>(max + 1).fill(0);
  counts[0] = 1;
  for (let k = 1; k <= n; k++) {
    const next = [...counts];
    for (let s = k; s <= max; s++) next[s] += counts[s - k];
    counts = next;
  }
  return counts;
}

/** Wilcoxon signed-rank test of paired samples x and y (same length; pairs with a missing value are skipped). */
export function wilcoxonSignedRank(x: (number | null)[], y: (number | null)[]): WilcoxonResult | null {
  const diffs: number[] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const a = x[i], b = y[i];
    if (a === null || b === null || a === undefined || b === undefined) continue;
    const d = a - b;
    if (Math.abs(d) > 1e-9) diffs.push(d);
  }
  const n = diffs.length;
  if (n === 0) return null;
  const { ranks: r, tieGroups } = ranks(diffs.map(Math.abs));
  let wPlus = 0, wMinus = 0;
  diffs.forEach((d, i) => { if (d > 0) wPlus += r[i]; else wMinus += r[i]; });
  const effect = round((wPlus - wMinus) / (wPlus + wMinus));
  const w = Math.min(wPlus, wMinus);
  if (n <= 25 && tieGroups.length === 0) {
    const counts = signedRankCounts(n);
    const total = 2 ** n;
    let below = 0;
    for (let s = 0; s <= Math.floor(w); s++) below += counts[s];
    return { n, wPlus, wMinus, p: round(Math.min(1, (2 * below) / total)), exact: true, effect };
  }
  const mean = (n * (n + 1)) / 4;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieGroups.reduce((s, t) => s + (t ** 3 - t), 0) / 48;
  const z = variance > 0 ? (Math.abs(wPlus - mean) - 0.5) / Math.sqrt(variance) : 0;
  return { n, wPlus, wMinus, p: round(Math.min(1, 2 * (1 - normalCdf(Math.max(0, z))))), exact: false, effect };
}

// ── Cluster bootstrap (RQ2) ─────────────────────────────────────────────────────────────────────────────────────────
// Claims and runs of one question are not independent, so intervals resample whole questions (clusters) with
// replacement and recompute the pooled rate sum(num) / sum(den) each time; percentile intervals.

/** mulberry32: a small seeded generator, so a report is the same every time it is computed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RatioCluster { num: number; den: number }
export interface Interval { estimate: number | null; low: number | null; high: number | null }
export interface BootstrapOptions { resamples?: number; seed?: number; level?: number }

const DEFAULTS = { resamples: 10_000, seed: 20261119, level: 0.95 };
const pooled = (xs: RatioCluster[]) => { const den = xs.reduce((s, x) => s + x.den, 0); return den ? xs.reduce((s, x) => s + x.num, 0) / den : null; };

function percentiles(values: number[], level: number): [number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
  return [at((1 - level) / 2), at(1 - (1 - level) / 2)];
}

/** The pooled rate of the clusters with a percentile interval from resampling clusters; null without data. */
export function bootstrapRatio(clusters: RatioCluster[], options: BootstrapOptions = {}): Interval {
  const { resamples, seed, level } = { ...DEFAULTS, ...options };
  const estimate = pooled(clusters);
  if (estimate === null) return { estimate: null, low: null, high: null };
  const random = seededRandom(seed);
  const draws: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let num = 0, den = 0;
    for (let i = 0; i < clusters.length; i++) { const c = clusters[Math.floor(random() * clusters.length)]; num += c.num; den += c.den; }
    if (den) draws.push(num / den);
  }
  const [low, high] = percentiles(draws, level);
  return { estimate: round(estimate), low: round(low), high: round(high) };
}

/**
 * The difference of two pooled rates (a - b) when both are measured on the same clusters (the same questions under two
 * conditions): each resample draws clusters once and uses them for both, so the pairing is kept. `p` is two-sided:
 * twice the smaller share of resampled differences on either side of zero, with the usual +1 correction.
 */
export function bootstrapRatioDifference(pairs: { a: RatioCluster; b: RatioCluster }[], options: BootstrapOptions = {}): Interval & { p: number | null } {
  const { resamples, seed, level } = { ...DEFAULTS, ...options };
  const pa = pooled(pairs.map(x => x.a)), pb = pooled(pairs.map(x => x.b));
  if (pa === null || pb === null) return { estimate: null, low: null, high: null, p: null };
  const random = seededRandom(seed);
  const draws: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let na = 0, da = 0, nb = 0, db = 0;
    for (let i = 0; i < pairs.length; i++) { const c = pairs[Math.floor(random() * pairs.length)]; na += c.a.num; da += c.a.den; nb += c.b.num; db += c.b.den; }
    if (da && db) draws.push(na / da - nb / db);
  }
  const [low, high] = percentiles(draws, level);
  const below = draws.filter(d => d <= 0).length, above = draws.filter(d => d >= 0).length;
  const p = Math.min(1, (2 * (Math.min(below, above) + 1)) / (draws.length + 1));
  return { estimate: round(pa - pb), low: round(low), high: round(high), p: round(p) };
}

/** Holm's step-down adjustment of a family of p-values (null entries are skipped and stay null). */
export function holm(ps: (number | null)[]): (number | null)[] {
  const present = ps.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p !== null).sort((a, b) => a.p - b.p);
  const out: (number | null)[] = ps.map(() => null);
  let running = 0;
  present.forEach(({ p, i }, k) => { running = Math.max(running, Math.min(1, p * (present.length - k))); out[i] = round(running); });
  return out;
}

export interface Ac1Result { n: number; agreement: number; ac1: number | null; categories: number }

/**
 * Gwet's AC1 for two raters over the same items (Gwet 2008). Chance agreement is
 * pe = 1/(q-1) · Σ_k π_k (1 − π_k), with π_k the mean of the two raters' shares of category k and q the number of
 * categories the scale has. Pass `categories` (e.g. ['correct', 'wrong']): q must be the size of the scale, not the
 * number of values that happened to be used, otherwise AC1 is undefined whenever both raters used a single value.
 * Unlike Cohen's kappa it stays interpretable when almost every item gets the same value (the kappa paradox the RQ1
 * development set ran into: 14/16 verdicts agreed, kappa −0.07, AC1 0.86). Null without items or with q < 2.
 */
export function gwetAC1<T>(pairs: [T, T][], categories: readonly T[]): Ac1Result | null {
  const n = pairs.length;
  const scale = [...new Set([...categories, ...pairs.flat()])];
  const q = scale.length;
  if (n === 0 || q < 2) return null;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  let pe = 0;
  for (const k of scale) {
    const pi = (pairs.filter(([a]) => a === k).length + pairs.filter(([, b]) => b === k).length) / (2 * n);
    pe += pi * (1 - pi);
  }
  pe /= q - 1;
  return { n, agreement: round(agree), ac1: pe >= 1 ? null : round((agree - pe) / (1 - pe)), categories: q };
}

export interface KappaResult { n: number; agreement: number; kappa: number | null }

/** Cohen's kappa of two annotators over the same items; null when chance agreement is already total. */
export function cohenKappa<T>(pairs: [T, T][]): KappaResult | null {
  const n = pairs.length;
  if (n === 0) return null;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const left = new Map<T, number>(), right = new Map<T, number>();
  for (const [a, b] of pairs) { left.set(a, (left.get(a) ?? 0) + 1); right.set(b, (right.get(b) ?? 0) + 1); }
  let chance = 0;
  for (const [k, v] of left) chance += (v / n) * ((right.get(k) ?? 0) / n);
  return { n, agreement: round(agree), kappa: chance >= 1 ? null : round((agree - chance) / (1 - chance)) };
}
