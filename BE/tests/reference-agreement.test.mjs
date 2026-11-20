import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReferences, parseReferenceFile, renderAgreement, ReferenceFileError } from '../src/domain/evaluation/referenceAgreement.ts';

// T1 / T6 (RF-24, RQ1 protocol §2.3): two references written independently are compared with the MoJoFM ArchTime
// uses for RQ1 (mojo.ts, checked against brute force in mojo.test.mjs), on the files both assign.

const files = ['src/a/one.ts', 'src/a/two.ts', 'src/b/one.ts', 'src/b/two.ts', 'scripts/x.ts'];
const ref = (author, components, extra = {}) => ({ repo: 'demo', commit: 'ABC123', author, components, ...extra });

test('identical references agree fully; files no prefix covers are left out of the score', () => {
  const comps = [{ name: 'A', prefixes: ['src/a/'] }, { name: 'B', prefixes: ['src/b/'] }];
  const r = compareReferences(parseReferenceFile(ref('ann', comps)), parseReferenceFile(ref('bao', comps)), files);
  assert.equal(r.common, 4);
  assert.equal(r.aToB.score, 100);
  assert.equal(r.bToA.score, 100);
  assert.equal(r.agreement, 100);
  assert.deepEqual([r.a.covered, r.a.total], [4, 5]);
  assert.deepEqual(r.splits, []);
});

test('one file placed differently: MoJoFM 50 both ways on four files (hand-computed), and the split is listed', () => {
  // A: {a1, a2} {b1, b2}; B: {a1, a2, b1} {b2}. One move either way; maxMno is 2 for both groupings -> 50.
  const a = parseReferenceFile(ref('ann', [{ name: 'A', prefixes: ['src/a/'] }, { name: 'B', prefixes: ['src/b/'] }]));
  const b = parseReferenceFile(ref('bao', [{ name: 'Core', prefixes: ['src/a/', 'src/b/one.ts'] }, { name: 'Edge', prefixes: ['src/b/two.ts'] }]));
  const r = compareReferences(a, b, files);
  assert.deepEqual([r.aToB.score, r.aToB.distance, r.bToA.score, r.bToA.distance], [50, 1, 50, 1]);
  assert.equal(r.agreement, 50);
  // Both directions: A's "B" is split over Core and Edge, and B's "Core" over A and B.
  assert.deepEqual(r.splits, [
    { from: 'A', component: 'B', into: [{ component: 'Core', files: 1 }, { component: 'Edge', files: 1 }] },
    { from: 'B', component: 'Core', into: [{ component: 'A', files: 2 }, { component: 'B', files: 1 }] },
  ]);
  const md = renderAgreement(r);
  assert.match(md, /Agreement \(lower direction\): 50\.00/);
  assert.match(md, /A "B" → Core \(1\), Edge \(1\)/);
});

test('a single file path is a valid prefix and wins over its folder (the most specific prefix)', () => {
  const a = parseReferenceFile(ref('ann', [{ name: 'A', prefixes: ['src/'] }, { name: 'Tool', prefixes: ['src/b/two.ts'] }]));
  const b = parseReferenceFile(ref('bao', [{ name: 'A', prefixes: ['src/'] }, { name: 'Tool', prefixes: ['src/b/two.ts'] }]));
  const r = compareReferences(a, b, files);
  assert.equal(r.agreement, 100);
  assert.equal(r.a.covered, 4);
});

test('prefixes matching no file are reported, so typos are fixed before the figure is used', () => {
  const a = parseReferenceFile(ref('ann', [{ name: 'A', prefixes: ['src/a/'] }, { name: 'B', prefixes: ['src/bee/'] }]));
  const b = parseReferenceFile(ref('bao', [{ name: 'A', prefixes: ['src/a/'] }, { name: 'B', prefixes: ['src/b/'] }]));
  assert.deepEqual(compareReferences(a, b, files).a.deadPrefixes, ['src/bee/']);
});

test('the protocol is enforced: same repository, same commit, two different authors, valid files', () => {
  const comps = [{ name: 'A', prefixes: ['src/a/'] }, { name: 'B', prefixes: ['src/b/'] }];
  const ok = parseReferenceFile(ref('ann', comps));
  assert.throws(() => compareReferences(ok, parseReferenceFile(ref('ANN', comps)), files), /two independent authors/);
  assert.throws(() => compareReferences(ok, parseReferenceFile(ref('bao', comps, { commit: 'def456' })), files), /different commits/);
  assert.throws(() => compareReferences(ok, parseReferenceFile(ref('bao', comps, { repo: 'other' })), files), /different repositories/);
  assert.throws(() => parseReferenceFile(ref('x', [{ name: 'A', prefixes: ['src/'] }])), ReferenceFileError);
  assert.throws(() => parseReferenceFile(ref('x', [{ name: 'A', prefixes: [] }, { name: 'B', prefixes: ['b'] }])), /at least one path prefix/);
  assert.throws(() => parseReferenceFile(ref('x', [{ name: 'A', prefixes: ['a'] }, { name: 'A', prefixes: ['b'] }])), /twice/);
  assert.throws(() => parseReferenceFile({ repo: 'demo', components: [] }), /"commit" is required/);
});

test('fewer than two common files: no agreement figure rather than a misleading one', () => {
  const a = parseReferenceFile(ref('ann', [{ name: 'A', prefixes: ['src/a/one.ts'] }, { name: 'B', prefixes: ['scripts/'] }]));
  const b = parseReferenceFile(ref('bao', [{ name: 'A', prefixes: ['src/a/one.ts'] }, { name: 'B', prefixes: ['src/b/'] }]));
  const r = compareReferences(a, b, files);
  assert.equal(r.agreement, null);
  assert.match(renderAgreement(r), /n\/a \(fewer than two common files\)/);
});
