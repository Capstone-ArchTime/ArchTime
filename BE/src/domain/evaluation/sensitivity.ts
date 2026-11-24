// Sensitivity of change detection to the dominance threshold δ of component matching (matching.ts, frozen at 0.5).
// Exploratory, for the threats-to-validity discussion only: the frozen method keeps δ = 0.5, and nothing here may be
// used to pick a threshold on the test set (docs/rq1-protocol.md §1).
//
// For each δ and grouping it counts the events reported (by kind), the regroupings the evidence rule turned into "kept",
// and the moved files (which do not depend on δ). Where the reconciled label sheet of the frozen run (δ = 0.5) already
// judged an identical change (same pair, grouping, kind and components, hence the same blind key), its verdict is
// reused; any other change is counted as unlabelled, and precision is reported only when no change is unlabelled.
// Recall would need the same: trueChanges is per pair and does not depend on δ, so it is reused as is.

import type { ChangeKind } from '../architecture/matching.js';
import { changeKeyOf, methodsOf, structuralChanges } from './rq1.js';
import type { EvaluationInput, LabelKey, LabelSheet, Method } from './rq1.js';

export interface SensitivityRow {
  project: string;
  dominance: number;
  method: Method;
  steps: number;
  kept: number; renamed: number; split: number; merged: number; restructured: number; added: number; removed: number;
  /** Kept with reason "regrouped": a split / merge / restructuring the evidence rule suppressed. */
  regrouped: number;
  /** Split + merged + restructured + added + removed: the events annotators judge. */
  structural: number;
  /** Moved files paired by unique file name (independent of δ by construction). */
  filesMoved: number;
  /** Structural events whose verdict is known from the frozen run's reconciled sheet. */
  labelled: number;
  correct: number;
  wrong: number;
  unlabelled: number;
  /** Labelled pairs' true changes (independent of δ). */
  trueChanges: number;
  /** correct / structural, only when every structural event is labelled; otherwise null. */
  precision: number | null;
  /** min(correct, trueChanges) per pair / trueChanges, only when every structural event is labelled; otherwise null. */
  recall: number | null;
}

const KINDS: ChangeKind[] = ['kept', 'renamed', 'split', 'merged', 'restructured', 'added', 'removed'];
type Side = { changes: { kind: ChangeKind; reason?: string; before: string[]; after: string[] }[]; filesMoved?: number };
const sideOf = (step: EvaluationInput['steps'][number], m: Method): Side | null =>
  ((m === 'recovered' || m === 'baseline' ? step[m] : step.variants?.[m]) as Side | undefined) ?? null;
const round = (x: number) => Math.round(x * 10_000) / 10_000;

export function sensitivityRows(
  project: string,
  runs: { dominance: number; evaluation: EvaluationInput }[],
  labels?: { sheet: LabelSheet; key: LabelKey } | null,
): SensitivityRow[] {
  const pairs = new Map((labels?.sheet.pairs ?? []).map(p => [`${p.from.id}>${p.to.id}`, p]));
  const out: SensitivityRow[] = [];
  for (const { dominance, evaluation } of runs) {
    for (const method of methodsOf(evaluation)) {
      const row: SensitivityRow = {
        project, dominance, method, steps: evaluation.steps.length,
        kept: 0, renamed: 0, split: 0, merged: 0, restructured: 0, added: 0, removed: 0, regrouped: 0, structural: 0, filesMoved: 0,
        labelled: 0, correct: 0, wrong: 0, unlabelled: 0, trueChanges: 0, precision: null, recall: null,
      };
      let cappedCorrect = 0;
      for (const step of evaluation.steps) {
        const side = sideOf(step, method);
        if (!side) continue;
        for (const c of side.changes) {
          if (KINDS.includes(c.kind)) row[c.kind]++;
          if (c.kind === 'kept' && c.reason === 'regrouped') row.regrouped++;
        }
        row.filesMoved += side.filesMoved ?? 0;
        const pair = pairs.get(`${step.from}>${step.to}`);
        const verdicts = new Map((pair?.changes ?? []).map(c => [c.key, c.verdict]));
        let correctHere = 0;
        for (const c of structuralChanges(step, method)) {
          row.structural++;
          const v = verdicts.get(changeKeyOf(step.from, step.to, method, c)) ?? null;
          if (v === 'correct') { row.labelled++; row.correct++; correctHere++; }
          else if (v === 'wrong') { row.labelled++; row.wrong++; }
          else row.unlabelled++;
        }
        if (pair && pair.trueChanges !== null) { row.trueChanges += pair.trueChanges; cappedCorrect += Math.min(correctHere, pair.trueChanges); }
      }
      if (labels && row.unlabelled === 0) {
        row.precision = row.structural ? round(row.correct / row.structural) : null;
        row.recall = row.trueChanges ? round(cappedCorrect / row.trueChanges) : null;
      }
      out.push(row);
    }
  }
  return out;
}
