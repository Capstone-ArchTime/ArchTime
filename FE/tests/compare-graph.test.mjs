import test from 'node:test';
import assert from 'node:assert/strict';
import { OTHER, buildCompareGraph, chooseDepth, compareFiles, fileEdges, filesOfGroup, folderOf, resolveImport, shortLabel } from '../src/features/compare-graph.ts';

const snap = (files, edges = []) => ({ nodes: files.map(id => ({ id, name: id.split('/').pop(), type: 'ts' })), edges: edges.map(([source, target]) => ({ source, target, type: 'imports' })) });

test('imports are matched to files the way mining stores them (no extension, index files, .js for .ts)', () => {
  const files = new Set(['src/a.ts', 'src/lib/index.tsx', 'src/b.ts']);
  assert.equal(resolveImport(files, 'src/a'), 'src/a.ts');
  assert.equal(resolveImport(files, 'src/a.js'), 'src/a.ts');
  assert.equal(resolveImport(files, 'src/lib'), 'src/lib/index.tsx');
  assert.equal(resolveImport(files, 'react'), null);
  assert.deepEqual(fileEdges(snap(['src/a.ts', 'src/b.ts'], [['src/a.ts', 'src/b'], ['src/a.ts', 'src/b'], ['src/a.ts', 'lodash'], ['src/a.ts', 'src/a']])), [['src/a.ts', 'src/b.ts']], 'duplicates, packages and self imports are dropped');
});

test('files are grouped as deep as the folder tree allows without passing the limit', () => {
  assert.equal(folderOf('src/web/api/x.ts', 2), 'src/web');
  assert.equal(folderOf('README.md', 3), '(root)');
  const paths = ['src/web/a.ts', 'src/web/b.ts', 'src/orders/c.ts', 'src/billing/d.ts', 'tests/e.ts'];
  assert.equal(chooseDepth(paths, 16), 2, 'depth 1 gives only src and tests; depth 2 splits src');
  assert.equal(chooseDepth(paths, 2), 1);
  assert.equal(chooseDepth(['a/b/c/d/e.ts'], 16) >= 1, true);
});

test('a revision of 116 files in one folder no longer becomes one box per file', () => {
  const files = Array.from({ length: 116 }, (_, i) => `lib/f${i}.js`);
  const g = buildCompareGraph(snap([]), snap(files));
  assert.equal(g.groups.length, 1);
  assert.deepEqual(g.groups[0], { id: 'lib', label: 'lib', inBase: 0, inTarget: 116, added: 116, removed: 0, status: 'added' });
});

test('folders and the imports between them are marked added, removed, changed or unchanged', () => {
  const base = snap(['src/web/api.ts', 'src/orders/order.ts', 'src/old/legacy.ts', 'src/billing/invoice.ts'],
    [['src/web/api.ts', 'src/orders/order'], ['src/orders/order.ts', 'src/old/legacy'], ['src/billing/invoice.ts', 'src/orders/order']]);
  const target = snap(['src/web/api.ts', 'src/orders/order.ts', 'src/orders/cart.ts', 'src/pay/pay.ts', 'src/billing/invoice.ts'],
    [['src/web/api.ts', 'src/orders/order'], ['src/web/api.ts', 'src/orders/cart'], ['src/orders/order.ts', 'src/pay/pay'], ['src/billing/invoice.ts', 'src/orders/order']]);
  const g = buildCompareGraph(base, target);
  const status = Object.fromEntries(g.groups.map(x => [x.id, x.status]));
  assert.deepEqual(status, { 'src/billing': 'same', 'src/old': 'removed', 'src/orders': 'changed', 'src/pay': 'added', 'src/web': 'changed' });
  const links = Object.fromEntries(g.links.map(l => [l.id, `${l.status}:${l.base}/${l.target2}`]));
  assert.deepEqual(links, {
    'src/billing→src/orders': 'same:1/1',
    'src/orders→src/old': 'removed:1/0',
    'src/orders→src/pay': 'added:0/1',
    'src/web→src/orders': 'changed:1/2',
  });
  assert.equal(g.groups.find(x => x.id === 'src/orders').added, 1);
  assert.deepEqual(g.totals, { baseFiles: 4, targetFiles: 5 });
});

