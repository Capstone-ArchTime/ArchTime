import type { ComponentRole } from '../types.js';
import type { UsageTotals } from './types.js';

// How well a model draws architectures, from signals the server can check itself: no hand-labelled answers are needed.
// The formulas are documented in docs/ai-model-metrics-design.md (section 2); keep the two in step.

// ---------- one run ----------

/**
 * Newman modularity of a partition of the (undirected, unweighted) file graph, in [-0.5, 1].
 * Higher means more dependencies stay inside components than chance would put there.
 */
export function modularity(files: string[], edges: { source: string; target: string }[], groupOf: Map<string, string>): number {
  const set = new Set(files);
  const seen = new Set<string>();
  const degree = new Map<string, number>();
  const inside = new Map<string, number>();
  let m = 0;
  for (const e of edges) {
    if (!set.has(e.source) || !set.has(e.target) || e.source === e.target) continue;
    const key = e.source < e.target ? `${e.source}\u0000${e.target}` : `${e.target}\u0000${e.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    m++;
    const a = groupOf.get(e.source), b = groupOf.get(e.target);
    if (a !== undefined) degree.set(a, (degree.get(a) ?? 0) + 1);
    if (b !== undefined) degree.set(b, (degree.get(b) ?? 0) + 1);
    if (a !== undefined && a === b) inside.set(a, (inside.get(a) ?? 0) + 1);
  }
  if (m === 0) return 0;
  let q = 0;
  for (const [g, d] of degree) q += (inside.get(g) ?? 0) / m - (d / (2 * m)) ** 2;
  return q;
}

export interface RunQualityInput {
  accepted: boolean;
  mode: 'refine' | 'name-only';
  attemptsUsed: number;
  validation: { errors: number; warnings: number };
  /** Modularity of the stored grouping and of the clustering it started from. */
  modularity: number;
  baselineModularity: number;
  roles: ComponentRole[];
  movedRatio?: number;
  maxMoveRatio: number;
  /** Structure of the result (see domain/architecture/quality.ts); each 0..1. Left out when not measured. */
  grounding?: number;
  acyclicity?: number;
  layering?: number;
  balance?: number;
}

export interface RunQuality {
  /** 0..1; 0 when no answer passed verification. */
  score: number;
  pass: 0 | 1;
  /** Formula version: 1 = V,M,R,E,B only; 2 adds G,C,L,Bal. */
  version: 2;
  /** validity, cohesion kept, role coverage, attempt efficiency, boundedness, name grounding, acyclicity, layering, size balance */
  V: number; M: number; R: number; E: number; B: number;
  G?: number; C?: number; L?: number; Bal?: number;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
/** Weights of the quality parts (sum 1). Parts that do not apply to a run are dropped and the rest scaled up. */
export const QUALITY_WEIGHTS = { V: 0.20, M: 0.15, R: 0.10, E: 0.10, B: 0.05, G: 0.20, C: 0.08, L: 0.07, Bal: 0.05 } as const;

export function runQuality(input: RunQualityInput): RunQuality {
  const V = clamp01(1 - 0.25 * input.validation.errors - 0.05 * input.validation.warnings);
  const R = input.roles.length ? 1 - input.roles.filter(r => r === 'other').length / input.roles.length : 0;
  const E = input.attemptsUsed > 0 ? 1 / input.attemptsUsed : 0;
  // A grouping the model only named cannot change the structure, so cohesion and boundedness do not apply to it.
  const refine = input.mode === 'refine';
  const M = !refine ? 1 : input.baselineModularity > 0 ? clamp01(input.modularity / input.baselineModularity) : input.modularity >= 0 ? 1 : 0;
  const half = input.maxMoveRatio / 2;
  const B = !refine || input.movedRatio === undefined || half <= 0 ? 1 : clamp01(1 - Math.max(0, input.movedRatio - half) / half);
  const parts: Partial<Record<keyof typeof QUALITY_WEIGHTS, number>> = { V, R, E };
  if (refine) { parts.M = M; parts.B = B; }
  if (input.grounding !== undefined) parts.G = clamp01(input.grounding);
  if (input.acyclicity !== undefined) parts.C = clamp01(input.acyclicity);
  if (input.layering !== undefined) parts.L = clamp01(input.layering);
  if (input.balance !== undefined) parts.Bal = clamp01(input.balance);
  let weighted = 0, total = 0;
  for (const [k, v] of Object.entries(parts) as [keyof typeof QUALITY_WEIGHTS, number][]) { weighted += QUALITY_WEIGHTS[k] * v; total += QUALITY_WEIGHTS[k]; }
  const pass = input.accepted ? 1 : 0;
  const score = total ? pass * weighted / total : 0;
  const r4 = (x: number | undefined) => (x === undefined ? undefined : round(x, 4));
  return {
    score: round(score, 4), pass, version: 2, V: round(V, 4), M: round(M, 4), R: round(R, 4), E: round(E, 4), B: round(B, 4),
    ...(parts.G !== undefined ? { G: r4(parts.G) } : {}), ...(parts.C !== undefined ? { C: r4(parts.C) } : {}),
    ...(parts.L !== undefined ? { L: r4(parts.L) } : {}), ...(parts.Bal !== undefined ? { Bal: r4(parts.Bal) } : {}),
  };
}

export interface Pricing { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok?: number; currency: string }

/** Cached input is billed at the cache-read price when one is set, otherwise as normal input. */
export function runCost(usage: Pick<UsageTotals, 'inputTokens' | 'outputTokens' | 'cacheReadTokens'>, pricing: Pricing | null | undefined): number {
  if (!pricing) return 0;
  const cached = Math.min(usage.cacheReadTokens ?? 0, usage.inputTokens);
  const cachedPrice = pricing.cacheReadPerMTok ?? pricing.inputPerMTok;
  const amount = ((usage.inputTokens - cached) * pricing.inputPerMTok + cached * cachedPrice + usage.outputTokens * pricing.outputPerMTok) / 1e6;
  return round(Math.max(0, amount), 6);
}

// ---------- a model over many runs ----------

export type RunStatus = 'accepted' | 'fallback' | 'failed' | 'cancelled';

/** The fields of a recorded run that the scores need. */
export interface RunSample {
  status: RunStatus;
  /** Set when the provider (not the answer) failed. */
  errorKind?: string | null;
  attemptsUsed: number;
  filesSent: number;
  quality: number;
  latencyMs: number;
  totalTokens: number;
  cost: number;
  /** Quality v2 parts of the run, when measured (0..1; agreement and stability are ARI, can dip below 0). */
  grounding?: number;
  agreement?: number;
  stability?: number;
}

export interface ModelStats {
  n: number;
  accepted: number;
  successRate: number;
  firstPassRate: number;
  providerErrorRate: number;
  qualityMean: number;
  /** Medians over accepted runs, per 100 files sent so large and small repositories compare. A failure that returns at once is not "fast". */
  latencyPer100: number;
  tokensPer100: number;
  latencyP95Ms: number;
  latencyCV: number;
  /** Total cost divided by accepted runs (what one usable result costs). Infinity when nothing was accepted but money was spent. */
  costPerSuccess: number;
  totalCost: number;
  totalTokens: number;
  /** Means over accepted runs that measured them; null when none did. */
  groundingMean: number | null;
  agreementMean: number | null;
  stabilityMean: number | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOf = <T>(xs: T[], pick: (x: T) => number | undefined) => {
  const vs = xs.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return vs.length ? round(mean(vs), 4) : null;
};

/** Runs the user cancelled say nothing about the model and are left out. Speed and token use are measured on accepted runs only. */
export function modelStats(runs: RunSample[]): ModelStats {
  const rs = runs.filter(r => r.status !== 'cancelled');
  const n = rs.length;
  const accepted = rs.filter(r => r.status === 'accepted');
  const per100 = (x: number, files: number) => (x / Math.max(1, files)) * 100;
  const latencies = accepted.filter(r => r.latencyMs > 0);
  const lat100 = latencies.map(r => per100(r.latencyMs, r.filesSent));
  const latMean = mean(lat100);
  const latSd = Math.sqrt(mean(lat100.map(x => (x - latMean) ** 2)));
  const totalCost = rs.reduce((s, r) => s + r.cost, 0);
  return {
    n,
    accepted: accepted.length,
    successRate: n ? accepted.length / n : 0,
    firstPassRate: n ? accepted.filter(r => r.attemptsUsed === 1).length / n : 0,
    providerErrorRate: n ? rs.filter(r => r.errorKind || r.status === 'failed').length / n : 0,
    qualityMean: mean(rs.map(r => r.quality)),
    latencyPer100: median(lat100),
    tokensPer100: median(accepted.filter(r => r.totalTokens > 0).map(r => per100(r.totalTokens, r.filesSent))),
    latencyP95Ms: percentile(latencies.map(r => r.latencyMs), 95),
    latencyCV: latMean > 0 ? latSd / latMean : 0,
    costPerSuccess: accepted.length ? totalCost / accepted.length : totalCost > 0 ? Infinity : 0,
    totalCost: round(totalCost, 6),
    totalTokens: rs.reduce((s, r) => s + r.totalTokens, 0),
    groundingMean: meanOf(accepted, r => r.grounding),
    agreementMean: meanOf(accepted, r => r.agreement),
    stabilityMean: meanOf(accepted, r => r.stability),
  };
}

export function stability(s: Pick<ModelStats, 'successRate' | 'firstPassRate' | 'providerErrorRate' | 'latencyCV'>): number {
  return clamp01(0.45 * s.successRate + 0.20 * s.firstPassRate + 0.25 * (1 - s.providerErrorRate) + 0.10 * (1 - Math.min(1, s.latencyCV)));
}

// ---------- comparing models ----------

export interface ScoreWeights { quality: number; stability: number; latency: number; cost: number; tokens: number }
export type ScorePreset = 'balanced' | 'quality' | 'budget';
export const SCORE_PRESETS: Record<ScorePreset, ScoreWeights> = {
  balanced: { quality: 0.40, stability: 0.20, latency: 0.15, cost: 0.15, tokens: 0.10 },
  quality: { quality: 0.55, stability: 0.25, latency: 0.10, cost: 0.05, tokens: 0.05 },
  budget: { quality: 0.25, stability: 0.20, latency: 0.10, cost: 0.30, tokens: 0.15 },
};

export function normalizeWeights(w: Partial<ScoreWeights> | undefined, fallback: ScoreWeights = SCORE_PRESETS.balanced): ScoreWeights {
  const keys = ['quality', 'stability', 'latency', 'cost', 'tokens'] as const;
  const raw = keys.map(k => { const v = w?.[k]; return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback[k]; });
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...fallback };
  return Object.fromEntries(keys.map((k, i) => [k, raw[i] / sum])) as unknown as ScoreWeights;
}

/** Runs needed before a model's numbers are shown without the "not enough data" warning, and the prior's weight. */
export const MIN_RUNS_CONFIDENT = 5;
export const MIN_RUNS_ELIGIBLE = 3;
const PRIOR_WEIGHT = 5;

export interface ModelCandidate {
  id: string;
  stats: ModelStats;
  enabled: boolean;
  health?: 'unknown' | 'up' | 'degraded' | 'down';
}

export interface ModelScore {
  id: string;
  /** 0..100 */
  score: number;
  components: { quality: number; stability: number; latency: number; cost: number; tokens: number };
  confident: boolean;
  eligible: boolean;
  /** Why a model is not eligible for recommendation. */
  reasons: string[];
  recommended: boolean;
}

/**
 * Scores models against each other. Quality and stability are absolute; latency, cost and tokens are relative to the best
 * model in the set (1 for the best). Models with few runs are pulled towards the average of all runs (Bayesian shrinkage)
 * so one lucky run cannot top the table.
 */
export function scoreModels(candidates: ModelCandidate[], weights: ScoreWeights = SCORE_PRESETS.balanced, { minRuns = MIN_RUNS_ELIGIBLE } = {}): ModelScore[] {
  const withRuns = candidates.filter(c => c.stats.n > 0);
  const totalRuns = withRuns.reduce((s, c) => s + c.stats.n, 0);
  const prior = {
    quality: totalRuns ? withRuns.reduce((s, c) => s + c.stats.qualityMean * c.stats.n, 0) / totalRuns : 0,
    success: totalRuns ? withRuns.reduce((s, c) => s + c.stats.successRate * c.stats.n, 0) / totalRuns : 0,
  };
  const shrink = (value: number, n: number, p: number) => (n * value + PRIOR_WEIGHT * p) / (n + PRIOR_WEIGHT);
  // Only models that produced something set the bar for speed, cost and tokens.
  const best = (pick: (s: ModelStats) => number) => {
    const xs = withRuns.filter(c => c.stats.accepted > 0).map(c => pick(c.stats)).filter(x => Number.isFinite(x) && x > 0);
    return xs.length ? Math.min(...xs) : 0;
  };
  const bestLatency = best(s => s.latencyPer100), bestTokens = best(s => s.tokensPer100), bestCost = best(s => s.costPerSuccess);
  const relative = (value: number, top: number) => (!Number.isFinite(value) ? 0 : value <= 0 ? 1 : top > 0 ? clamp01(top / value) : 1);

  const scored = candidates.map((c): ModelScore => {
    const s = c.stats;
    const reasons: string[] = [];
    if (!c.enabled) reasons.push('disabled');
    if (c.health === 'down') reasons.push('health check failing');
    if (s.n < minRuns) reasons.push(`only ${s.n} run${s.n === 1 ? '' : 's'} (needs ${minRuns})`);
    const success = shrink(s.successRate, s.n, prior.success);
    if (s.n >= minRuns && success < 0.5) reasons.push(`success rate ${Math.round(s.successRate * 100)}%`);
    if (s.n === 0) {
      return { id: c.id, score: 0, components: { quality: 0, stability: 0, latency: 0, cost: 0, tokens: 0 }, confident: false, eligible: false, reasons, recommended: false };
    }
    const produced = s.accepted > 0;
    const components = {
      quality: clamp01(shrink(s.qualityMean, s.n, prior.quality)),
      stability: stability({ ...s, successRate: success }),
      latency: produced ? relative(s.latencyPer100, bestLatency) : 0,
      cost: produced ? relative(s.costPerSuccess, bestCost) : 0,
      tokens: produced ? relative(s.tokensPer100, bestTokens) : 0,
    };
    const score = 100 * (weights.quality * components.quality + weights.stability * components.stability + weights.latency * components.latency
      + weights.cost * components.cost + weights.tokens * components.tokens);
    return {
      id: c.id, score: round(score, 1), components: mapValues(components, v => round(v, 3)),
      confident: s.n >= MIN_RUNS_CONFIDENT, eligible: reasons.length === 0, reasons, recommended: false,
    };
  });
  const top = scored.filter(s => s.eligible).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
  if (top) top.recommended = true;
  return scored;
}

/** The mode a snapshot of this size is refined in (see refineMapping). */
export const modeFor = (files: number, maxRefineFiles: number): 'refine' | 'name-only' => (files <= maxRefineFiles ? 'refine' : 'name-only');

function round(x: number, digits: number) { const f = 10 ** digits; return Math.round(x * f) / f; }
function mapValues<T extends Record<string, number>>(o: T, f: (v: number) => number): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)])) as T;
}
