// How the recovered architecture compares with the directory baseline, snapshot by snapshot and step by step.
// For each snapshot: agreement with the project's reference architecture (when one is set) and with the baseline.
// For each step between consecutive snapshots: how stable each grouping stays (MoJoFM over the files both snapshots
// have) and which structural changes each one shows (component matching). See mojo.ts, baseline.ts and matching.ts.

import { directoryBaseline } from './baseline.js';
import type { BaselineOptions } from './baseline.js';
import { EVIDENCE_RULE, matchComponents } from './matching.js';
import type { MatchOptions } from './matching.js';
import type { ChangeKind, MatchComponent } from './matching.js';
import { mojoFM } from './mojo.js';
import type { MojoFmResult } from './mojo.js';
import { groupingOf, referenceGrouping } from './quality.js';
import type { ReferenceComponent } from './quality.js';

/** The bucket clustering puts files it could not place in. It is part of the grouping, but not a component to follow. */
export const UNASSIGNED_COMPONENT = 'Unassigned Files';

export interface EvaluatedSnapshotInput {
  snapshotId: string;
  /** The recovered components, the unassigned bucket included. */
  components: MatchComponent[];
  /**
   * Other groupings of the same snapshot, keyed by method (for RQ1: "clustering" for the clustering-only grouping,
   * "anchored" for the grouping anchored on the previous snapshot). Each is measured like the recovered one.
   */
  variants?: Record<string, MatchComponent[]>;
}

export interface SnapshotEvaluation {
  snapshotId: string;
  files: number;
  components: { recovered: number; baseline: number };
  /** Recovered grouping measured against the baseline: 100 = the recovery only repeats the folders. */
  recoveredVsBaseline: MojoFmResult | null;
  /** Each grouping measured against the reference architecture, over the files the reference covers. */
  reference?: { recovered: MojoFmResult | null; baseline: MojoFmResult | null };
  /** The same measures for each variant grouping the snapshot has. */
  variants?: Record<string, { components: number; reference: MojoFmResult | null }>;
}

export interface StepSide {
  /** Later snapshot taken as right: 100 = nothing moved between components. */
  stability: MojoFmResult | null;
  summary: Record<ChangeKind, number>;
  /** Changes other than kept and renamed: splits, merges, restructurings, removals and additions. */
  structural: number;
  /** Every change, with component names, for a person to judge (RQ1 change detection). */
  changes: NamedChange[];
}

export interface NamedChange {
  kind: ChangeKind; before: string[]; after: string[]; reason?: string;
  /** Member files of each component before and after, in the order of the names (only with the withFiles option). */
  files?: { before: string[][]; after: string[][] };
}

export interface StepEvaluation {
  from: string; to: string; recovered: StepSide; baseline: StepSide;
  /** Variant groupings present in both snapshots of the step. */
  variants?: Record<string, StepSide>;
}

export interface EvolutionEvaluation {
  baselineDepth: number;
  snapshots: SnapshotEvaluation[];
  steps: StepEvaluation[];
  /** Means over the snapshots and steps that have a value. */
  overall: {
    stability: { recovered: number | null; baseline: number | null };
    reference: { recovered: number | null; baseline: number | null };
    structuralChanges: { recovered: number; baseline: number };
  };
}

const mean = (xs: (number | null | undefined)[]) => {
  const ys = xs.filter((x): x is number => typeof x === 'number');
  return ys.length ? Math.round((ys.reduce((a, b) => a + b, 0) / ys.length) * 100) / 100 : null;
};
const STRUCTURAL: ChangeKind[] = ['split', 'merged', 'restructured', 'removed', 'added'];
const followable = (components: MatchComponent[]) => components.filter(c => c.name !== UNASSIGNED_COMPONENT);