test('past the limit the smallest folders share one "other folders" box, listed last', () => {
  const files = Array.from({ length: 20 }, (_, i) => `pkg${i}/a.ts`).concat(['pkg0/b.ts', 'pkg0/c.ts']);
  const g = buildCompareGraph(snap(files), snap(files), 5);
  assert.equal(g.groups.length, 5);
  assert.equal(g.groups.at(-1).id, OTHER);
  assert.equal(g.groups.find(x => x.id === 'pkg0').inBase, 3);
  assert.equal(g.folded, 16);
  assert.equal(g.groups.reduce((n, x) => n + x.inBase, 0), 22, 'no file is lost');
});

test('missing or broken revisions give an empty drawing, not an error', () => {
  for (const s of [null, undefined, {}, { nodes: null, edges: null }, { nodes: [{ id: 3 }, {}], edges: [{}] }]) {
    const g = buildCompareGraph(s, s);
    assert.deepEqual(g.groups, []);
    assert.deepEqual(g.links, []);
  }
});

test('each file says what happened to it and to its imports, both ways', () => {
  const base = snap(['src/web/api.ts', 'src/orders/order.ts', 'src/old/legacy.ts'],
    [['src/web/api.ts', 'src/orders/order'], ['src/orders/order.ts', 'src/old/legacy']]);
  const target = snap(['src/web/api.ts', 'src/orders/order.ts', 'src/orders/cart.ts'],
    [['src/web/api.ts', 'src/orders/order'], ['src/web/api.ts', 'src/orders/cart']]);
  const g = buildCompareGraph(base, target);
  assert.equal(g.fileGroup['src/orders/cart.ts'], 'src/orders');
  const files = compareFiles(base, target, g.fileGroup);
  const api = files.get('src/web/api.ts');
  assert.equal(api.status, 'changed', 'it now also imports the cart');
  assert.deepEqual(api.imports, [{ path: 'src/orders/cart.ts', status: 'added' }, { path: 'src/orders/order.ts', status: 'same' }], 'changes first');
  assert.deepEqual(files.get('src/orders/order.ts').imports, [{ path: 'src/old/legacy.ts', status: 'removed' }]);
  assert.deepEqual(files.get('src/orders/order.ts').importedBy, [{ path: 'src/web/api.ts', status: 'same' }]);
  assert.equal(files.get('src/orders/order.ts').status, 'changed');
  assert.deepEqual([files.get('src/orders/cart.ts').status, files.get('src/orders/cart.ts').inBase, files.get('src/orders/cart.ts').inTarget], ['added', false, true]);
  assert.equal(files.get('src/old/legacy.ts').status, 'removed');
  assert.equal(files.get('src/orders/cart.ts').type, 'ts');
});

test('a folder lists its files, changes first, and can be searched', () => {
  const base = snap(['lib/a.js', 'lib/b.js', 'lib/z.js'], [['lib/a.js', 'lib/b']]);
  const target = snap(['lib/a.js', 'lib/b.js', 'lib/c.js'], [['lib/a.js', 'lib/b'], ['lib/b.js', 'lib/c']]);
  const g = buildCompareGraph(base, target);
  const files = compareFiles(base, target, g.fileGroup);
  assert.deepEqual(filesOfGroup(files, 'lib').map(f => `${f.path}:${f.status}`), ['lib/c.js:added', 'lib/z.js:removed', 'lib/b.js:changed', 'lib/a.js:same']);
  assert.deepEqual(filesOfGroup(files, 'lib', ' B.JS ').map(f => f.path), ['lib/b.js']);
  assert.deepEqual(filesOfGroup(files, 'nope'), []);
  const many = snap(['x/m10.js', 'x/m2.js', 'x/m1.js']);
  const manyFiles = compareFiles(many, many, buildCompareGraph(many, many).fileGroup);
  assert.deepEqual(filesOfGroup(manyFiles, 'x').map(f => f.path), ['x/m1.js', 'x/m2.js', 'x/m10.js'], 'numbers in reading order');
});

test('long folder names keep their end', () => {
  assert.equal(shortLabel('src/web', 22), 'src/web');
  assert.equal(shortLabel('src/main/java/com/shop/web/controllers', 22), '…/shop/web/controllers');
  assert.equal(shortLabel('src/main/java/com/shop/web/controllers', 18), '…/web/controllers');
  assert.ok(shortLabel('averyveryveryverylongfoldername', 12).length <= 12);
});
