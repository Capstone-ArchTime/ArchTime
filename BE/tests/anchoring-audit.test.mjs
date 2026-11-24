// Research audit (2026-11-24): behaviour of the anchored variant (the frozen test-set method) and of component matching
// in the situations the paper's claims depend on: a stable architecture, new, deleted and moved files, splits, merges,
// a major restructuring, and an incorrect earlier grouping that anchoring carries forward (architectural inertia).
// These tests document behaviour; they do not change the frozen parameters (tolerance 0.02, dominance 0.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorOn, anchorSequence, modularity, DEFAULT_ANCHOR_OPTIONS } from '../src/domain/architecture/anchored.ts';
import { matchComponents, EVIDENCE_RULE } from '../src/domain/architecture/matching.ts';
import { evaluateEvolution } from '../src/domain/architecture/evaluation.ts';

const clique = (names) => names.flatMap((a, i) => names.slice(i + 1).map(b => ({ source: a, target: b })));
const files = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}.ts`);
const comp = (id, memberIds, name = id) => ({ id, name, memberIds });
const ownerOf = (components, f) => components.find(c => c.memberIds.includes(f))?.id;
const A = files('a/a', 6), B = files('b/b', 6);
const baseEdges = [...clique(A), ...clique(B), { source: A[0], target: B[0] }];

test('stable architecture: the same grouping is carried over unchanged and matching reports only kept components', () => {
  const previous = [comp('core', A), comp('web', B)];
  const fresh = [comp('x1', A, 'Core'), comp('x2', B, 'Web')]; // re-clustered: other ids, other names, same files
  const r = anchorOn(previous, fresh, baseEdges);
  assert.equal(r.chosen, 'anchored');
  assert.deepEqual(r.components.map(c => [c.id, c.memberIds.length]), [['core', 6], ['web', 6]], 'ids and names of the earlier snapshot survive');
  const m = matchComponents(previous, r.components, { evidence: EVIDENCE_RULE });
  assert.deepEqual(m.changes.map(c => c.kind), ['kept', 'kept']);
});

test('new files join the component holding most of their placed neighbours; chains follow; isolated new files form a new component', () => {
  const n1 = 'a/new1.ts', n2 = 'a/new2.ts', lone1 = 'jobs/j1.ts', lone2 = 'jobs/j2.ts';
  const edges = [...baseEdges, { source: n1, target: A[1] }, { source: n1, target: A[2] }, { source: n1, target: B[3] }, { source: n2, target: n1 }, { source: lone1, target: lone2 }];
  const previous = [comp('core', A), comp('web', B)];
  const fresh = [comp('f1', [...A, n1, n2]), comp('f2', B), comp('f3', [lone1, lone2])];
  const r = anchorOn(previous, fresh, edges);
  assert.equal(r.chosen, 'anchored');
  assert.equal(ownerOf(r.components, n1), 'core', '2 neighbours in core against 1 in web');
  assert.equal(ownerOf(r.components, n2), 'core', 'placed in a later round through n1');
  assert.equal(ownerOf(r.components, lone1), 'new:f3', 'no placed neighbour: keeps its fresh component as a new one');
});

test('deleted files leave their component; a component that loses every file disappears', () => {
  const C = files('c/c', 3);
  const previous = [comp('core', A), comp('web', B), comp('legacy', C)];
  const fresh = [comp('f1', A.slice(0, 4)), comp('f2', B)];
  const r = anchorOn(previous, fresh, baseEdges.filter(e => !A.slice(4).includes(e.source) && !A.slice(4).includes(e.target)));
  assert.deepEqual(r.components.map(c => [c.id, c.memberIds.length]), [['core', 4], ['web', 6]]);
  const m = matchComponents(previous, r.components, { evidence: EVIDENCE_RULE });
  assert.deepEqual(m.changes.find(c => c.before.includes('legacy')), { kind: 'removed', before: ['legacy'], after: [], reason: 'deleted' });
});

test('a moved file is a new path to the anchored variant (placed by its neighbours); matching pairs it as a move by unique name', () => {
  const moved = 'b/renderer.ts';
  const previous = [comp('core', [...A, 'a/renderer.ts']), comp('web', B)];
  const edges = [...baseEdges, { source: moved, target: B[1] }, { source: moved, target: B[2] }];
  const fresh = [comp('f1', A), comp('f2', [...B, moved])];
  const r = anchorOn(previous, fresh, edges);
  assert.equal(ownerOf(r.components, moved), 'web', 'its old component is not remembered: the path is new');
  const m = matchComponents(previous, r.components);
  assert.deepEqual(m.moves, [{ from: 'a/renderer.ts', to: moved }]);
  assert.equal(m.files.moved, 1);
});

test('a genuine split is surfaced only when the whole fresh grouping wins by more than the tolerance (all or nothing)', () => {
  // Core is really two sub-systems joined by one edge; the earlier grouping had them together.
  const L = files('a/l', 5), R = files('a/r', 5);
  const edges = [...clique(L), ...clique(R), { source: L[0], target: R[0] }, ...clique(B), { source: L[1], target: B[0] }];
  const previous = [comp('core', [...L, ...R]), comp('web', B)];
  const fresh = [comp('left', L), comp('right', R), comp('web2', B)];
  const r = anchorOn(previous, fresh, edges);
  assert.ok(r.modularity.fresh - r.modularity.anchored > DEFAULT_ANCHOR_OPTIONS.tolerance);
  assert.equal(r.chosen, 'fresh');
  const m = matchComponents(previous, r.components, { evidence: EVIDENCE_RULE });
  // No file was added, deleted or moved: the evidence rule reports the regrouping as kept/regrouped, not as a split.
  assert.deepEqual(m.changes.find(c => c.before.includes('core')), { kind: 'kept', before: ['core'], after: ['left', 'right'], reason: 'regrouped' });
  assert.equal(matchComponents(previous, r.components).changes.find(c => c.before.includes('core')).kind, 'split', 'without the evidence rule it is a split');
});

test('a merge of two components that grew together, with new files as evidence, is reported as merged', () => {
  const C = files('c/c', 5), glue = files('g/glue', 3);
  const edges = [...clique([...A, ...C, ...glue]), ...clique(B)];
  const previous = [comp('core', A), comp('cache', C), comp('web', B)];
  const fresh = [comp('core2', [...A, ...C, ...glue]), comp('web2', B)];
  const r = anchorOn(previous, fresh, edges);
  assert.equal(r.chosen, 'fresh', 'one dense block: the merged grouping is clearly more modular');
  const m = matchComponents(previous, r.components, { evidence: EVIDENCE_RULE });
  assert.equal(m.changes.find(c => c.after.includes('core2')).kind, 'merged');
});

test('major restructuring: an earlier grouping that no longer fits is replaced by the fresh one', () => {
  const mixed = [comp('p', [...A.slice(0, 3), ...B.slice(0, 3)]), comp('q', [...A.slice(3), ...B.slice(3)])];
  const fresh = [comp('core', A), comp('web', B)];
  const r = anchorOn(mixed, fresh, baseEdges);
  assert.equal(r.chosen, 'fresh');
  assert.ok(r.modularity.fresh > r.modularity.anchored + 0.3);
});

test('inertia: an incorrect earlier assignment survives while the fresh grouping is better by no more than the tolerance', () => {
  // x has one dependency into A and two into B, so B is its better home; the earlier grouping put it in A.
  const x = 'shared/x.ts';
  const A10 = files('a/a', 10), B10 = files('b/b', 10);
  const edges = [...clique(A10), ...clique(B10), { source: A10[0], target: B10[0] }, { source: x, target: A10[2] }, { source: x, target: B10[2] }, { source: x, target: B10[3] }];
  const previous = [comp('core', [...A10, x]), comp('web', B10)];
  const fresh = [comp('f1', A10), comp('f2', [...B10, x])];
  const gain = modularity(edges, new Map(fresh.flatMap(c => c.memberIds.map(f => [f, c.id])))) - modularity(edges, new Map(previous.flatMap(c => c.memberIds.map(f => [f, c.id]))));
  assert.ok(gain > 0 && gain <= DEFAULT_ANCHOR_OPTIONS.tolerance, `the better grouping gains ${gain}, within the tolerance`);
  const r = anchorOn(previous, fresh, edges);
  assert.equal(r.chosen, 'anchored');
  assert.equal(ownerOf(r.components, x), 'core', 'the wrong boundary is carried forward');
  // It is carried forward for as long as no single step gains more than the tolerance: over a whole sequence too.
  const seq = anchorSequence([{ components: previous, edges }, { components: fresh, edges }, { components: fresh, edges }]);
  assert.deepEqual(seq.map(s => ownerOf(s.components, x)), ['core', 'core', 'core']);
  assert.equal(anchorOn(previous, fresh, edges, { tolerance: 0 }).chosen, 'fresh', 'with tolerance 0 the better grouping wins');
});

test('dominance threshold: 0.3 links a 40/60 split to both parts, 0.5 to the majority, 0.7 to neither (dissolved)', () => {
  const before = [comp('core', files('s/f', 10))];
  const after = [comp('big', files('s/f', 10).slice(0, 6)), comp('small', files('s/f', 10).slice(6))];
  const kinds = d => matchComponents(before, after, { dominance: d }).changes.map(c => `${c.kind}:${c.before.join('+')}>${c.after.join('+')}`).sort();
  // Every file of both later components came from core, so the backward share (1.0) links both at every threshold here.
  assert.deepEqual(kinds(0.3), ['split:core>big+small']);
  assert.deepEqual(kinds(0.7), ['split:core>big+small']);
  // With new files diluting the later components the backward share drops and the threshold decides.
  const diluted = [comp('big', [...files('s/f', 10).slice(0, 6), ...files('n/n', 6)]), comp('small', [...files('s/f', 10).slice(6), ...files('m/m', 6)])];
  const k = d => matchComponents(before, diluted, { dominance: d }).changes.map(c => c.kind).sort();
  assert.deepEqual(k(0.3), ['split'], 'forward 0.6 and 0.4 both pass 0.3');
  assert.deepEqual(k(0.5), ['added', 'renamed'], 'only the 60 % part passes 0.5: it continues core (under a new name), the other part is added');
  assert.deepEqual(k(0.7), ['added', 'added', 'removed'], 'no part passes 0.7: core dissolves');
});

test('evaluateEvolution takes the dominance threshold and leaves the default (0.5) unchanged', () => {
  const s1 = { snapshotId: 's1', components: [comp('core', files('s/f', 10))] };
  const s2 = { snapshotId: 's2', components: [comp('big', [...files('s/f', 10).slice(0, 6), ...files('n/n', 6)]), comp('small', [...files('s/f', 10).slice(6), ...files('m/m', 6)])] };
  const kinds = (options) => evaluateEvolution([s1, s2], { evidence: null, ...options }).steps[0].recovered.changes.map(c => c.kind).sort();
  assert.deepEqual(kinds({}), kinds({ dominance: 0.5 }));
  assert.deepEqual(kinds({ dominance: 0.3 }), ['split']);
  assert.equal(evaluateEvolution([s1, s2]).steps[0].recovered.filesMoved, 0);
});
