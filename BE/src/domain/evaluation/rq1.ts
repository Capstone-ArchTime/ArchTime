// RQ1: how well the recovered architecture holds up against the directory baseline, in two parts.
//   A. Recovery accuracy: MoJoFM of each grouping against the project's reference architecture, per snapshot.
//   B. Change detection: a person judges every change each grouping reports between consecutive snapshots, and counts
//      the architectural changes that really happened; precision, recall and F1 follow from those labels.
// Everything here is a pure function of the evaluation (domain/architecture/evaluation.ts) and the label sheets, so the
// numbers in the report can be recomputed from the files alone. Protocol: docs/rq1-protocol.md.

import type { NamedChange } from '../architecture/evaluation.js';
import type { ChangeKind } from '../architecture/matching.js';

export type Tool = 'recovered' | 'baseline';
export const TOOLS: readonly Tool[] = ['recovered', 'baseline'];
export type Verdict = 'correct' | 'wrong';

/** The parts of an evaluation payload RQ1 reads (ArchitectureService.evaluation). */
export interface EvaluationInput {
  baselineDepth: number;
  hasReference: boolean;
  snapshots: {
    snapshotId: string;
    snapshot: { hash: string; title: string; date: Date | string };
    files: number;
    components: { recovered: number; baseline: number };
    reference?: { recovered: { score: number; common: number } | null; baseline: { score: number; common: number } | null };
  }[];
  steps: {
    from: string;
    to: string;
    recovered: { stability: { score: number } | null; changes: NamedChange[] };
    baseline: { stability: { score: number } | null; changes: NamedChange[] };
  }[];
}

export interface LabelledChange { id: string; kind: ChangeKind; before: string[]; after: string[]; reason?: string; verdict: Verdict | null; note?: string }
export interface PairEnd { id: string; hash: string; title?: string; date?: string }
export interface LabelPair {
  from: PairEnd;
  to: PairEnd;
  recovered: LabelledChange[];
  baseline: LabelledChange[];
  /** Architectural changes that really happened between the two snapshots, as the labeller judges them; null until labelled. */
  trueChanges: number | null;
  note?: string;
}
export interface LabelSheet { projectId: string; projectName: string; instructions: string; pairs: LabelPair[] }

/** Kept and renamed are not structural changes; a rename is cosmetic, and kept is the absence of change. */
const JUDGED: readonly ChangeKind[] = ['split', 'merged', 'restructured', 'removed', 'added'];

export const LABEL_INSTRUCTIONS = [
  'For every pair of consecutive snapshots:',
  '1. Look at the commits between them (git log from.hash..to.hash) and decide how many architectural changes really happened',
  '   (a component split, merged, regrouped, removed or added). Write that number in trueChanges (0 is a valid answer).',
  '2. For each change listed under recovered and baseline, set verdict to "correct" if it is one of those real changes,',
  '   or "wrong" if it is not (noise from regrouping, a rename reported as a split, ...).',
  'A pair counts once trueChanges and every verdict are filled. Re-running the script keeps what you wrote.',
].join('\n');

const changeId = (c: NamedChange) => `${c.kind}:${c.before.join('+')}>${c.after.join('+')}`;

/**
 * The label sheet for a project: one entry per pair of consecutive snapshots, listing the structural changes each grouping
 * reports. Labels already written in `previous` are kept for the changes that still appear.
 */
export function buildLabelSheet(project: { id: string; name: string }, evaluation: EvaluationInput, previous?: LabelSheet | null): LabelSheet {
  const ends = new Map(evaluation.snapshots.map((s): [string, PairEnd] => [s.snapshotId, {
    id: s.snapshotId, hash: s.snapshot.hash, title: (s.snapshot.title ?? '').split('\n')[0], date: new Date(s.snapshot.date).toISOString().slice(0, 10),
  }]));
  const old = new Map((previous?.pairs ?? []).map(p => [`${p.from.id}>${p.to.id}`, p]));
  const pairs = evaluation.steps.map((step): LabelPair => {
    const before = old.get(`${step.from}>${step.to}`);
    const keep = (tool: Tool, changes: NamedChange[]): LabelledChange[] => {
      const verdicts = new Map((before?.[tool] ?? []).map(c => [c.id, c]));
      return changes.filter(c => JUDGED.includes(c.kind)).map(c => {
        const id = changeId(c);
        const prior = verdicts.get(id);
        return { id, kind: c.kind, before: c.before, after: c.after, ...(c.reason ? { reason: c.reason } : {}), verdict: prior?.verdict ?? null, ...(prior?.note ? { note: prior.note } : {}) };
      });
    };
    return {
      from: ends.get(step.from) ?? { id: step.from, hash: '' },
      to: ends.get(step.to) ?? { id: step.to, hash: '' },
      recovered: keep('recovered', step.recovered.changes),
      baseline: keep('baseline', step.baseline.changes),
      trueChanges: before?.trueChanges ?? null,
      ...(before?.note ? { note: before.note } : {}),
    };
  });
  return { projectId: project.id, projectName: project.name, instructions: LABEL_INSTRUCTIONS, pairs };
}

