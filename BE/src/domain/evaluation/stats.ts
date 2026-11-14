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
