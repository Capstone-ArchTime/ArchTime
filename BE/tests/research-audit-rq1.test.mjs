// Research audit (2026-11-24): Gwet's AC1, RQ1-B sheet validation and disagreement export, per-project scores, the
// frozen method (anchored) as the primary grouping of the Wilcoxon tests with Holm over projects, both ways of averaging
// RQ1-A, reference completeness checks, and the dominance sensitivity rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cohenKappa, gwetAC1, holm, wilcoxonSignedRank } from '../src/domain/evaluation/stats.ts';
import {
  aggregateMeans, agreement, buildLabelSheet, droppedMethods, labelDisagreements, recoveryTests, renderReport, scoreByProject, scoreLabels, validateLabelSheet,
} from '../src/domain/evaluation/rq1.ts';
import { fileDisagreements, parseReferenceFile, referenceProblems } from '../src/domain/evaluation/referenceAgreement.ts';
import { sensitivityRows } from '../src/domain/evaluation/sensitivity.ts';

// ── Gwet's AC1 ───────────────────────────────────────────────────────────────────────────────────────────────────

test("AC1 reproduces the development-set figures by hand: 14/16 verdicts agree, kappa -0.07, AC1 0.86", () => {
  // Reconstructed from docs/rq1-protocol.md §4: each annotator marked one (different) change correct, 14 both wrong.
  const pairs = [['correct', 'wrong'], ['wrong', 'correct'], ...Array.from({ length: 14 }, () => ['wrong', 'wrong'])];
  assert.equal(cohenKappa(pairs).kappa, -0.0667);
  const r = gwetAC1(pairs, ['correct', 'wrong']);
  assert.equal(r.agreement, 0.875);
  assert.equal(r.ac1, 0.8584);
  assert.equal(r.categories, 2);
});

test('AC1 by hand on a skewed table, and its edge cases', () => {
  // 8 yes/yes, 1 yes/no, 1 no/yes: pa 0.8, pi_yes 0.9, pe = 2 * 0.9 * 0.1 = 0.18, AC1 = 0.62 / 0.82 = 0.7561.
  const pairs = [...Array.from({ length: 8 }, () => [true, true]), [true, false], [false, true]];
  assert.equal(gwetAC1(pairs, [true, false]).ac1, 0.7561);
  assert.equal(cohenKappa(pairs).kappa, -0.1111, 'the kappa paradox on the same table');
  assert.equal(gwetAC1([], ['a', 'b']), null);
  assert.equal(gwetAC1([['a', 'a'], ['a', 'a']], ['a', 'b']).ac1, 1, 'full agreement on one value is 1 when the scale has two values');
  assert.equal(gwetAC1([['a', 'a']], ['a']), null, 'a one-value scale has no chance correction');
  // Three categories: q - 1 = 2 in the denominator of pe.
  const three = [['S', 'S'], ['S', 'N'], ['C', 'C'], ['N', 'N']];
  const pi = { S: 3 / 8, N: 3 / 8, C: 2 / 8 };
  const pe = (pi.S * (1 - pi.S) + pi.N * (1 - pi.N) + pi.C * (1 - pi.C)) / 2;
  assert.equal(gwetAC1(three, ['S', 'C', 'N']).ac1, Math.round(((0.75 - pe) / (1 - pe)) * 10_000) / 10_000);
});

// ── RQ1-B sheets ─────────────────────────────────────────────────────────────────────────────────────────────────

const change = (kind, before, after) => ({ kind, before, after });
const evaluation = {
  baselineDepth: 1, hasReference: true,
  snapshots: ['s1', 's2', 's3'].map((id, i) => ({ snapshotId: id, snapshot: { hash: `h${i}`, title: id, date: `2026-10-0${i + 1}T00:00:00Z` }, files: 10, components: { recovered: 2, baseline: 2 } })),
  steps: [
    { from: 's1', to: 's2', recovered: { stability: { score: 90 }, changes: [change('split', ['Core'], ['A', 'B'])] }, baseline: { stability: { score: 100 }, changes: [] } },
    { from: 's2', to: 's3', recovered: { stability: { score: 90 }, changes: [change('added', [], ['Jobs'])] }, baseline: { stability: { score: 100 }, changes: [change('added', [], ['jobs'])] } },
  ],
};
const sheetFor = (annotator) => buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation, null, { annotator });

