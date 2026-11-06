import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agreement, buildLabelSheet, isLabelled, methodsOf, reconcile, recoveryRows, recoveryTests, renderReport, scoreLabels, spreadEvenly,
  stabilityRows, toCsv, workspaceSlug,
} from '../src/domain/evaluation/rq1.ts';

const change = (kind, before, after, files) => ({ kind, before, after, ...(files ? { files } : {}) });
const evaluation = {
  baselineDepth: 2,
  hasReference: true,
  snapshots: [
    { snapshotId: 's1', snapshot: { hash: 'aaa1111', title: 'one', date: '2026-10-01T10:00:00Z' }, generator: 'cluster-only', files: 10,
      components: { recovered: 3, baseline: 2 },
      reference: { recovered: { score: 60, common: 8 }, baseline: { score: 70, common: 8 } },
      variants: { clustering: { components: 3, reference: { score: 55, common: 8 } } } },
    { snapshotId: 's2', snapshot: { hash: 'bbb2222', title: 'two', date: '2026-10-02T10:00:00Z' }, generator: 'cluster-only', files: 12,
      components: { recovered: 4, baseline: 2 },
      reference: { recovered: { score: 80, common: 9 }, baseline: { score: 70, common: 9 } },
      variants: { clustering: { components: 4, reference: { score: 75, common: 9 } } } },
    { snapshotId: 's3', snapshot: { hash: 'ccc3333', title: 'three', date: '2026-10-03T10:00:00Z' }, generator: 'cluster-only', files: 12,
      components: { recovered: 4, baseline: 2 }, variants: { clustering: { components: 4, reference: null } } },
  ],
  steps: [
    { from: 's1', to: 's2',
      recovered: { stability: { score: 90 }, changes: [change('kept', ['Web'], ['Web']), change('split', ['Core'], ['Auth', 'Domain'], { before: [['a', 'b', 'c']], after: [['a'], ['b', 'c']] }), change('renamed', ['Db'], ['Data'])] },
      baseline: { stability: { score: 100 }, changes: [change('kept', ['src'], ['src'])] },
      variants: { clustering: { stability: { score: 80 }, changes: [change('merged', ['X', 'Y'], ['XY'])] } } },
    { from: 's2', to: 's3',
      recovered: { stability: { score: 70 }, changes: [change('added', [], ['Jobs']), change('merged', ['Auth', 'Domain'], ['Core'])] },
      baseline: { stability: { score: 100 }, changes: [change('added', [], ['jobs'])] },
      variants: { clustering: { stability: { score: 100 }, changes: [] } } },
  ],
};
const project = { id: 'p1', name: 'Demo' };
const methodOf = (key, pair, kind) => {
  const keyed = key.pairs.find(p => p.from === pair.from.id && p.to === pair.to.id);
  return Object.fromEntries(keyed.changes.map(c => [c.key, c.method]));
};

test('the methods of an evaluation come in report order, variants only when present', () => {
  assert.deepEqual(methodsOf(evaluation), ['recovered', 'clustering', 'baseline']);
  assert.deepEqual(methodsOf({ ...evaluation, snapshots: [], steps: [] }), ['recovered', 'baseline']);
});

test('the label sheet is blind: one shuffled list per pair, the method only in the key', () => {
  const { sheet, key } = buildLabelSheet(project, evaluation, null, { annotator: 'an', commits: { 's1>s2': [{ hash: 'b0', title: 'refactor auth', date: '2026-10-02' }] } });
  assert.equal(sheet.version, 2);
  assert.equal(sheet.annotator, 'an');
  assert.equal(sheet.pairs.length, 2);
  const [p1] = sheet.pairs;
  assert.deepEqual(p1.from, { id: 's1', hash: 'aaa1111', title: 'one', date: '2026-10-01' });
  assert.equal(p1.commits[0].title, 'refactor auth');
  assert.equal(p1.changes.length, 2, 'kept and renamed are not judged; split (recovered) and merged (clustering) are');
  assert.ok(p1.changes.every(c => /^c[0-9a-f]{8}$/.test(c.key) && !('method' in c)), 'nothing in the sheet names the method');
  assert.deepEqual([...p1.changes].map(c => c.key), [...p1.changes].map(c => c.key).sort(), 'ordered by key, not by method');
  const split = p1.changes.find(c => c.kind === 'split');
  assert.deepEqual(split.after, [{ name: 'Auth', files: 1, sample: ['a'] }, { name: 'Domain', files: 2, sample: ['b', 'c'] }]);
  const methods = methodOf(key, p1);
  assert.equal(methods[split.key], 'recovered');
  assert.equal(methods[p1.changes.find(c => c.kind === 'merged').key], 'clustering');
  assert.deepEqual(key.methods, ['recovered', 'clustering', 'baseline']);
  assert.equal(p1.trueChanges, null);
  assert.match(sheet.instructions, /FIRST read the commits/);
});

