import test from 'node:test';
import assert from 'node:assert/strict';
import { issuesFor, planShow } from '../src/features/architecture/issues.ts';
import { panelLayout, resolvePanels } from '../src/features/architecture/panels.ts';
import { exportFileBase, slug } from '../src/features/architecture/export-file.ts';

// Boundary cases with literal numbers (not the THRESHOLDS constants), so moving a threshold fails a test.

const comp = (id, name, role, files = 4) => ({ id, name, role, label: 'FACT', description: '', memberIds: Array.from({ length: files }, (_, i) => `src/${id}/f${i}.ts`) });
const view = () => ({ components: [comp('web', 'Web API', 'controller'), comp('orders', 'Orders', 'service'), comp('store', 'Store', 'repository')], edges: [] });
const quality = (over = {}) => ({ grounding: { score: 1, ungrounded: [] }, acyclicity: { score: 1, cycles: [] }, layering: { score: 1, violations: [] }, balance: 0.95, components: 3, ...over });
const severities = (q, type) => issuesFor({ view: view(), quality: quality(q) }).filter(i => i.type === type).map(i => i.severity);

test('agreement with the reference: below 50% is high, below 80% medium, from 80% nothing', () => {
  const at = score => severities({ agreement: { score, common: 20 } }, 'deviation');
  assert.deepEqual(at(0.45), ['high']);
  assert.deepEqual(at(0.49), ['high']);
  assert.deepEqual(at(0.5), ['medium']);
  assert.deepEqual(at(0.79), ['medium']);
  assert.deepEqual(at(0.8), []);
  assert.deepEqual(at(0.85), []);
});

test('stability against the previous snapshot: below 50% medium, below 80% low, from 80% nothing', () => {
  const at = score => severities({ stability: { score, common: 20, snapshotId: 's0' } }, 'drift');
  assert.deepEqual(at(0.49), ['medium']);
  assert.deepEqual(at(0.5), ['low']);
  assert.deepEqual(at(0.79), ['low']);
  assert.deepEqual(at(0.8), []);
  assert.deepEqual(at(0.85), []);
});

test('balance: a component holding most files is reported below 50%, not at it', () => {
  const lopsided = { components: [comp('web', 'Web API', 'controller', 2), comp('orders', 'Orders', 'service', 40), comp('store', 'Store', 'repository', 2)], edges: [] };
  const at = balance => issuesFor({ view: lopsided, quality: quality({ balance }) }).filter(i => i.type === 'unbalanced').length;
  assert.equal(at(0.49), 1);
  assert.equal(at(0.5), 0);
  assert.equal(at(0.55), 0);
});

test('unsupported names: medium below 50% grounding, low from 50%', () => {
  const at = score => severities({ grounding: { score, ungrounded: ['Misc'] } }, 'ungrounded');
  assert.deepEqual(at(0.45), ['medium']);
  assert.deepEqual(at(0.49), ['medium']);
  assert.deepEqual(at(0.5), ['low']);
  assert.deepEqual(at(0.9), ['low']);
});

test('upward dependencies: high below 50% layering score, medium from 50%', () => {
  const v = { ...view(), edges: [{ id: 'store->web', source: 'store', target: 'web', weight: 2, kinds: {}, evidence: [] }] };
  const at = score => issuesFor({ view: v, quality: quality({ layering: { score, violations: [{ source: 'store', target: 'web', weight: 2 }] } }) })[0].severity;
  assert.equal(at(0.49), 'high');
  assert.equal(at(0.5), 'medium');
});

test('"Show in diagram": one edge between two components is an edge selection, with a third component it is a set', () => {
  assert.deepEqual(planShow({ components: ['a', 'b'], edges: ['a->b'] }), { kind: 'edge', id: 'a->b' });
  assert.deepEqual(planShow({ components: ['a', 'b', 'c'], edges: ['a->b'] }), { kind: 'set', nodes: ['a', 'b', 'c'], edges: ['a->b'] });
});

test('panels: exactly 1100px is the compact layout, 1099px a drawer', () => {
  assert.equal(panelLayout(1099), 'drawer');
  assert.equal(panelLayout(1100), 'compact');
  const at = width => resolvePanels({ width, focus: false, saved: {}, drawers: {} });
  assert.equal(at(1099).overlay, true);
  assert.equal(at(1100).overlay, false);
  assert.equal(at(1100).right, true);
});

test('file names: lower-case đ and Đ both become d', () => {
  assert.equal(slug('đồ án'), 'do-an');
  assert.equal(slug('Đồ án'), 'do-an');
  assert.equal(slug('ĐỒ ÁN'), 'do-an');
  assert.equal(exportFileBase({ workspace: 'đồ án', hash: 'a1b2c3d4', date: '2026-10-28' }, new Date('2026-10-30T00:00:00Z')), 'do-an-a1b2c3d-2026-10-28');
});
