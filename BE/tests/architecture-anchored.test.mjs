import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorOn, anchorSequence, modularity } from '../src/domain/architecture/anchored.ts';
import { evaluateEvolution } from '../src/domain/architecture/evaluation.ts';

const comp = (id, memberIds, name = id) => ({ id, name, memberIds });
const e = (source, target) => ({ source, target });
// Two dense groups joined by one edge.
const edges = [e('a1', 'a2'), e('a2', 'a3'), e('a1', 'a3'), e('b1', 'b2'), e('b2', 'b3'), e('b1', 'b3'), e('a3', 'b1')];

test('modularity is higher for the natural grouping and 0 without edges', () => {
  const good = new Map([['a1', 'A'], ['a2', 'A'], ['a3', 'A'], ['b1', 'B'], ['b2', 'B'], ['b3', 'B']]);
  const bad = new Map([['a1', 'A'], ['a2', 'B'], ['a3', 'A'], ['b1', 'B'], ['b2', 'A'], ['b3', 'B']]);
  assert.ok(modularity(edges, good) > modularity(edges, bad));
  assert.equal(modularity(edges, good), 0.3571);
  assert.equal(modularity([], good), 0);
});

test('a regrouping that is not clearly better is ignored: existing files keep their component', () => {
  const previous = [comp('A', ['a1', 'a2', 'a3'], 'Alpha'), comp('B', ['b1', 'b2', 'b3'], 'Beta')];
  // The fresh clustering moved a3 to the other group: slightly different, not better.
  const fresh = [comp('x', ['a1', 'a2']), comp('y', ['a3', 'b1', 'b2', 'b3'])];
  const r = anchorOn(previous, fresh, edges);
  assert.equal(r.chosen, 'anchored');
  assert.deepEqual(r.components, previous);
});

test('new files join the component most of their neighbours are in; isolated ones keep their fresh component', () => {
  const previous = [comp('A', ['a1', 'a2', 'a3'], 'Alpha'), comp('B', ['b1', 'b2', 'b3'], 'Beta')];
  const more = [...edges, e('a4', 'a1'), e('a4', 'a2'), e('a5', 'a4')];
  const fresh = [comp('x', ['a1', 'a2', 'a3', 'a4', 'a5']), comp('y', ['b1', 'b2', 'b3']), comp('z', ['lonely'], 'Tools')];
  const r = anchorOn(previous, fresh, more);
  assert.equal(r.chosen, 'anchored');
  assert.deepEqual(r.components.find(c => c.id === 'A').memberIds, ['a1', 'a2', 'a3', 'a4', 'a5'], 'a5 follows a4 in the next round');
  assert.deepEqual(r.components.find(c => c.id === 'new:z'), { id: 'new:z', name: 'Tools', memberIds: ['lonely'] });
});

test('a clearly better fresh grouping replaces the anchored one', () => {
  const previous = [comp('A', ['a1', 'b1']), comp('B', ['a2', 'b2']), comp('C', ['a3', 'b3'])];
  const fresh = [comp('x', ['a1', 'a2', 'a3']), comp('y', ['b1', 'b2', 'b3'])];
  const r = anchorOn(previous, fresh, edges);
  assert.equal(r.chosen, 'fresh');
  assert.ok(r.modularity.fresh > r.modularity.anchored);
  assert.deepEqual(r.components, fresh);
});

test('a sequence starts from the first grouping and the evaluation measures it as a variant', () => {
  const s1 = [comp('A', ['a1', 'a2', 'a3']), comp('B', ['b1', 'b2', 'b3'])];
  const s2 = [comp('x', ['a1', 'a2']), comp('y', ['a3', 'b1', 'b2', 'b3'])];
  const seq = anchorSequence([{ components: s1, edges }, { components: s2, edges }]);
  assert.deepEqual(seq.map(r => r.chosen), ['fresh', 'anchored']);
  const res = evaluateEvolution([
    { snapshotId: 's1', components: s1, variants: { anchored: seq[0].components } },
    { snapshotId: 's2', components: s2, variants: { anchored: seq[1].components } },
  ], { reference: [{ name: 'Alpha', prefixes: ['a'] }, { name: 'Beta', prefixes: ['b'] }], withFiles: true });
  assert.equal(res.steps[0].variants.anchored.stability.score, 100, 'anchoring removed the regrouping noise');
  assert.equal(res.steps[0].variants.anchored.structural, 0);
  assert.ok(res.steps[0].recovered.stability.score < 100, 'the fresh grouping moved a file');
  assert.equal(res.snapshots[1].variants.anchored.reference.score, 100);
  assert.ok(res.steps[0].recovered.changes.every(c => Array.isArray(c.files.before) && Array.isArray(c.files.after)), 'member files listed with withFiles');
});