/** A pair can be scored once its true change count and every verdict are filled. */
export const isLabelled = (p: LabelPair) => p.trueChanges !== null && TOOLS.every(t => p[t].every(c => c.verdict !== null));

export interface Prf { detected: number; correct: number; truth: number; precision: number | null; recall: number | null; f1: number | null }
export interface DetectionScore { labelledPairs: number; pendingPairs: number; tools: Record<Tool, Prf>; problems: string[] }

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10_000) / 10_000 : null);

/**
 * Precision = correct / detected, recall = correct / true changes, over the labelled pairs. A pair where a tool has more
 * correct changes than there were true changes is reported as a problem: the labels contradict each other.
 */
export function scoreLabels(sheets: LabelSheet[]): DetectionScore {
  const tally = Object.fromEntries(TOOLS.map(t => [t, { detected: 0, correct: 0, truth: 0 }])) as Record<Tool, { detected: number; correct: number; truth: number }>;
  const problems: string[] = [];
  let labelled = 0, pending = 0;
  for (const sheet of sheets) {
    for (const p of sheet.pairs) {
      if (!isLabelled(p)) { pending++; continue; }
      labelled++;
      for (const t of TOOLS) {
        const correct = p[t].filter(c => c.verdict === 'correct').length;
        if (correct > p.trueChanges!) problems.push(`${sheet.projectName} ${p.from.hash}..${p.to.hash}: ${t} has ${correct} correct changes but trueChanges is ${p.trueChanges}.`);
        tally[t].detected += p[t].length;
        tally[t].correct += Math.min(correct, p.trueChanges!);
        tally[t].truth += p.trueChanges!;
      }
    }
  }
  const tools = Object.fromEntries(TOOLS.map(t => {
    const { detected, correct, truth } = tally[t];
    const precision = ratio(correct, detected), recall = ratio(correct, truth);
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? Math.round(((2 * precision * recall) / (precision + recall)) * 10_000) / 10_000 : null;
    return [t, { detected, correct, truth, precision, recall, f1 }];
  })) as Record<Tool, Prf>;
  return { labelledPairs: labelled, pendingPairs: pending, tools, problems };
}

export interface RecoveryRow {
  project: string; snapshot: string; date: string; files: number; recoveredComponents: number; baselineComponents: number;
  recoveredVsReference: number | null; baselineVsReference: number | null; referenceFiles: number | null;
}

export function recoveryRows(project: string, evaluation: EvaluationInput): RecoveryRow[] {
  return evaluation.snapshots.map(s => ({
    project, snapshot: s.snapshot.hash, date: new Date(s.snapshot.date).toISOString().slice(0, 10), files: s.files,
    recoveredComponents: s.components.recovered, baselineComponents: s.components.baseline,
    recoveredVsReference: s.reference?.recovered?.score ?? null, baselineVsReference: s.reference?.baseline?.score ?? null,
    referenceFiles: s.reference?.recovered?.common ?? s.reference?.baseline?.common ?? null,
  }));
}

export interface StabilityRow { project: string; from: string; to: string; recoveredStability: number | null; baselineStability: number | null; recoveredChanges: number; baselineChanges: number }

export function stabilityRows(project: string, evaluation: EvaluationInput): StabilityRow[] {
  const hashOf = new Map(evaluation.snapshots.map(s => [s.snapshotId, s.snapshot.hash]));
  const structural = (cs: NamedChange[]) => cs.filter(c => JUDGED.includes(c.kind)).length;
  return evaluation.steps.map(st => ({
    project, from: hashOf.get(st.from) ?? st.from, to: hashOf.get(st.to) ?? st.to,
    recoveredStability: st.recovered.stability?.score ?? null, baselineStability: st.baseline.stability?.score ?? null,
    recoveredChanges: structural(st.recovered.changes), baselineChanges: structural(st.baseline.changes),
  }));
}

