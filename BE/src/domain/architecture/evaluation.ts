// How the recovered architecture compares with the directory baseline, snapshot by snapshot and step by step.
// For each snapshot: agreement with the project's reference architecture (when one is set) and with the baseline.
// For each step between consecutive snapshots: how stable each grouping stays (MoJoFM over the files both snapshots
// have) and which structural changes each one shows (component matching). See mojo.ts, baseline.ts and matching.ts.

import { directoryBaseline } from './baseline.js';
import type { BaselineOptions } from './baseline.js';
import { matchComponents } from './matching.js';
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
}

export interface SnapshotEvaluation {
  snapshotId: string;
  files: number;
  components: { recovered: number; baseline: number };
  /** Recovered grouping measured against the baseline: 100 = the recovery only repeats the folders. */
  recoveredVsBaseline: MojoFmResult | null;
  /** Each grouping measured against the reference architecture, over the files the reference covers. */
  reference?: { recovered: MojoFmResult | null; baseline: MojoFmResult | null };
}

export interface StepSide {
  /** Later snapshot taken as right: 100 = nothing moved between components. */
  stability: MojoFmResult | null;
  summary: Record<ChangeKind, number>;
  /** Changes other than kept and renamed: splits, merges, restructurings, removals and additions. */
  structural: number;
}

export interface StepEvaluation { from: string; to: string; recovered: StepSide; baseline: StepSide }

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

function side(before: MatchComponent[], after: MatchComponent[], followBefore: MatchComponent[], followAfter: MatchComponent[]): StepSide {
  const matching = matchComponents(followBefore, followAfter);
  return {
    stability: mojoFM(groupingOf(before), groupingOf(after)),
    summary: matching.summary,
    structural: STRUCTURAL.reduce((n, k) => n + matching.summary[k], 0),
  };
}

/**
 * Snapshots oldest first. The baseline depth is chosen on the latest snapshot (or given) and used for all of them, so
 * the baseline changes only when folders do.
 */
export function evaluateEvolution(
  snapshots: EvaluatedSnapshotInput[],
  options: { reference?: ReferenceComponent[] | null; baseline?: Partial<BaselineOptions> } = {},
): EvolutionEvaluation {
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
    return out;
  });

  const steps = snapshots.slice(1).map((s, k): StepEvaluation => {
    const prev = snapshots[k];
    return {
      from: prev.snapshotId,
      to: s.snapshotId,
      recovered: side(prev.components, s.components, followable(prev.components), followable(s.components)),
      baseline: side(baselines[k], baselines[k + 1], baselines[k], baselines[k + 1]),
    };
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
