// RQ1: how well the recovered architecture holds up against simpler groupings, in two parts.
//   A. Recovery accuracy: MoJoFM of each grouping against the project's reference architecture, per snapshot, with a
//      Wilcoxon signed-rank test between the recovered grouping and each baseline.
//   B. Change detection: people judge every change each grouping reports between consecutive snapshots, without being
//      told which grouping reported it, and count the architectural changes that really happened; precision, recall and
//      F1 follow from those labels. Two annotators label independently; their agreement is reported (Cohen's kappa)
//      before their sheets are reconciled.
// The groupings ("methods"): recovered (the stored components, clustering refined by AI when it was used), clustering
// (the deterministic clustering alone), anchored (the recovered grouping carried from snapshot to snapshot, an optional
// variant) and baseline (folders). Everything here is a pure function of the evaluation (domain/architecture/
// evaluation.ts) and the label files, so the report can be recomputed from the files alone. Protocol: docs/rq1-protocol.md.

import { createHash } from 'node:crypto';
import type { NamedChange } from '../architecture/evaluation.js';
import type { ChangeKind } from '../architecture/matching.js';
import { cohenKappa, wilcoxonSignedRank } from './stats.js';
import type { KappaResult, WilcoxonResult } from './stats.js';

export type Method = 'recovered' | 'clustering' | 'anchored' | 'baseline';
export const METHOD_ORDER: readonly Method[] = ['recovered', 'clustering', 'anchored', 'baseline'];
export const METHOD_LABEL: Record<Method, string> = {
  recovered: 'ArchTime (recovered)', clustering: 'Clustering only', anchored: 'Anchored (variant)', baseline: 'Directory baseline',
};
export type Verdict = 'correct' | 'wrong';

interface Side { stability: { score: number } | null; changes: NamedChange[] }
type Score = { score: number; common: number } | null;

/** The parts of an evaluation payload RQ1 reads (ArchitectureService.evaluation). */
export interface EvaluationInput {
  baselineDepth: number;
  hasReference: boolean;
  snapshots: {
    snapshotId: string;
    snapshot: { hash: string; title: string; date: Date | string };
    /** How the stored components were made (cluster-only, cluster+llm, ...). */
    generator?: string;
    files: number;
    components: { recovered: number; baseline: number };
    reference?: { recovered: Score; baseline: Score };
    variants?: Record<string, { components: number; reference: Score }>;
  }[];
  steps: { from: string; to: string; recovered: Side; baseline: Side; variants?: Record<string, Side> }[];
}