test('validateLabelSheet: pending pairs, invalid values and sheet/key mismatches are reported', () => {
  const { sheet, key } = sheetFor('an');
  const fresh = validateLabelSheet(sheet, key);
  assert.equal(fresh.filter(p => p.severity === 'error').length, 0);
  assert.ok(fresh.some(p => /2 of 2 pairs are not fully labelled/.test(p.message)));

  sheet.pairs[0].trueChanges = -1;
  sheet.pairs[0].changes[0].verdict = 'maybe';
  sheet.pairs[1].changes.push({ key: 'cdeadbeef', kind: 'added', before: [], after: [{ name: 'X' }], verdict: null });
  const errors = validateLabelSheet(sheet, key).filter(p => p.severity === 'error').map(p => p.message);
  assert.ok(errors.some(m => /trueChanges must be a whole number/.test(m)));
  assert.ok(errors.some(m => /verdict must be "correct" or "wrong"/.test(m)));
  assert.ok(errors.some(m => /cdeadbeef is not in the key/.test(m)));
  assert.ok(validateLabelSheet(sheet, { ...key, projectId: 'other' }).some(p => /The key is for project other/.test(p.message)));
});

test('validateLabelSheet warns when one grouping has more correct changes than trueChanges', () => {
  const { sheet, key } = sheetFor('an');
  sheet.pairs[1].trueChanges = 0;
  for (const c of sheet.pairs[1].changes) c.verdict = 'correct';
  assert.ok(validateLabelSheet(sheet, key).some(p => p.severity === 'warning' && /trueChanges is 0/.test(p.message)));
});

test('labelDisagreements lists every value both annotators gave differently; agreement carries AC1', () => {
  const a = sheetFor('an').sheet, b = sheetFor('binh').sheet;
  a.pairs[0].trueChanges = 1; b.pairs[0].trueChanges = 2;
  a.pairs[0].changes[0].verdict = 'correct'; b.pairs[0].changes[0].verdict = 'wrong';
  a.pairs[1].trueChanges = 1; b.pairs[1].trueChanges = 1;
  for (const c of a.pairs[1].changes) c.verdict = 'correct';
  for (const c of b.pairs[1].changes) c.verdict = 'correct';
  const rows = labelDisagreements(a, b);
  assert.deepEqual(rows.map(r => [r.from, r.field, r.a, r.b]), [['h0', 'trueChanges', '1', '2'], ['h0', 'verdict', 'correct', 'wrong']]);
  const ag = agreement(a, b);
  assert.equal(ag.verdicts.n, 3);
  assert.equal(ag.verdictsAC1.n, 3);
  assert.equal(typeof ag.verdictsAC1.ac1, 'number');
  assert.equal(ag.pooledVerdicts.length, 3);
});

