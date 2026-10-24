import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMoves, matchComponents, trackLineages } from '../src/domain/architecture/matching.ts';

const files = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}/F${i}.java`);
const comp = (id, memberIds, name = id) => ({ id, name, memberIds });
const kinds = m => m.changes.map(c => `${c.kind}:${c.before.join('+')}>${c.after.join('+')}`);

test('a component that keeps its files is kept, and a new name makes it renamed', () => {
  const order = files('order', 5), pay = files('pay', 4);
  const m = matchComponents([comp('order', order, 'Orders'), comp('pay', pay, 'Payments')],
    [comp('orders-x', order, 'orders'), comp('billing', pay, 'Billing')]);
  assert.deepEqual(kinds(m), ['kept:order>orders-x', 'renamed:pay>billing']);
  assert.deepEqual(m.successor, { order: 'orders-x', pay: 'billing' });
  assert.equal(m.links[0].forward, 1);
  assert.equal(m.links[0].backward, 1);
  assert.deepEqual(m.links[0].shared, [...order].sort());
});

test('ids are not trusted: the same id over different files is not a match', () => {
  const m = matchComponents([comp('core', ['a/Alpha.java', 'a/Beta.java'])], [comp('core', ['b/Gamma.java', 'b/Delta.java'])]);
  assert.deepEqual(kinds(m), ['removed:core>', 'added:>core']);
  assert.equal(m.changes[0].reason, 'deleted');
  assert.equal(m.changes[1].reason, 'new-files');
});

test('one component spread over several is a split; the biggest part continues it', () => {
  const all = files('shop', 10);
  const m = matchComponents([comp('shop', all)], [comp('cart', all.slice(0, 3)), comp('catalog', all.slice(3, 10))]);
  assert.deepEqual(kinds(m), ['split:shop>cart+catalog']);
  assert.deepEqual(m.successor, { shop: 'catalog' });
});

test('several components gathered into one is a merge, including a small one absorbed by a big one', () => {
  const big = files('svc', 20), small = files('helper', 2);
  const m = matchComponents([comp('svc', big), comp('helper', small)], [comp('services', [...big, ...small])]);
  assert.deepEqual(kinds(m), ['merged:helper+svc>services']);
  assert.equal(m.links.find(l => l.before === 'helper').backward, 0.0909);
  assert.deepEqual(m.successor, { helper: null, svc: 'services' });
});

test('a few files changing component is not a structural change', () => {
  const a = files('a', 10), b = files('b', 30);
  const m = matchComponents([comp('a', a, 'A'), comp('b', b, 'B')], [comp('a2', a.slice(2), 'A'), comp('b2', [...b, ...a.slice(0, 2)], 'B')]);
  assert.deepEqual(kinds(m), ['kept:a>a2', 'kept:b>b2']);
  assert.ok(!m.links.some(l => l.before === 'a' && l.after === 'b2'));
});

test('a component whose files scatter with no clear destination is dissolved, and one assembled from scraps is added', () => {
  const a = files('a', 10), b = files('b', 10), c = files('c', 4);
  const m = matchComponents([comp('a', a), comp('b', b), comp('c', c)],
    [comp('a', [...a, c[0], c[1]]), comp('b', [...b, c[2]]), comp('mix', [c[3], ...files('new', 1)])]);
  const removed = m.changes.find(x => x.kind === 'removed');
  assert.deepEqual(removed, { kind: 'removed', before: ['c'], after: [], reason: 'dissolved' });
  assert.ok(m.changes.some(x => x.kind === 'kept' && x.before[0] === 'a'));
  assert.deepEqual(m.changes.find(x => x.after[0] === 'mix'), { kind: 'added', before: [], after: ['mix'], reason: 'assembled' });
});

test('a component split exactly in half has no majority successor', () => {
  const c = files('c', 4), a = files('a', 6), b = files('b', 6);
  const m = matchComponents([comp('c', c), comp('a', a), comp('b', b)], [comp('a', [...a, ...c.slice(0, 2)]), comp('b', [...b, ...c.slice(2)])]);
  assert.deepEqual(m.changes.find(x => x.before[0] === 'c'), { kind: 'removed', before: ['c'], after: [], reason: 'dissolved' });
});

test('many-to-many regrouping is reported as one restructuring', () => {
  // x splits into p and q, and y is folded into q as well.
  const x = files('x', 6), y = files('y', 2);
  const m = matchComponents([comp('x', x), comp('y', y)], [comp('p', x.slice(0, 3)), comp('q', [...x.slice(3), ...y])]);
  assert.deepEqual(kinds(m), ['restructured:x+y>p+q']);
});

test('a component that mostly gained new files still continues the one it grew from', () => {
  const core = files('core', 4);
  const m = matchComponents([comp('core', core, 'Core')], [comp('core', [...core, ...files('fresh', 12)], 'Core')]);
  assert.deepEqual(kinds(m), ['kept:core>core']);
  assert.equal(m.links[0].backward, 0.25);
});

test('a file that moved to another folder keeps linking its component', () => {
  const before = ['src/old/OrderService.java', 'src/old/OrderRepository.java', 'src/old/OrderController.java'];
  const after = ['src/orders/OrderService.java', 'src/orders/OrderRepository.java', 'src/orders/OrderController.java'];
  const m = matchComponents([comp('old', before)], [comp('orders', after)]);
  assert.deepEqual(kinds(m), ['renamed:old>orders']);
  assert.equal(m.files.moved, 3);
  assert.deepEqual(m.files, { common: 0, added: 0, removed: 0, moved: 3 });
  const off = matchComponents([comp('old', before)], [comp('orders', after)], { detectMoves: false });
  assert.deepEqual(kinds(off), ['removed:old>', 'added:>orders']);
});

test('moves are only inferred from unique, specific file names', () => {
  assert.deepEqual(detectMoves(['a/index.ts', 'a/Order.java'], ['b/index.ts', 'b/Order.java']), [{ from: 'a/Order.java', to: 'b/Order.java' }]);
  assert.deepEqual(detectMoves(['a/Order.java', 'c/Order.java'], ['b/Order.java']), []);
});

test('the result does not depend on input order', () => {
  const all = files('shop', 10), extra = files('x', 3);
  const before = [comp('shop', all), comp('x', extra)];
  const after = [comp('cart', all.slice(0, 4)), comp('catalog', all.slice(4)), comp('xx', extra)];
  const a = matchComponents(before, after);
  const b = matchComponents([...before].reverse().map(c => ({ ...c, memberIds: [...c.memberIds].reverse() })), [...after].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(a.summary, { kept: 0, renamed: 1, split: 1, merged: 0, restructured: 0, removed: 0, added: 0 });
});

test('lineages follow a component through renames and splits across snapshots', () => {
  const core = files('core', 8), web = files('web', 4);
  const { lineages, byComponent, steps } = trackLineages([
    { snapshotId: 's1', components: [comp('core', core, 'Core'), comp('web', web, 'Web')] },
    { snapshotId: 's2', components: [comp('domain', core, 'Domain'), comp('web', web, 'Web')] },
    { snapshotId: 's3', components: [comp('domain', core.slice(0, 6), 'Domain'), comp('infra', core.slice(6), 'Infra'), comp('web', web, 'Web')] },
  ]);
  assert.equal(steps.length, 2);
  assert.equal(byComponent.s3.domain, 's1:core');
  assert.equal(byComponent.s3.web, 's1:web');
  assert.equal(byComponent.s3.infra, 's3:infra');
  assert.deepEqual(lineages.find(l => l.id === 's1:core').members.map(m => m.name), ['Core', 'Domain', 'Domain']);
});
