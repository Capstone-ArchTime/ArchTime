import test from 'node:test';
import assert from 'node:assert/strict';
import { evolutionAt, historyOf, parseLineage } from '../src/features/architecture/evolution.ts';

// Three snapshots as GET /architecture/lineage answers them (BE ArchitectureService.lineage): Shop splits into Catalog and
// Cart, Users is renamed Accounts, Search is added, and Legacy is removed.
const lineage = parseLineage({
  snapshots: [
    { id: 's1', hash: 'aaaaaaa111', title: 'first', date: '2026-05-01T00:00:00.000Z' },
    { id: 's2', hash: 'bbbbbbb222', title: 'second', date: '2026-06-01T00:00:00.000Z' },
    { id: 's3', hash: 'ccccccc333', title: 'third', date: '2026-07-01T00:00:00.000Z' },
  ],
  lineages: [
    { id: 's1:shop', members: [{ snapshotId: 's1', componentId: 'shop', name: 'Shop' }, { snapshotId: 's2', componentId: 'shop', name: 'Shop' }, { snapshotId: 's3', componentId: 'catalog', name: 'Catalog' }] },
    { id: 's1:users', members: [{ snapshotId: 's1', componentId: 'users', name: 'Users' }, { snapshotId: 's2', componentId: 'accounts', name: 'Accounts' }, { snapshotId: 's3', componentId: 'accounts', name: 'Accounts' }] },
    { id: 's1:legacy', members: [{ snapshotId: 's1', componentId: 'legacy', name: 'Legacy' }] },
    { id: 's3:cart', members: [{ snapshotId: 's3', componentId: 'cart', name: 'Cart' }] },
    { id: 's3:search', members: [{ snapshotId: 's3', componentId: 'search', name: 'Search' }] },
  ],
  byComponent: {
    s1: { shop: 's1:shop', users: 's1:users', legacy: 's1:legacy' },
    s2: { shop: 's1:shop', accounts: 's1:users' },
    s3: { catalog: 's1:shop', cart: 's3:cart', accounts: 's1:users', search: 's3:search' },
  },
  steps: [
    { from: 's1', to: 's2', changes: [
      { kind: 'kept', before: ['shop'], after: ['shop'] },
      { kind: 'renamed', before: ['users'], after: ['accounts'] },
      { kind: 'removed', before: ['legacy'], after: [], reason: 'deleted' },
    ] },
    { from: 's2', to: 's3', changes: [
      { kind: 'split', before: ['shop'], after: ['cart', 'catalog'] },
      { kind: 'kept', before: ['accounts'], after: ['accounts'] },
      { kind: 'added', before: [], after: ['search'], reason: 'new-files' },
      { kind: 'bogus', before: [], after: [] },
    ] },
  ],
});

test('the components of a snapshot are marked against the previous snapshot with components', () => {
  const e = evolutionAt(lineage, 's3');
  assert.equal(e.previous.hash, 'bbbbbbb222');
  assert.deepEqual(Object.fromEntries(Object.entries(e.marks).map(([id, m]) => [id, `${m.label} from ${m.from.join('+')}`])), {
    cart: 'SPLIT from Shop', catalog: 'SPLIT from Shop', search: 'NEW from ',
  });
  assert.equal(e.marks.accounts, undefined, 'a kept component carries no mark');
  assert.deepEqual(e.items.map(i => i.text), ['Shop split into Cart and Catalog', 'Search added']);
  assert.deepEqual(e.counts, { split: 1, added: 1 }, 'an unknown kind from the server is dropped');
});

test('a rename and a removal are told with the names of both snapshots', () => {
  const e = evolutionAt(lineage, 's2');
  assert.equal(e.marks.accounts.label, 'RENAMED');
  assert.deepEqual(e.marks.accounts.from, ['Users']);
  assert.deepEqual(e.items.map(i => [i.kind, i.text, i.componentIds]), [
    ['renamed', 'Users renamed to Accounts', ['accounts']],
    ['removed', 'Legacy removed: its files were deleted', []],
  ]);
});

test('the first snapshot has nothing to compare with; a snapshot the lineage does not cover gets nothing', () => {
  assert.deepEqual(evolutionAt(lineage, 's1'), { previous: null, marks: {}, items: [], counts: {} });
  assert.equal(evolutionAt(lineage, 'unmapped'), null);
  assert.equal(evolutionAt(null, 's3'), null);
  assert.equal(evolutionAt(lineage, undefined), null);
});

test("a component's history lists its names through the snapshots, up to the one viewed", () => {
  assert.deepEqual(historyOf(lineage, 's3', 'catalog').map(h => `${h.snapshot.hash.slice(0, 7)} ${h.name}`), ['aaaaaaa Shop', 'bbbbbbb Shop', 'ccccccc Catalog']);
  assert.deepEqual(historyOf(lineage, 's2', 'shop').map(h => h.name), ['Shop', 'Shop'], 'later snapshots are not shown');
  assert.deepEqual(historyOf(lineage, 's3', 'cart').map(h => h.name), ['Cart']);
  assert.deepEqual(historyOf(lineage, 's3', 'unknown'), []);
});

test('a malformed answer is read as an empty lineage, not a crash', () => {
  assert.deepEqual(parseLineage(null), { snapshots: [], lineages: [], byComponent: {}, steps: [] });
  assert.deepEqual(parseLineage({ snapshots: [{ hash: 'no id' }], steps: [{ from: 's1' }], byComponent: { s1: { a: 3 } } }), { snapshots: [], lineages: [], byComponent: { s1: {} }, steps: [] });
});

test('an evolution mark is drawn on its component card, with a readable label for screen readers', async () => {
  await import('./register-tsx.mjs');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { getFixture } = await import('../src/features/architecture/fixtures.ts');
  const { componentScene } = await import('../src/features/architecture/scene.ts');
  const { layoutGraph } = await import('../src/features/architecture/layout.ts');
  const { THEMES } = await import('../src/features/architecture/theme.ts');
  const { default: DiagramSvg } = await import('../src/components/architecture/DiagramSvg.tsx');
  const scene = componentScene(getFixture('ledger').view);
  const layout = layoutGraph(scene.nodes.map(n => ({ id: n.id, width: n.width, height: n.height, layer: n.layer })), scene.edges);
  const first = scene.nodes[0];
  const render = marks => renderToStaticMarkup(createElement(DiagramSvg, { scene, layout, theme: THEMES.dark, title: 'Ledger', marks }));

  const svg = render({ [first.id]: { label: 'SPLIT', color: '#fbbf24', from: ['Shop'] } });
  assert.match(svg, />SPLIT<\/text>/);
  assert.match(svg, /Split since the previous snapshot \(from Shop\)\./);
  assert.equal((svg.match(/>SPLIT<\/text>/g) ?? []).length, 1, 'only the marked component');
  assert.doesNotMatch(render(undefined), /since the previous snapshot/);
});