const mean = (xs: (number | null)[]) => {
  const ys = xs.filter((x): x is number => x !== null);
  return ys.length ? Math.round((ys.reduce((a, b) => a + b, 0) / ys.length) * 100) / 100 : null;
};

export function toCsv<T extends object>(rows: T[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]) as (keyof T)[];
  const cell = (v: unknown) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n') + '\n';
}

const fmt = (x: number | null, digits = 2) => (x === null ? 'n/a' : x.toFixed(digits));
const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

/** The RQ1 report: what was measured, on what, and the numbers, in Markdown. */
export function renderReport(input: {
  generatedAt: string;
  projects: { name: string; snapshots: number; baselineDepth: number; hasReference: boolean }[];
  recovery: RecoveryRow[];
  stability: StabilityRow[];
  detection: DetectionScore;
}): string {
  const { recovery, stability, detection } = input;
  const withRef = recovery.filter(r => r.recoveredVsReference !== null || r.baselineVsReference !== null);
  const lines = [
    '# RQ1 results', '',
    `Generated ${input.generatedAt}. Protocol: docs/rq1-protocol.md.`, '',
    '## Dataset', '',
    '| Project | Snapshots | Baseline depth | Reference architecture |', '|---|---|---|---|',
    ...input.projects.map(p => `| ${p.name} | ${p.snapshots} | ${p.baselineDepth} | ${p.hasReference ? 'yes' : 'no (part A skipped)'} |`),
    '',
    '## A. Recovery accuracy (MoJoFM against the reference, 0–100)', '',
  ];
  if (!withRef.length) {
    lines.push('No project has a reference architecture yet, so part A has no numbers. Declare one per project (Architecture workspace > Reference).', '');
  } else {
    const byProject = [...new Set(withRef.map(r => r.project))];
    lines.push('| Project | Snapshots | Recovered (mean) | Baseline (mean) | Recovered better in |', '|---|---|---|---|---|');
    for (const p of byProject) {
      const rows = withRef.filter(r => r.project === p);
      const better = rows.filter(r => r.recoveredVsReference !== null && r.baselineVsReference !== null && r.recoveredVsReference > r.baselineVsReference).length;
      lines.push(`| ${p} | ${rows.length} | ${fmt(mean(rows.map(r => r.recoveredVsReference)))} | ${fmt(mean(rows.map(r => r.baselineVsReference)))} | ${better} of ${rows.length} |`);
    }
    lines.push(`| **All** | ${withRef.length} | **${fmt(mean(withRef.map(r => r.recoveredVsReference)))}** | **${fmt(mean(withRef.map(r => r.baselineVsReference)))}** | |`, '');
    lines.push('Threat to validity: a reference written as path prefixes favours a grouping by folder, that is, the baseline.', '');
  }
  lines.push('## Stability between consecutive snapshots (MoJoFM, 100 = nothing moved)', '',
    '| Project | Steps | Recovered (mean) | Baseline (mean) | Structural changes reported: recovered / baseline |', '|---|---|---|---|---|');
  for (const p of [...new Set(stability.map(r => r.project))]) {
    const rows = stability.filter(r => r.project === p);
    lines.push(`| ${p} | ${rows.length} | ${fmt(mean(rows.map(r => r.recoveredStability)))} | ${fmt(mean(rows.map(r => r.baselineStability)))} | ${rows.reduce((n, r) => n + r.recoveredChanges, 0)} / ${rows.reduce((n, r) => n + r.baselineChanges, 0)} |`);
  }
  lines.push('', '## B. Change detection (labelled pairs)', '',
    `${detection.labelledPairs} pairs labelled, ${detection.pendingPairs} still to label (rq1-results/labels/*.json).`, '');
  if (detection.labelledPairs) {
    lines.push('| Grouping | Reported | Correct | True changes | Precision | Recall | F1 |', '|---|---|---|---|---|---|---|');
    for (const t of TOOLS) {
      const s = detection.tools[t];
      lines.push(`| ${t === 'recovered' ? 'ArchTime (recovered)' : 'Directory baseline'} | ${s.detected} | ${s.correct} | ${s.truth} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} |`);
    }
    lines.push('');
  }
  if (detection.problems.length) lines.push('### Label problems', '', ...detection.problems.map(p => `- ${p}`), '');
  return lines.join('\n');
}