test('rebuilding keeps written labels, also from a version 1 sheet', () => {
  const { sheet: first } = buildLabelSheet(project, evaluation);
  first.pairs[0].trueChanges = 1;
  first.pairs[0].changes[0].verdict = 'correct';
  first.pairs[0].changes[0].note = 'auth moved out';
  const { sheet: again } = buildLabelSheet(project, evaluation, first);
  assert.equal(again.pairs[0].trueChanges, 1);
  assert.deepEqual([again.pairs[0].changes[0].verdict, again.pairs[0].changes[0].note], ['correct', 'auth moved out']);

  const legacy = { projectId: 'p1', projectName: 'Demo', instructions: '', pairs: [
    { from: { id: 's1', hash: 'aaa1111' }, to: { id: 's2', hash: 'bbb2222' }, trueChanges: 2, recovered: [{ id: 'split:Core>Auth+Domain', verdict: 'correct' }], baseline: [] },
  ] };
  const { sheet: migrated, key } = buildLabelSheet(project, evaluation, legacy);
  const methods = methodOf(key, migrated.pairs[0]);
  const split = migrated.pairs[0].changes.find(c => methods[c.key] === 'recovered');
  assert.equal(migrated.pairs[0].trueChanges, 2);
  assert.equal(split.verdict, 'correct');
});

function labelled() {
  const { sheet, key } = buildLabelSheet(project, evaluation);
  const [p1, p2] = sheet.pairs;
  const m1 = methodOf(key, p1), m2 = methodOf(key, p2);
  // Pair 1: one real change (the split), the clustering's merge is noise. Pair 2: one real change (Jobs added); the
  // recovery also reports a merge that did not happen; the baseline found the addition.
  p1.trueChanges = 1;
  for (const c of p1.changes) c.verdict = m1[c.key] === 'recovered' ? 'correct' : 'wrong';
  p2.trueChanges = 1;
  for (const c of p2.changes) c.verdict = c.kind === 'added' ? 'correct' : 'wrong';
  void m2;
  return { sheet, key };
}

test('precision, recall and F1 per method come from the labelled pairs', () => {
  const { sheet, key } = labelled();
  assert.equal(sheet.pairs.every(isLabelled), true);
  const score = scoreLabels([{ sheet, key }]);
  assert.deepEqual([score.labelledPairs, score.pendingPairs], [2, 0]);
  assert.deepEqual(score.methods.recovered, { detected: 3, correct: 2, truth: 2, precision: 0.6667, recall: 1, f1: 0.8 });
  assert.deepEqual(score.methods.baseline, { detected: 1, correct: 1, truth: 2, precision: 1, recall: 0.5, f1: 0.6667 });
  assert.deepEqual(score.methods.clustering, { detected: 1, correct: 0, truth: 2, precision: 0, recall: 0, f1: null });
});

test('unfinished pairs are pending, and contradictory labels are reported, not counted beyond the truth', () => {
  const { sheet, key } = buildLabelSheet(project, evaluation);
  sheet.pairs[0].trueChanges = 0;
  for (const c of sheet.pairs[0].changes) c.verdict = 'correct';
  const score = scoreLabels([{ sheet, key }]);
  assert.deepEqual([score.labelledPairs, score.pendingPairs], [1, 1]);
  assert.equal(score.methods.recovered.correct, 0);
  assert.equal(score.methods.recovered.recall, null, 'no true changes, no recall');
  assert.ok(score.problems.some(p => /recovered has 1 correct changes but trueChanges is 0/.test(p)));
});

