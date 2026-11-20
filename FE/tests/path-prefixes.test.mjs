import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPathPrefixes, normalizePathPrefix, prefixOverlap, sameConfirmedContent } from '../src/features/path-prefixes.ts';
import { fromServer } from '../src/features/workspace-sync.ts';

test('prefixes are normalized like the server does and bad ones are explained', () => {
  assert.equal(normalizePathPrefix(' ./BE\\src\\billing/ '), 'BE/src/billing');
  assert.deepEqual(checkPathPrefixes(['src/a/', 'src/a', './src/b']), { prefixes: ['src/a', 'src/b'] });
  const refused = checkPathPrefixes(['src/a', '../etc']);
  assert.ok('error' in refused && refused.error.includes('"../etc"'));
});

test('a prefix another component already has is refused with MSG24; the component itself and nested prefixes are fine', () => {
  const others = [{ id: 'o', name: 'Orders', pathPrefixes: ['BE/src/orders'] }, { id: 'b', name: 'Billing', pathPrefixes: ['BE/src/billing'] }];
  assert.match(prefixOverlap('b', 'Billing', ['BE/src/orders'], others), /"BE\/src\/orders".*"Orders".*"Billing"/);
  assert.equal(prefixOverlap('b', 'Billing', ['BE/src/billing', 'BE/src/orders/legacy'], others), null);
  assert.equal(prefixOverlap(undefined, 'New', ['BE/src/new'], others), null);
});

test('mapping files does not change the confirmed content; editing a component does', () => {
  const base = { components: [{ id: 'a', name: 'A', kind: 'Service', description: '', pathPrefixes: [] }], dependencies: [{ source: 'a', target: 'a', label: 'x' }] };
  assert.ok(sameConfirmedContent(base, { ...base, components: [{ ...base.components[0], pathPrefixes: ['src/a'] }] }));
  assert.ok(!sameConfirmedContent(base, { ...base, components: [{ ...base.components[0], description: 'changed' }] }));
});

test('the workspace read keeps component prefixes and tolerates servers that do not send them', () => {
  const ws = fromServer({ revision: 2, diagram: { components: [{ id: 'a', name: 'A', kind: 'Service', description: '', pathPrefixes: ['src/a', 7] }, { id: 'b', name: 'B', kind: 'UI', description: '' }], dependencies: [] } });
  assert.deepEqual(ws.diagram.components.map(c => c.pathPrefixes), [['src/a'], []]);
});
