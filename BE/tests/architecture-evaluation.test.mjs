import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEvolution, UNASSIGNED_COMPONENT } from '../src/domain/architecture/evaluation.ts';

const java = (dir, names) => names.map(n => `src/${dir}/${n}.java`);
const comp = (id, memberIds, name = id) => ({ id, name, memberIds });

// Folders: order/, user/, shared/. The recovered architecture groups by feature across folders.
const order = java('order', ['OrderService', 'OrderRepo', 'OrderController']);
const user = java('user', ['UserService', 'UserRepo']);
const shared = java('shared', ['Money', 'Clock']);

test('each snapshot is compared with the baseline and with the reference', () => {
  const res = evaluateEvolution(
    [{ snapshotId: 's1', components: [comp('orders', [...order, shared[0]]), comp('users', [...user, shared[1]])] }],
    { reference: [{ name: 'Orders', prefixes: ['src/order/'] }, { name: 'Users', prefixes: ['src/user/'] }], baseline: { depth: 1 } },
  );
  const [s] = res.snapshots;
  assert.equal(res.baselineDepth, 1);
  assert.deepEqual(s.components, { recovered: 2, baseline: 3 });
  assert.equal(s.files, 7);
  assert.ok(s.recoveredVsBaseline.score < 100);
  // The reference covers order/ and user/ only: both groupings agree with it on those files.
  assert.equal(s.reference.recovered.common, 5);
  assert.equal(s.reference.recovered.score, 100);
  assert.equal(s.reference.baseline.score, 100);
});

test('steps measure stability and structural changes for both groupings', () => {
  const res = evaluateEvolution([
    { snapshotId: 's1', components: [comp('orders', order), comp('users', user)] },
    // The recovery splits orders in two; folders do not change.
    { snapshotId: 's2', components: [comp('order-api', order.slice(2)), comp('order-core', order.slice(0, 2)), comp('users', user)] },
  ], { baseline: { depth: 1 } });
  const [step] = res.steps;
  assert.equal(step.recovered.summary.split, 1);
  assert.equal(step.recovered.structural, 1);
  assert.ok(step.recovered.stability.score < 100);
  assert.equal(step.baseline.structural, 0);
  assert.equal(step.baseline.stability.score, 100);
  assert.deepEqual(res.overall.structuralChanges, { recovered: 1, baseline: 0 });
  assert.equal(res.overall.stability.baseline, 100);
  assert.equal(res.overall.reference.recovered, null);
});

test('the unassigned bucket counts for MoJoFM but is not followed as a component', () => {
  const res = evaluateEvolution([
    { snapshotId: 's1', components: [comp('orders', order), comp('u', user, UNASSIGNED_COMPONENT)] },
    { snapshotId: 's2', components: [comp('orders', order), comp('u2', user, UNASSIGNED_COMPONENT)] },
  ], { baseline: { depth: 1 } });
  assert.equal(res.snapshots[0].components.recovered, 1);
  assert.equal(res.snapshots[0].files, 5);
  assert.deepEqual(res.steps[0].recovered.summary, { kept: 1, renamed: 0, split: 0, merged: 0, restructured: 0, removed: 0, added: 0 });
  assert.equal(res.steps[0].recovered.stability.score, 100);
});

test('the baseline depth is chosen once, on the latest snapshot, and kept for every snapshot', () => {
  const many = [];
  for (const area of ['a', 'b', 'c']) for (const mod of ['m1', 'm2', 'm3']) many.push(`src/${area}/${mod}/X.java`, `src/${area}/${mod}/Y.java`);
  const res = evaluateEvolution([
    { snapshotId: 's1', components: [comp('all', many.slice(0, 6))] },
    { snapshotId: 's2', components: [comp('all', many)] },
  ]);
  assert.equal(res.baselineDepth, 2);
  assert.equal(res.snapshots[0].components.baseline, 3);
  assert.equal(res.snapshots[1].components.baseline, 9);
});

test('no snapshots gives an empty evaluation', () => {
  const res = evaluateEvolution([]);
  assert.deepEqual(res.snapshots, []);
  assert.deepEqual(res.overall.stability, { recovered: null, baseline: null });
});