/** File name stem of a workspace in rq1-results: its name, then the end of its id (names may repeat). */
export const workspaceSlug = (name: string, id: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${id.slice(-6)}`;

/** `count` items spread evenly over `items` (the milestones of a history), the first and the last always included. */
export function spreadEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  if (count < 2) return items.slice(-1);
  const picked = new Set<number>();
  for (let k = 0; k < count; k++) picked.add(Math.round((k * (items.length - 1)) / (count - 1)));
  return [...picked].sort((x, y) => x - y).map(i => items[i]);
}

/** Annotator names become part of file names. */
export const annotatorSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The methods an evaluation has, in report order. */
export function methodsOf(evaluation: EvaluationInput): Method[] {
  const variants = new Set([...evaluation.snapshots.flatMap(s => Object.keys(s.variants ?? {})), ...evaluation.steps.flatMap(s => Object.keys(s.variants ?? {}))]);
  return METHOD_ORDER.filter(m => m === 'recovered' || m === 'baseline' || variants.has(m));
}

const sideOf = (step: EvaluationInput['steps'][number], m: Method): Side | null =>
  m === 'recovered' || m === 'baseline' ? step[m] : step.variants?.[m] ?? null;
const referenceOf = (s: EvaluationInput['snapshots'][number], m: Method): number | null =>
  (m === 'recovered' || m === 'baseline' ? s.reference?.[m]?.score : s.variants?.[m]?.reference?.score) ?? null;
const componentsOf = (s: EvaluationInput['snapshots'][number], m: Method): number | null =>
  m === 'recovered' || m === 'baseline' ? s.components[m] : s.variants?.[m]?.components ?? null;

/** Kept and renamed are not structural changes; a rename is cosmetic, and kept is the absence of change. */
const JUDGED: readonly ChangeKind[] = ['split', 'merged', 'restructured', 'removed', 'added'];
const structural = (cs: NamedChange[]) => cs.filter(c => JUDGED.includes(c.kind));

// ------------------------------------------------------------------ label sheets

export interface ComponentRef { name: string; files?: number; sample?: string[] }
export interface BlindChange { key: string; kind: ChangeKind; before: ComponentRef[]; after: ComponentRef[]; verdict: Verdict | null; note?: string }
export interface PairEnd { id: string; hash: string; title?: string; date?: string }
export interface CommitContext { hash: string; title: string; date: string; depAdded?: number; depRemoved?: number }
export interface LabelPair {
  from: PairEnd;
  to: PairEnd;
  /** The mined commits after `from` up to `to`, oldest first, to help judge what happened. */
  commits?: CommitContext[];
  /** Architectural changes that really happened between the two snapshots, as the annotator judges them; null until labelled. */
  trueChanges: number | null;
  note?: string;
  /** Every structural change any method reported, in an order that does not reveal the method. */
  changes: BlindChange[];
}
export interface LabelSheet { version: 2; projectId: string; projectName: string; annotator?: string; instructions: string; pairs: LabelPair[] }
/** Which method reported each change of a sheet. Kept apart from the sheet so that annotators do not see it. */
export interface LabelKey { projectId: string; methods?: Method[]; pairs: { from: string; to: string; changes: { key: string; method: Method; id: string }[] }[] }

/** Sheets written before version 2 listed the changes per method; their labels are carried over. */
interface LegacyPair { from: PairEnd; to: PairEnd; trueChanges: number | null; note?: string; recovered?: { id: string; verdict: Verdict | null; note?: string }[]; baseline?: { id: string; verdict: Verdict | null; note?: string }[] }

export const LABEL_INSTRUCTIONS = [
  'For every pair of consecutive snapshots (from -> to):',
  '1. FIRST read the commits between them (listed under commits; or git log from.hash..to.hash and the diffs) and decide how',
  '   many architectural changes really happened: a functional block split, merged, reorganised, removed or added.',
  '   Write that number in trueChanges (0 is a valid answer). Do this before looking at the changes below.',
  '2. Then, for each entry under changes, set verdict to "correct" if it is one of those real changes, or "wrong" if it',
  '   is not (noise from regrouping, a rename reported as a split, a few files moving reported as a merge, ...).',
  'The changes come from several groupings in a shuffled order; which grouping reported which change is not shown.',
  'Work alone: a second annotator labels a copy of this sheet, and the agreement is measured before the sheets are reconciled.',
  'A pair counts once trueChanges and every verdict are filled. Re-running the script keeps what you wrote.',
].join('\n');

const changeId = (c: NamedChange) => `${c.kind}:${c.before.join('+')}>${c.after.join('+')}`;
const pairKey = (from: string, to: string) => `${from}>${to}`;
const blindKey = (from: string, to: string, method: Method, id: string) =>
  'c' + createHash('sha1').update(`${from}>${to}|${method}|${id}`).digest('hex').slice(0, 8);
const SAMPLE = 5;
const refs = (names: string[], files?: string[][]): ComponentRef[] =>
  names.map((name, i) => (files?.[i] ? { name, files: files[i].length, sample: files[i].slice(0, SAMPLE) } : { name }));

/**
 * The label sheet of a project for one annotator (or the reconciled sheet when `annotator` is absent), and the key
 * saying which method reported each change. Labels already written in `previous` are kept for the changes that still
 * appear. `commits` gives the commit context of each pair, keyed "fromId>toId".
 */
export function buildLabelSheet(
  project: { id: string; name: string },
  evaluation: EvaluationInput,
  previous?: LabelSheet | null,
  options: { annotator?: string; commits?: Record<string, CommitContext[]> } = {},
): { sheet: LabelSheet; key: LabelKey } {
  const methods = methodsOf(evaluation);
  const ends = new Map(evaluation.snapshots.map((s): [string, PairEnd] => [s.snapshotId, {
    id: s.snapshotId, hash: s.snapshot.hash, title: (s.snapshot.title ?? '').split('\n')[0], date: new Date(s.snapshot.date).toISOString().slice(0, 10),
  }]));
  const old = new Map<string, { trueChanges: number | null; note?: string; verdicts: Map<string, { verdict: Verdict | null; note?: string }> }>();
  for (const p of (previous?.pairs ?? []) as (LabelPair | LegacyPair)[]) {
    const verdicts = new Map<string, { verdict: Verdict | null; note?: string }>();
    if ('changes' in p && Array.isArray(p.changes)) {
      for (const c of p.changes) verdicts.set(c.key, { verdict: c.verdict, ...(c.note ? { note: c.note } : {}) });
    } else {
      const legacy = p as LegacyPair;
      for (const m of ['recovered', 'baseline'] as const) {
        for (const c of legacy[m] ?? []) verdicts.set(blindKey(p.from.id, p.to.id, m, c.id), { verdict: c.verdict, ...(c.note ? { note: c.note } : {}) });
      }
    }
    old.set(pairKey(p.from.id, p.to.id), { trueChanges: p.trueChanges, ...(p.note ? { note: p.note } : {}), verdicts });
  }

  const keyPairs: LabelKey['pairs'] = [];
  const pairs = evaluation.steps.map((step): LabelPair => {
    const before = old.get(pairKey(step.from, step.to));
    const listed: (BlindChange & { method: Method; id: string })[] = [];
    for (const m of methods) {
      for (const c of structural(sideOf(step, m)?.changes ?? [])) {
        const id = changeId(c);
        const key = blindKey(step.from, step.to, m, id);
        const prior = before?.verdicts.get(key);
        listed.push({
          key, kind: c.kind, before: refs(c.before, c.files?.before), after: refs(c.after, c.files?.after),
          verdict: prior?.verdict ?? null, ...(prior?.note ? { note: prior.note } : {}), method: m, id,
        });
      }
    }
    listed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    keyPairs.push({ from: step.from, to: step.to, changes: listed.map(c => ({ key: c.key, method: c.method, id: c.id })) });
    const commits = options.commits?.[pairKey(step.from, step.to)];
    return {
      from: ends.get(step.from) ?? { id: step.from, hash: '' },
      to: ends.get(step.to) ?? { id: step.to, hash: '' },
      ...(commits ? { commits } : {}),
      trueChanges: before?.trueChanges ?? null,
      ...(before?.note ? { note: before.note } : {}),
      changes: listed.map(({ method: _m, id: _i, ...c }) => c),
    };
  });
  return {
    sheet: { version: 2, projectId: project.id, projectName: project.name, ...(options.annotator ? { annotator: options.annotator } : {}), instructions: LABEL_INSTRUCTIONS, pairs },
    key: { projectId: project.id, methods, pairs: keyPairs },
  };
}

/** A pair can be scored once its true change count and every verdict are filled. */
export const isLabelled = (p: LabelPair) => p.trueChanges !== null && p.changes.every(c => c.verdict !== null);

export interface Prf { detected: number; correct: number; truth: number; precision: number | null; recall: number | null; f1: number | null }
export interface DetectionScore { labelledPairs: number; pendingPairs: number; methods: Partial<Record<Method, Prf>>; problems: string[] }

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10_000) / 10_000 : null);

/**
 * Precision = correct / detected, recall = correct / true changes, per method, over the labelled pairs of the
 * (reconciled) sheets. A pair where a method has more correct changes than there were true changes is reported as a
 * problem: the labels contradict each other, and only trueChanges correct changes are counted.
 */
export function scoreLabels(entries: { sheet: LabelSheet; key: LabelKey }[]): DetectionScore {
  const tally = new Map<Method, { detected: number; correct: number; truth: number }>();
  const problems: string[] = [];
  let labelled = 0, pending = 0;
  for (const { sheet, key } of entries) {
    const keyed = new Map(key.pairs.map(p => [pairKey(p.from, p.to), p]));
    // A method counts on a project only if it was evaluated there (recovered and baseline always are).
    const methods = [...new Set<Method>(['recovered', 'baseline', ...(key.methods ?? []), ...key.pairs.flatMap(p => p.changes.map(c => c.method))])];
    for (const m of methods) if (!tally.has(m)) tally.set(m, { detected: 0, correct: 0, truth: 0 });
    for (const p of sheet.pairs) {
      if (!isLabelled(p)) { pending++; continue; }
      labelled++;
      const methodOf = new Map((keyed.get(pairKey(p.from.id, p.to.id))?.changes ?? []).map(c => [c.key, c.method]));
      for (const m of methods) {
        const t = tally.get(m)!;
        const mine = p.changes.filter(c => methodOf.get(c.key) === m);
        const correct = mine.filter(c => c.verdict === 'correct').length;
        if (correct > p.trueChanges!) problems.push(`${sheet.projectName} ${p.from.hash}..${p.to.hash}: ${m} has ${correct} correct changes but trueChanges is ${p.trueChanges}.`);
        t.detected += mine.length;
        t.correct += Math.min(correct, p.trueChanges!);
        t.truth += p.trueChanges!;
      }
    }
  }
  const methods: Partial<Record<Method, Prf>> = {};
  for (const m of METHOD_ORDER) {
    const t = tally.get(m);
    if (!t) continue;
    const precision = ratio(t.correct, t.detected), recall = ratio(t.correct, t.truth);
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? Math.round(((2 * precision * recall) / (precision + recall)) * 10_000) / 10_000 : null;
    methods[m] = { ...t, precision, recall, f1 };
  }
  return { labelledPairs: labelled, pendingPairs: pending, methods, problems };
}

export interface Agreement {
  /** Pairs both annotators gave a trueChanges value. */
  pairs: number;
  /** Share of those pairs with the same trueChanges, and the mean absolute difference. */
  trueChangesExact: number | null;
  trueChangesMeanDiff: number | null;
  /** Cohen's kappa on the verdicts both annotators gave. */
  verdicts: KappaResult | null;
}

/** Agreement of two annotators on the same project, before reconciliation. */
export function agreement(a: LabelSheet, b: LabelSheet): Agreement {
  const other = new Map(b.pairs.map(p => [pairKey(p.from.id, p.to.id), p]));
  const counts: [number, number][] = [];
  const verdicts: [Verdict, Verdict][] = [];
  for (const p of a.pairs) {
    const q = other.get(pairKey(p.from.id, p.to.id));
    if (!q) continue;
    if (p.trueChanges !== null && q.trueChanges !== null) counts.push([p.trueChanges, q.trueChanges]);
    const theirs = new Map(q.changes.map(c => [c.key, c.verdict]));
    for (const c of p.changes) { const v = theirs.get(c.key); if (c.verdict && v) verdicts.push([c.verdict, v]); }
  }
  return {
    pairs: counts.length,
    trueChangesExact: ratio(counts.filter(([x, y]) => x === y).length, counts.length),
    trueChangesMeanDiff: counts.length ? Math.round((counts.reduce((s, [x, y]) => s + Math.abs(x - y), 0) / counts.length) * 100) / 100 : null,
    verdicts: cohenKappa(verdicts),
  };
}

/**
 * The reconciled sheet from the annotators' sheets: a value all annotators who gave one agree on is filled in; a
 * disagreement stays empty (or keeps what was already decided in `existing`) and is described in the note, to be settled
 * together. An annotator who left a value empty does not count for it, so a second annotator may label only a sample of
 * the pairs: the other pairs keep the first annotator's labels.
 */
export function reconcile(sheets: LabelSheet[], existing?: LabelSheet | null): { sheet: LabelSheet; conflicts: number } {
  if (!sheets.length) throw new Error('reconcile needs at least one annotator sheet');
  const [first] = sheets;
  const decided = new Map((existing?.pairs ?? []).map(p => [pairKey(p.from.id, p.to.id), p]));
  let conflicts = 0;
  const who = (s: LabelSheet, i: number) => s.annotator ?? `annotator ${i + 1}`;
  const pairs = first.pairs.map((p): LabelPair => {
    const k = pairKey(p.from.id, p.to.id);
    const all = sheets.map(s => s.pairs.find(q => pairKey(q.from.id, q.to.id) === k));
    const prior = decided.get(k);
    const notes: string[] = [];
    const counts = all.map(q => q?.trueChanges ?? null);
    let trueChanges = prior?.trueChanges ?? null;
    if (trueChanges === null) {
      const given = counts.filter((c): c is number => c !== null);
      if (given.length && given.every(c => c === given[0])) trueChanges = given[0];
      else if (given.length) { conflicts++; notes.push(`trueChanges: ${counts.map((c, i) => `${who(sheets[i], i)}=${c ?? '-'}`).join(', ')}`); }
    }
    const changes = p.changes.map((c): BlindChange => {
      const priorVerdict = prior?.changes.find(x => x.key === c.key)?.verdict ?? null;
      const vs = all.map(q => q?.changes.find(x => x.key === c.key)?.verdict ?? null);
      let verdict = priorVerdict;
      if (verdict === null) {
        const given = vs.filter((v): v is Verdict => v !== null);
        if (given.length && given.every(v => v === given[0])) verdict = given[0];
        else if (given.length) { conflicts++; notes.push(`${c.key}: ${vs.map((v, i) => `${who(sheets[i], i)}=${v ?? '-'}`).join(', ')}`); }
      }
      const { note: _n, ...rest } = c;
      return { ...rest, verdict };
    });
    const note = [prior?.note, notes.length ? `To settle: ${notes.join('; ')}` : ''].filter(Boolean).join(' | ');
    const { annotator: _a, ...base } = p as LabelPair & { annotator?: string };
    return { ...base, trueChanges, changes, ...(note ? { note } : {}) } as LabelPair;
  });
  const { annotator: _a, ...head } = first;
  return { sheet: { ...head, pairs }, conflicts };
}

// ------------------------------------------------------------------ tables

export type RecoveryRow = { project: string; snapshot: string; date: string; generator: string; files: number; referenceFiles: number | null } & Record<string, string | number | null>;

export function recoveryRows(project: string, evaluation: EvaluationInput): RecoveryRow[] {
  const methods = methodsOf(evaluation);
  return evaluation.snapshots.map(s => {
    const row: RecoveryRow = {
      project, snapshot: s.snapshot.hash, date: new Date(s.snapshot.date).toISOString().slice(0, 10), generator: s.generator ?? '', files: s.files,
      referenceFiles: s.reference?.recovered?.common ?? s.reference?.baseline?.common ?? null,
    };
    for (const m of methods) { row[`${m}Components`] = componentsOf(s, m); row[`${m}VsReference`] = referenceOf(s, m); }
    return row;
  });
}

export type StabilityRow = { project: string; from: string; to: string } & Record<string, string | number | null>;

export function stabilityRows(project: string, evaluation: EvaluationInput): StabilityRow[] {
  const methods = methodsOf(evaluation);
  const hashOf = new Map(evaluation.snapshots.map(s => [s.snapshotId, s.snapshot.hash]));
  return evaluation.steps.map(st => {
    const row: StabilityRow = { project, from: hashOf.get(st.from) ?? st.from, to: hashOf.get(st.to) ?? st.to };
    for (const m of methods) {
      const side = sideOf(st, m);
      row[`${m}Stability`] = side?.stability?.score ?? null;
      row[`${m}Changes`] = side ? structural(side.changes).length : null;
    }
    return row;
  });
}

const mean = (xs: unknown[]) => {
  const ys = xs.filter((x): x is number => typeof x === 'number');
  return ys.length ? Math.round((ys.reduce((a, b) => a + b, 0) / ys.length) * 100) / 100 : null;
};

export function toCsv<T extends object>(rows: T[]): string {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))] as (keyof T)[];
  const cell = (v: unknown) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n') + '\n';
}

const fmt = (x: number | null, digits = 2) => (x === null ? 'n/a' : x.toFixed(digits));
const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const test = (w: WilcoxonResult | null) => (w ? `n=${w.n}, p=${w.p.toFixed(4)}${w.exact ? '' : ' (normal approx.)'}, r=${w.effect.toFixed(2)}` : 'n/a');

/** Wilcoxon signed-rank tests of the recovered grouping against each other method, on the snapshots with a reference. */
export function recoveryTests(rows: RecoveryRow[], methods: Method[]): { project: string; against: Method; result: WilcoxonResult | null }[] {
  const out: { project: string; against: Method; result: WilcoxonResult | null }[] = [];
  for (const project of [...new Set(rows.map(r => r.project))]) {
    const mine = rows.filter(r => r.project === project);
    for (const m of methods.filter(x => x !== 'recovered')) {
      out.push({ project, against: m, result: wilcoxonSignedRank(mine.map(r => r.recoveredVsReference as number | null), mine.map(r => r[`${m}VsReference`] as number | null)) });
    }
  }
  return out;
}

/** The RQ1 report: what was measured, on what, and the numbers, in Markdown. */
export function renderReport(input: {
  generatedAt: string;
  projects: { name: string; snapshots: number; baselineDepth: number; hasReference: boolean; generators?: string[] }[];
  methods: Method[];
  recovery: RecoveryRow[];
  stability: StabilityRow[];
  detection: DetectionScore;
  agreement?: { project: string; annotators: [string, string]; result: Agreement }[];
}): string {
  const { recovery, stability, detection, methods } = input;
  const lines = [
    '# RQ1 results', '',
    `Generated ${input.generatedAt}. Protocol: docs/rq1-protocol.md. Groupings: ${methods.map(m => METHOD_LABEL[m]).join(', ')}.`, '',
    '## Dataset', '',
    '| Project | Snapshots | Baseline depth | Reference architecture | Components built with |', '|---|---|---|---|---|',
    ...input.projects.map(p => `| ${p.name} | ${p.snapshots} | ${p.baselineDepth} | ${p.hasReference ? 'yes' : 'no (part A skipped)'} | ${(p.generators ?? []).join(', ') || 'n/a'} |`),
    '',
  ];
  const mixed = input.projects.filter(p => (p.generators?.length ?? 0) > 1);
  if (mixed.length) {
    lines.push(`**Warning:** ${mixed.map(p => p.name).join(', ')} mix(es) build methods across snapshots; stability and change detection then also measure the difference between the methods. Rebuild every milestone the same way (npm run rq1:milestones).`, '');
  }
  lines.push('## A. Recovery accuracy (MoJoFM against the reference, 0–100)', '');
  const withRef = recovery.filter(r => methods.some(m => r[`${m}VsReference`] !== null && r[`${m}VsReference`] !== undefined));
  if (!withRef.length) {
    lines.push('No project has a reference architecture yet, so part A has no numbers. Declare one per project (Architecture workspace > Reference).', '');
  } else {
    lines.push(`| Project | Snapshots | ${methods.map(m => `${METHOD_LABEL[m]} (mean)`).join(' | ')} | Recovered better than baseline in |`,
      `|---|---|${methods.map(() => '---|').join('')}---|`);
    for (const p of [...new Set(withRef.map(r => r.project))]) {
      const rows = withRef.filter(r => r.project === p);
      const better = rows.filter(r => typeof r.recoveredVsReference === 'number' && typeof r.baselineVsReference === 'number' && r.recoveredVsReference > r.baselineVsReference).length;
      lines.push(`| ${p} | ${rows.length} | ${methods.map(m => fmt(mean(rows.map(r => r[`${m}VsReference`])))).join(' | ')} | ${better} of ${rows.length} |`);
    }
    lines.push(`| **All** | ${withRef.length} | ${methods.map(m => `**${fmt(mean(withRef.map(r => r[`${m}VsReference`])))}**`).join(' | ')} | |`, '');
    lines.push('Wilcoxon signed-rank test, recovered against each other grouping, per project (paired by snapshot; r is the matched-pairs rank-biserial correlation, positive when the recovered grouping scores higher):', '',
      '| Project | Against | Result |', '|---|---|---|',
      ...recoveryTests(withRef, methods).map(t => `| ${t.project} | ${METHOD_LABEL[t.against]} | ${test(t.result)} |`), '',
      'Snapshots of one project are not independent; read p-values per project, and do not pool them across projects.',
      'Threat to validity: a reference written as folder prefixes favours a grouping by folder, that is, the baseline.', '');
  }
  lines.push('## Stability between consecutive snapshots (MoJoFM, 100 = nothing moved)', '',
    `| Project | Steps | ${methods.map(m => `${METHOD_LABEL[m]} stability`).join(' | ')} | Structural changes reported (${methods.join(' / ')}) |`,
    `|---|---|${methods.map(() => '---|').join('')}---|`);
  for (const p of [...new Set(stability.map(r => r.project))]) {
    const rows = stability.filter(r => r.project === p);
    const sum = (m: Method) => rows.reduce((n, r) => n + (typeof r[`${m}Changes`] === 'number' ? (r[`${m}Changes`] as number) : 0), 0);
    lines.push(`| ${p} | ${rows.length} | ${methods.map(m => fmt(mean(rows.map(r => r[`${m}Stability`])))).join(' | ')} | ${methods.map(sum).join(' / ')} |`);
  }
  lines.push('', '## B. Change detection (labelled pairs)', '',
    `${detection.labelledPairs} pairs labelled, ${detection.pendingPairs} still to label (rq1-results/labels/<project>.json, reconciled).`, '');
  if (input.agreement?.length) {
    lines.push('Agreement of the two annotators before reconciliation:', '',
      '| Project | Annotators | Pairs | trueChanges identical | Mean difference | Verdicts compared | Verdict agreement | Cohen\'s kappa |', '|---|---|---|---|---|---|---|---|',
      ...input.agreement.map(a => `| ${a.project} | ${a.annotators.join(', ')} | ${a.result.pairs} | ${pct(a.result.trueChangesExact)} | ${fmt(a.result.trueChangesMeanDiff)} | ${a.result.verdicts?.n ?? 0} | ${pct(a.result.verdicts?.agreement ?? null)} | ${fmt(a.result.verdicts?.kappa ?? null)} |`), '');
  }
  if (detection.labelledPairs) {
    lines.push('| Grouping | Reported | Correct | True changes | Precision | Recall | F1 |', '|---|---|---|---|---|---|---|');
    for (const m of methods) {
      const s = detection.methods[m];
      if (s) lines.push(`| ${METHOD_LABEL[m]} | ${s.detected} | ${s.correct} | ${s.truth} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} |`);
    }
    lines.push('');
  }
  if (detection.problems.length) lines.push('### Label problems', '', ...detection.problems.map(p => `- ${p}`), '');
  return lines.join('\n');
}
