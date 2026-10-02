import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveComponentEdges } from '../src/features/architecture/derive.ts';
import { validateView } from '../src/features/architecture/validate.ts';
import { FIXTURES, getFixture } from '../src/features/architecture/fixtures.ts';
import { cycles, reach, routes } from '../src/features/architecture/queries.ts';
import { parseHash, serializeHash } from '../src/features/architecture/url-state.ts';
import { layoutGraph } from '../src/features/architecture/layout.ts';
import { validateLayout } from '../src/features/architecture/layout-validate.ts';

const shop = getFixture('shophub').view;
const clone = () => structuredClone(shop);
const codes = (view, options) => validateView(view, options).issues.map(i => i.code);

test('component edges are derived only from cross-component class dependencies', () => {
  const edges = deriveComponentEdges({ 'a.X': 'a', 'a.Y': 'a', 'b.Z': 'b' }, [
    { source: 'a.X', target: 'b.Z', kind: 'calls', path: 'X.java', line: 3 },
    { source: 'a.Y', target: 'b.Z', kind: 'injects', path: 'Y.java', line: 1 },
    { source: 'a.X', target: 'a.Y', kind: 'calls', path: 'X.java' },
    { source: 'a.X', target: 'ghost.Q', kind: 'calls', path: 'X.java' },
    { source: 'b.Z', target: 'a.X', kind: 'imports', path: 'Z.java' },
  ]);
  assert.deepEqual(edges.map(e => [e.id, e.weight]), [['a->b', 2], ['b->a', 1]]);
  assert.deepEqual(edges[0].kinds, { calls: 1, injects: 1 });
  assert.equal(edges[0].evidence.length, 2);
});

test('every fixture passes the verifier and lays out cleanly', () => {
  for (const f of FIXTURES) {
    const result = validateView(f.view);
    assert.deepEqual(result.issues.filter(i => i.severity === 'error'), [], f.id);
    const nodes = f.view.components.map(c => ({ id: c.id, width: 196, height: 76, layer: c.layer }));
    const layout = layoutGraph(nodes, f.view.edges);
    assert.deepEqual(validateLayout(layout), [], f.id);
    assert.equal(layout.edges.length, f.view.edges.length);
  }
});

test('component count outside 8-15 is reported as a warning, not an error', () => {
  const issues = validateView(shop, { minComponents: 14 }).issues;
  assert.deepEqual(issues.map(i => [i.code, i.severity]), [['V002', 'warning']]);
  assert.equal(validateView(shop, { minComponents: 14 }).ok, true);
});

test('the verifier rejects a fabricated edge', () => {
  const v = clone();
  v.edges.push({ id: 'web->batch', source: 'web', target: 'batch', weight: 1, kinds: { calls: 1 }, evidence: [{ fromClass: 'web.OrderController', toClass: 'batch.CleanupJob', kind: 'calls', path: 'x.java' }] });
  assert.ok(codes(v).includes('V006'));
});

test('the verifier rejects wrong weights, missing evidence and self edges', () => {
  let v = clone(); v.edges[0].weight += 1;
  assert.ok(codes(v).includes('V007'));
  v = clone(); v.edges[0].evidence = [];
  assert.ok(codes(v).includes('V006'));
  v = clone(); v.edges.push({ id: 'web->web', source: 'web', target: 'web', weight: 0, kinds: {}, evidence: [] });
  assert.ok(codes(v).includes('V008'));
  v = clone(); v.edges.push({ ...structuredClone(v.edges[0]), id: 'dup' });
  assert.ok(codes(v).includes('V009'));
});

test('the verifier enforces one component per class', () => {
  let v = clone(); v.components[1].memberIds.push(v.components[0].memberIds[0]);
  assert.ok(codes(v).includes('V001'));
  v = clone(); v.components[0].memberIds.pop();
  assert.ok(codes(v).includes('V001'));
  v = clone(); v.components[0].memberIds.push('ghost.Class');
  assert.ok(codes(v).includes('V003'));
  v = clone(); v.components[0].memberIds = [];
  assert.ok(codes(v).includes('V004'));
  v = clone(); v.components[1].name = ` ${v.components[0].name.toUpperCase()}`;
  assert.ok(codes(v).includes('V005'));
});

test('malformed input is reported instead of throwing', () => {
  for (const bad of [null, 5, [], {}, { schemaVersion: 1, projectId: 'p', snapshotId: 's', title: 't', components: 'x', edges: [], classes: [], classEdges: [] }]) {
    const result = validateView(bad);
    assert.equal(result.ok, false);
    assert.ok(result.issues.every(i => i.code === 'S001'));
  }
  const v = clone(); v.components[0].role = 'wizard'; v.components[1].label = 'MAYBE';
  assert.equal(validateView(v).issues.filter(i => i.code === 'S001').length, 2);
});

test('reach follows dependencies in both directions', () => {
  const edges = shop.edges;
  const down = reach(edges, 'web', 'downstream');
  assert.ok(down.nodes.has('persistence') && down.nodes.has('gateway'));
  const up = reach(edges, 'persistence', 'upstream');
  assert.ok(up.nodes.has('web') && !up.nodes.has('gateway'));
  assert.deepEqual([...reach(edges, 'ghost', 'upstream').nodes], ['ghost']);
});

test('routes list simple paths, shortest first, and respect limits', () => {
  const r = routes(shop.edges, 'web', 'payment');
  assert.ok(r.length > 1);
  assert.ok(r[0].edges.length <= r[1].edges.length);
  assert.ok(r.every(route => new Set(route.nodes).size === route.nodes.length), 'no repeated nodes');
  assert.deepEqual(routes(shop.edges, 'web', 'web'), []);
  assert.deepEqual(routes(shop.edges, 'persistence', 'web'), []);
  assert.equal(routes(shop.edges, 'web', 'persistence', { maxRoutes: 2 }).length, 2);
});

test('cycles reports the groups of mutually dependent components', () => {
  const groups = cycles(shop.edges);
  assert.ok(groups.some(g => g.includes('order') && g.includes('payment')));
  assert.ok(groups.some(g => g.includes('customer') && g.includes('notification')));
  assert.deepEqual(cycles(getFixture('ledger').view.edges.filter(e => e.id !== 'transfers->accounts' && e.id !== 'accounts->transfers')), []);
});

test('hash state round-trips and drops anything unknown', () => {
  const state = { view: 'shophub', focus: 'order', reach: 'upstream', route: ['web', 'payment'], lens: ['service', 'controller'], detail: 'order', edge: 'web->order' };
  assert.deepEqual(parseHash(serializeHash(state)), state);
  const known = { views: new Set(['shophub']), components: new Set(['web', 'order']), edges: new Set(['web->order']) };
  assert.deepEqual(parseHash('#view=nope&focus=ghost&reach=upstream&route=web~ghost&lens=wizard&detail=ghost&edge=x', known), {});
  assert.deepEqual(parseHash('#focus=web&reach=sideways', known), { focus: 'web' });
  assert.deepEqual(parseHash('#reach=upstream'), {});
  assert.deepEqual(parseHash('#route=web~web'), {});
  assert.equal(serializeHash({}), '');
});