function side(before: MatchComponent[], after: MatchComponent[], followBefore: MatchComponent[], followAfter: MatchComponent[], withFiles = false,
  evidence: MatchOptions['evidence'] = EVIDENCE_RULE): StepSide {
  const matching = matchComponents(followBefore, followAfter, { evidence });
  const nameBefore = new Map(followBefore.map(c => [c.id, c.name]));
  const nameAfter = new Map(followAfter.map(c => [c.id, c.name]));
  const membersBefore = new Map(followBefore.map(c => [c.id, [...c.memberIds].sort()]));
  const membersAfter = new Map(followAfter.map(c => [c.id, [...c.memberIds].sort()]));
  return {
    stability: mojoFM(groupingOf(before), groupingOf(after)),
    summary: matching.summary,
    structural: STRUCTURAL.reduce((n, k) => n + matching.summary[k], 0),
    changes: matching.changes.map(c => ({
      kind: c.kind,
      before: c.before.map(id => nameBefore.get(id) ?? id),
      after: c.after.map(id => nameAfter.get(id) ?? id),
      ...(c.reason ? { reason: c.reason } : {}),
      ...(withFiles ? { files: { before: c.before.map(id => membersBefore.get(id) ?? []), after: c.after.map(id => membersAfter.get(id) ?? []) } } : {}),
    })),
  };
}

/**
 * Snapshots oldest first. The baseline depth is chosen on the latest snapshot (or given) and used for all of them, so
 * the baseline changes only when folders do.
 */
export function evaluateEvolution(
  snapshots: EvaluatedSnapshotInput[],
  options: {
    reference?: ReferenceComponent[] | null; baseline?: Partial<BaselineOptions>; withFiles?: boolean;
    /** Evidence rule for structural changes (matching.ts); null reports every regrouping, as before 14/11/2026. */
    evidence?: MatchOptions['evidence'];
  } = {},
): EvolutionEvaluation {
  const withFiles = options.withFiles ?? false;
  const evidence = options.evidence === undefined ? EVIDENCE_RULE : options.evidence;
  const filesOf = (s: EvaluatedSnapshotInput) => [...new Set(s.components.flatMap(c => c.memberIds))].sort();
  const latest = snapshots[snapshots.length - 1];
  const depth = options.baseline?.depth ?? (latest ? directoryBaseline(filesOf(latest), options.baseline).depth : 1);
  const baselines = snapshots.map(s => directoryBaseline(filesOf(s), { ...options.baseline, depth }).components);
  const reference = options.reference?.length ? options.reference : null;

  const evaluated = snapshots.map((s, i): SnapshotEvaluation => {
    const recovered = groupingOf(s.components), baseline = groupingOf(baselines[i]);
    const out: SnapshotEvaluation = {
      snapshotId: s.snapshotId,
      files: recovered.size,
      components: { recovered: followable(s.components).length, baseline: baselines[i].length },
      recoveredVsBaseline: mojoFM(recovered, baseline),
    };
    if (reference) {
      const truth = referenceGrouping([...recovered.keys()], reference);
      out.reference = { recovered: mojoFM(recovered, truth), baseline: mojoFM(baseline, truth) };
    }
    if (s.variants && Object.keys(s.variants).length) {
      out.variants = Object.fromEntries(Object.entries(s.variants).map(([method, comps]) => {
        const grouping = groupingOf(comps);
        return [method, {
          components: followable(comps).length,
          reference: reference ? mojoFM(grouping, referenceGrouping([...grouping.keys()], reference)) : null,
        }];
      }));
    }
    return out;
  });

  const steps = snapshots.slice(1).map((s, k): StepEvaluation => {
    const prev = snapshots[k];
    const step: StepEvaluation = {
      from: prev.snapshotId,
      to: s.snapshotId,
      recovered: side(prev.components, s.components, followable(prev.components), followable(s.components), withFiles, evidence),
      baseline: side(baselines[k], baselines[k + 1], baselines[k], baselines[k + 1], withFiles, evidence),
    };
    const shared = Object.keys(s.variants ?? {}).filter(m => prev.variants?.[m]);
    if (shared.length) {
      step.variants = Object.fromEntries(shared.map(m => {
        const a = prev.variants![m], b = s.variants![m];
        return [m, side(a, b, followable(a), followable(b), withFiles, evidence)];
      }));
    }
    return step;
  });

  return {
    baselineDepth: depth,
    snapshots: evaluated,
    steps,
    overall: {
      stability: { recovered: mean(steps.map(s => s.recovered.stability?.score)), baseline: mean(steps.map(s => s.baseline.stability?.score)) },
      reference: { recovered: mean(evaluated.map(s => s.reference?.recovered?.score)), baseline: mean(evaluated.map(s => s.reference?.baseline?.score)) },
      structuralChanges: { recovered: steps.reduce((n, s) => n + s.recovered.structural, 0), baseline: steps.reduce((n, s) => n + s.baseline.structural, 0) },
    },
  };
}