test('agreement of two annotators, and reconciliation keeps only what they agree on', () => {
  const a = labelled().sheet;
  a.annotator = 'an';
  const b = structuredClone(a);
  b.annotator = 'binh';
  b.pairs[1].trueChanges = 2;
  b.pairs[0].changes[0].verdict = b.pairs[0].changes[0].verdict === 'correct' ? 'wrong' : 'correct';
  const ag = agreement(a, b);
  assert.equal(ag.pairs, 2);
  assert.equal(ag.trueChangesExact, 0.5);
  assert.equal(ag.trueChangesMeanDiff, 0.5);
  assert.equal(ag.verdicts.n, 5);
  assert.equal(ag.verdicts.agreement, 0.8);

  const { sheet, conflicts } = reconcile([a, b]);
  assert.equal(conflicts, 2);
  assert.equal(sheet.annotator, undefined);
  assert.equal(sheet.pairs[0].changes[0].verdict, null, 'a disagreement stays open');
  assert.equal(sheet.pairs[1].trueChanges, null);
  assert.match(sheet.pairs[1].note, /To settle: trueChanges: an=1, binh=2/);
  assert.equal(sheet.pairs[0].trueChanges, 1, 'agreed values are filled in');

  sheet.pairs[1].trueChanges = 1;
  const again = reconcile([a, b], sheet);
  assert.equal(again.sheet.pairs[1].trueChanges, 1, 'a value settled in the reconciled sheet is kept');
});

test('recovery and stability tables have one column set per method; the report tests and warns', () => {
  const rec = recoveryRows('Demo', evaluation);
  assert.deepEqual(rec.map(r => [r.snapshot, r.recoveredVsReference, r.clusteringVsReference, r.baselineVsReference]),
    [['aaa1111', 60, 55, 70], ['bbb2222', 80, 75, 70], ['ccc3333', null, null, null]]);
  const stab = stabilityRows('Demo', evaluation);
  assert.deepEqual(stab.map(r => [r.from, r.recoveredChanges, r.clusteringChanges, r.baselineChanges]), [['aaa1111', 1, 1, 0], ['bbb2222', 2, 0, 1]]);
  assert.equal(toCsv([{ a: 'x,y', b: null }, { a: 'z', c: 'say "hi"' }]), 'a,b,c\n"x,y",,\nz,,"say ""hi"""\n');
  const tests = recoveryTests(rec, ['recovered', 'clustering', 'baseline']);
  assert.deepEqual(tests.map(t => [t.against, t.result.n]), [['clustering', 2], ['baseline', 2]]);
  const { sheet, key } = labelled();
  const md = renderReport({
    generatedAt: '2026-11-07', methods: ['recovered', 'clustering', 'baseline'],
    projects: [{ name: 'Demo', snapshots: 3, baselineDepth: 2, hasReference: true, generators: ['cluster-only', 'cluster+llm'] }],
    recovery: rec, stability: stab, detection: scoreLabels([{ sheet, key }]),
    agreement: [{ project: 'Demo', annotators: ['an', 'binh'], result: agreement(sheet, sheet) }],
  });
  assert.match(md, /\| Demo \| 2 \| 70\.00 \| 65\.00 \| 70\.00 \| 1 of 2 \|/);
  assert.match(md, /Wilcoxon signed-rank/);
  assert.match(md, /\*\*Warning:\*\* Demo mix/);
  assert.match(md, /\| Clustering only \| 1 \| 0 \| 2 \| 0\.0% \| 0\.0% \| n\/a \|/);
  assert.match(md, /Cohen's kappa/);
});

test('milestones are spread evenly with both ends; workspace slugs are stable', () => {
  assert.deepEqual(spreadEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4), [1, 4, 7, 10]);
  assert.deepEqual(spreadEvenly([1, 2, 3], 5), [1, 2, 3]);
  assert.equal(workspaceSlug('ArchTime (main)', '6ac02d6c05de42f87e0eba04'), 'archtime-main-0eba04');
});
