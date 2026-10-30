import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLabelSheet, isLabelled, recoveryRows, renderReport, scoreLabels, stabilityRows, toCsv } from '../src/domain/evaluation/rq1.ts';

const change = (kind, before, after) => ({ kind, before, after });
const evaluation = {
  baselineDepth: 2,
  hasReference: true,
  snapshots: [
    { snapshotId: 's1', snapshot: { hash: 'aaa1111', title: 'one', date: '2026-10-01T10:00:00Z' }, files: 10, components: { recovered: 3, baseline: 2 },
      reference: { recovered: { score: 60, common: 8 }, baseline: { score: 70, common: 8 } } },
    { snapshotId: 's2', snapshot: { hash: 'bbb2222', title: 'two', date: '2026-10-02T10:00:00Z' }, files: 12, components: { recovered: 4, baseline: 2 },
      reference: { recovered: { score: 80, common: 9 }, baseline: { score: 70, common: 9 } } },
    { snapshotId: 's3', snapshot: { hash: 'ccc3333', title: 'three', date: '2026-10-03T10:00:00Z' }, files: 12, components: { recovered: 4, baseline: 2 } },
  ],
  steps: [
    { from: 's1', to: 's2',
      recovered: { stability: { score: 90 }, changes: [change('kept', ['Web'], ['Web']), change('split', ['Core'], ['Auth', 'Domain']), change('renamed', ['Db'], ['Data'])] },
      baseline: { stability: { score: 100 }, changes: [change('kept', ['src'], ['src'])] } },
    { from: 's2', to: 's3',
      recovered: { stability: { score: 70 }, changes: [change('added', [], ['Jobs']), change('merged', ['Auth', 'Domain'], ['Core'])] },
      baseline: { stability: { score: 100 }, changes: [change('added', [], ['jobs'])] } },
  ],
};

test('the label sheet lists only structural changes, per pair, with snapshot hashes', () => {
  const sheet = buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation);
  assert.equal(sheet.pairs.length, 2);
  assert.deepEqual(sheet.pairs[0].from, { id: 's1', hash: 'aaa1111', title: 'one', date: '2026-10-01' });
  assert.deepEqual(sheet.pairs[0].recovered.map(c => c.id), ['split:Core>Auth+Domain'], 'kept and renamed are not judged');
  assert.deepEqual(sheet.pairs[0].baseline, []);
  assert.equal(sheet.pairs[0].trueChanges, null);
  assert.equal(sheet.pairs[1].recovered.every(c => c.verdict === null), true);
  assert.match(sheet.instructions, /trueChanges/);
});

test('rebuilding a sheet keeps the labels already written for changes that still appear', () => {
  const first = buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation);
  first.pairs[0].trueChanges = 1;
  first.pairs[0].recovered[0].verdict = 'correct';
  first.pairs[0].recovered[0].note = 'auth moved out';
  first.pairs[1].recovered.push({ id: 'removed:Gone>', kind: 'removed', before: ['Gone'], after: [], verdict: 'wrong' });
  const again = buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation, first);
  assert.equal(again.pairs[0].trueChanges, 1);
  assert.deepEqual([again.pairs[0].recovered[0].verdict, again.pairs[0].recovered[0].note], ['correct', 'auth moved out']);
  assert.equal(again.pairs[1].recovered.some(c => c.id === 'removed:Gone>'), false, 'a change no longer reported is dropped');
});

test('precision, recall and F1 come from the labelled pairs only', () => {
  const sheet = buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation);
  // Pair 1: one real change, which the recovery found. Pair 2: one real change (Jobs added); the recovery also reports a
  // merge that did not happen; the baseline found the addition.
  sheet.pairs[0].trueChanges = 1;
  sheet.pairs[0].recovered[0].verdict = 'correct';
  sheet.pairs[1].trueChanges = 1;
  sheet.pairs[1].recovered.find(c => c.kind === 'added').verdict = 'correct';
  sheet.pairs[1].recovered.find(c => c.kind === 'merged').verdict = 'wrong';
  sheet.pairs[1].baseline[0].verdict = 'correct';
  assert.equal(sheet.pairs.every(isLabelled), true);
  const score = scoreLabels([sheet]);
  assert.deepEqual([score.labelledPairs, score.pendingPairs], [2, 0]);
  assert.deepEqual(score.tools.recovered, { detected: 3, correct: 2, truth: 2, precision: 0.6667, recall: 1, f1: 0.8 });
  assert.deepEqual(score.tools.baseline, { detected: 1, correct: 1, truth: 2, precision: 1, recall: 0.5, f1: 0.6667 });
});

test('unfinished pairs are pending, and contradictory labels are reported, not counted beyond the truth', () => {
  const sheet = buildLabelSheet({ id: 'p1', name: 'Demo' }, evaluation);
  sheet.pairs[0].trueChanges = 0;
  sheet.pairs[0].recovered[0].verdict = 'correct';
  const score = scoreLabels([sheet]);
  assert.deepEqual([score.labelledPairs, score.pendingPairs], [1, 1]);
  assert.equal(score.tools.recovered.correct, 0);
  assert.equal(score.tools.recovered.recall, null, 'no true changes, no recall');
  assert.match(score.problems[0], /1 correct changes but trueChanges is 0/);
});

test('recovery and stability tables, CSV and the report', () => {
  const rec = recoveryRows('Demo', evaluation);
  assert.deepEqual(rec.map(r => [r.snapshot, r.recoveredVsReference, r.baselineVsReference]), [['aaa1111', 60, 70], ['bbb2222', 80, 70], ['ccc3333', null, null]]);
  const stab = stabilityRows('Demo', evaluation);
  assert.deepEqual(stab.map(r => [r.from, r.recoveredChanges, r.baselineChanges]), [['aaa1111', 1, 0], ['bbb2222', 2, 1]]);
  assert.equal(toCsv([{ a: 'x,y', b: null, c: 'say "hi"' }]), 'a,b,c\n"x,y",,"say ""hi"""\n');
  const md = renderReport({ generatedAt: '2026-10-30', projects: [{ name: 'Demo', snapshots: 3, baselineDepth: 2, hasReference: true }], recovery: rec, stability: stab, detection: scoreLabels([]) });
  assert.match(md, /\| Demo \| 2 \| 70\.00 \| 70\.00 \| 1 of 2 \|/);
  assert.match(md, /0 pairs labelled, 0 still to label/);
  assert.match(md, /favours a grouping by folder/);
});