test('scoreByProject gives the per-repository rows; the report prints them and the AC1 column', () => {
  const one = sheetFor(undefined), two = { ...sheetFor(undefined) };
  two.sheet = { ...structuredClone(one.sheet), projectName: 'Other' };
  for (const s of [one.sheet, two.sheet]) for (const p of s.pairs) { p.trueChanges = 1; for (const c of p.changes) c.verdict = 'correct'; }
  const entries = [{ sheet: one.sheet, key: one.key }, { sheet: two.sheet, key: one.key }];
  const per = scoreByProject(entries);
  assert.deepEqual(per.map(p => p.project), ['Demo', 'Other']);
  assert.equal(per[0].score.methods.recovered.f1, 1);
  const md = renderReport({
    generatedAt: 'x', methods: ['recovered', 'baseline'], projects: [], recovery: [], stability: [], detection: scoreLabels(entries), detectionByProject: per,
    agreement: [{ project: 'Demo', annotators: ['an', 'binh'], result: agreement(one.sheet, two.sheet) }],
  });
  assert.match(md, /Per project \(reconciled sheets\)/);
  assert.match(md, /\| Other \| ArchTime \(recovered\) \| 2 \|/);
  assert.match(md, /Gwet's AC1/);
  assert.match(md, /All projects pooled: 3 verdicts/);
});

// ── RQ1-A: primary method, Holm, aggregation ──────────────────────────────────────────────────────────────────────

const rows = (project, anchored, recovered, baseline) => anchored.map((x, i) => ({
  project, snapshot: `${project}${i}`, date: '', generator: '', files: 1, referenceFiles: 1,
  anchoredVsReference: x, recoveredVsReference: recovered[i], baselineVsReference: baseline[i],
}));

test('recoveryTests can test the frozen method (anchored) against each grouping, with Holm over the projects', () => {
  const data = [
    ...rows('P', [80, 82, 84, 86, 88, 90], [70, 71, 72, 73, 74, 75], [50, 51, 53, 54, 56, 57]),
    ...rows('Q', [60, 61, 62, 63, 64, 66], [60, 61, 62, 63, 64, 65], [40, 42, 41, 45, 44, 46]),
  ];
  const tests = recoveryTests(data, ['recovered', 'anchored', 'baseline'], 'anchored');
  assert.deepEqual(tests.map(t => [t.project, t.primary, t.against]), [['P', 'anchored', 'recovered'], ['P', 'anchored', 'baseline'], ['Q', 'anchored', 'recovered'], ['Q', 'anchored', 'baseline']]);
  const pVsBaseline = tests.filter(t => t.against === 'baseline');
  const raw = pVsBaseline.map(t => wilcoxonSignedRank(data.filter(r => r.project === t.project).map(r => r.anchoredVsReference), data.filter(r => r.project === t.project).map(r => r.baselineVsReference)).p);
  assert.deepEqual(pVsBaseline.map(t => t.pHolm), holm(raw), 'Holm over the two projects of the same comparison');
  assert.equal(pVsBaseline[0].result.effect, 1);
  assert.equal(tests.find(t => t.project === 'Q' && t.against === 'recovered').result.n, 1, 'equal milestones are dropped (Wilcoxon zero differences)');
  assert.deepEqual(recoveryTests(data, ['recovered', 'anchored', 'baseline']).map(t => t.primary), ['recovered', 'recovered', 'recovered', 'recovered'], 'the default stays recovered');
});

test("aggregateMeans: the report's All row is milestone-weighted; the paper's Table 3 directory mean 56.2 is that one", () => {
  // Per-repository means as printed in the paper (Table 3), with the milestones of each repository (12, 11, 12, 12, 12).
  const table = [['outline', 59.8, 12], ['docusaurus', 33.1, 11], ['actual', 99.9, 12], ['react-admin', 44.7, 12], ['react-router', 41.5, 12]];
  const data = table.flatMap(([project, value, n]) => Array.from({ length: n }, (_, i) => ({ project, snapshot: `${project}${i}`, baselineVsReference: value })));
  const m = aggregateMeans(data, 'baseline');
  assert.equal(m.snapshots, 59);
  assert.equal(m.milestoneWeighted, 56.18, '3314.9 / 59, printed as 56.2');
  assert.equal(m.projectWeighted, 55.8, 'the unweighted mean of the five repository means');
});

// ── References ───────────────────────────────────────────────────────────────────────────────────────────────────

const files = ['app/components/a.ts', 'app/component/b.ts', 'server/x.ts', 'server/y.ts', 'shared/z.ts', 'docs/d.ts'];

test('referenceProblems: placeholders, missing responsibility/evidence, shared and shadowed prefixes, missing trailing slash', () => {
  const ref = parseReferenceFile({
    repo: 'demo', commit: 'abc1234', author: '<ten-nguoi-viet-B>', components: [
      { name: 'UI', responsibility: 'Screens.', evidence: ['README §UI'], prefixes: ['app/component'] },
      { name: 'Server', prefixes: ['server/'] },
      { name: 'Shadowed', responsibility: 'x', evidence: ['y'], prefixes: ['server/'] },
      { name: '<second component>', responsibility: '<...>', evidence: ['<...>'], prefixes: ['<...>'] },
    ],
  });
  const msgs = referenceProblems(ref, files);
  const errors = msgs.filter(p => p.severity === 'error').map(p => p.message);
  const warnings = msgs.filter(p => p.severity === 'warning').map(p => p.message);
  assert.ok(errors.some(m => /author is still a placeholder/.test(m)));
  assert.ok(errors.some(m => /"Server" has no responsibility/.test(m)));
  assert.ok(errors.some(m => /"Server" lists no evidence/.test(m)));
  assert.ok(errors.some(m => /Prefix "server\/" belongs to both "Server" and "Shadowed"/.test(m)));
  assert.ok(errors.some(m => /template placeholder/.test(m)));
  assert.ok(warnings.some(m => /prefix "app\/component" has no trailing "\/"/.test(m)));
  assert.ok(warnings.some(m => /4 components: the protocol asks for 5-15/.test(m)));
});

test('fileDisagreements: unmatched files and files in components that are not mutual best matches', () => {
  const a = parseReferenceFile({ repo: 'demo', commit: 'abc1234', author: 'A', components: [
    { name: 'UI', prefixes: ['app/'] }, { name: 'Back', prefixes: ['server/', 'shared/'] }] });
  const b = parseReferenceFile({ repo: 'demo', commit: 'abc1234', author: 'B', components: [
    { name: 'Front', prefixes: ['app/', 'shared/'] }, { name: 'API', prefixes: ['server/'] }, { name: 'Docs', prefixes: ['docs/'] }] });
  const rows = fileDisagreements(a, b, files);
  assert.deepEqual(rows, [
    { file: 'docs/d.ts', a: '', b: 'Docs', kind: 'only-in-B' },
    { file: 'shared/z.ts', a: 'Back', b: 'Front', kind: 'different-component' },
  ], 'UI~Front and Back~API are mutual best matches (renames produce no row)');
});

// ── Dominance sensitivity ────────────────────────────────────────────────────────────────────────────────────────

test('sensitivityRows: counts per threshold, verdicts reused only for identical changes, precision only when all are labelled', () => {
  const labels = buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation);
  for (const p of labels.sheet.pairs) { p.trueChanges = 1; for (const c of p.changes) c.verdict = c.kind === 'added' ? 'correct' : 'wrong'; }
  const looser = structuredClone(evaluation);
  looser.steps[0].recovered.changes = [change('split', ['Core'], ['A', 'B']), change('merged', ['X', 'Y'], ['XY']), change('kept', ['W'], ['W'])];
  looser.steps[0].recovered.changes[2].reason = 'regrouped';
  looser.steps[0].recovered.filesMoved = 2;
  const out = sensitivityRows('Demo', [{ dominance: 0.5, evaluation }, { dominance: 0.3, evaluation: looser }], labels);
  const frozen = out.find(r => r.dominance === 0.5 && r.method === 'recovered');
  assert.deepEqual([frozen.structural, frozen.labelled, frozen.correct, frozen.unlabelled, frozen.precision, frozen.recall], [2, 2, 1, 0, 0.5, 0.5]);
  const loose = out.find(r => r.dominance === 0.3 && r.method === 'recovered');
  assert.deepEqual([loose.structural, loose.merged, loose.regrouped, loose.filesMoved, loose.unlabelled, loose.precision], [3, 1, 1, 2, 1, null],
    'the merge only seen at 0.3 has no verdict, so no precision is claimed');
  assert.equal(sensitivityRows('Demo', [{ dominance: 0.5, evaluation }]).every(r => r.precision === null), true, 'no labels, no precision');
});

test('droppedMethods: a re-run without --anchored would drop the frozen method from the keys; the script refuses', () => {
  const key = { projectId: 'p1', methods: ['recovered', 'clustering', 'anchored', 'baseline'], pairs: [] };
  assert.deepEqual(droppedMethods(key, ['recovered', 'clustering', 'baseline']), ['anchored']);
  assert.deepEqual(droppedMethods(key, ['recovered', 'clustering', 'anchored', 'baseline']), []);
  assert.deepEqual(droppedMethods(null, ['recovered', 'baseline']), [], 'no earlier key: nothing to drop');
  const legacy = { projectId: 'p1', pairs: [{ from: 's1', to: 's2', changes: [{ key: 'c1', method: 'anchored', id: 'x' }] }] };
  assert.deepEqual(droppedMethods(legacy, ['recovered', 'baseline']), ['anchored'], 'keys without a methods list are read from their changes');
});
