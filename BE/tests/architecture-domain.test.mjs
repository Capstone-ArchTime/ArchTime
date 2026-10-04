import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveImportTarget } from '../src/domain/architecture/resolveImport.ts';
import { clusterFiles } from '../src/domain/architecture/cluster.ts';
import { describeGroups, roleOfFile, titleCase } from '../src/domain/architecture/naming.ts';
import { buildView, fileDependencies, graphHash, proposeMapping } from '../src/domain/architecture/buildView.ts';
import { validateView } from '../src/domain/architecture/validate.ts';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const shuffle = (xs, r) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** `folders` cliques of `size` files each, plus one weak link between neighbouring folders. */
function cliques(folders, size) {
  const files = [], edges = [];
  for (let f = 0; f < folders; f++) {
    const names = Array.from({ length: size }, (_, i) => `src/mod${f}/file${i}.ts`);
    files.push(...names);
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) edges.push({ source: names[i], target: names[j] });
    if (f > 0) edges.push({ source: names[0], target: `src/mod${f - 1}/file0.ts` });
  }
  return { files, edges };
}

test('imports resolve like TypeScript does and ignore packages', () => {
  const files = new Set(['src/a.ts', 'src/b.tsx', 'src/util/index.ts', 'src/c.json', 'src/d.mts']);
  assert.equal(resolveImportTarget(files, 'src/a'), 'src/a.ts');
  assert.equal(resolveImportTarget(files, 'src/a.js'), 'src/a.ts', 'ESM TypeScript writes .js for .ts');
  assert.equal(resolveImportTarget(files, 'src/b.js'), 'src/b.tsx');
  assert.equal(resolveImportTarget(files, 'src/util'), 'src/util/index.ts');
  assert.equal(resolveImportTarget(files, 'src/d.mjs'), 'src/d.mts');
  assert.equal(resolveImportTarget(files, 'src/c.json'), 'src/c.json');
  assert.equal(resolveImportTarget(files, 'react'), null);
  assert.equal(resolveImportTarget(files, 'src/missing'), null);
});

test('dependencies resolve relative imports, @/ aliases and drop packages and self imports', () => {
  const graph = {
    nodes: [{ id: 'FE/src/a.ts' }, { id: 'FE/src/lib/b.ts' }, { id: 'BE/src/c.ts' }, { id: 'FE/src/a.test.ts' }],
    edges: [
      { source: 'FE/src/a.ts', target: '@/lib/b' }, { source: 'FE/src/a.ts', target: 'react' }, { source: 'FE/src/a.ts', target: 'FE/src/a' },
      { source: 'BE/src/c.ts', target: 'BE/src/c.js' }, { source: 'FE/src/a.test.ts', target: 'FE/src/a' }, { source: 'FE/src/a.ts', target: '@/lib/b' },
    ],
  };
  const { files, edges } = fileDependencies(graph);
  assert.deepEqual(files, ['BE/src/c.ts', 'FE/src/a.ts', 'FE/src/lib/b.ts'], 'test files are excluded');
  assert.deepEqual(edges, [{ source: 'FE/src/a.ts', target: 'FE/src/lib/b.ts', kind: 'imports' }]);
});

test('clear clusters are found and tiny differences in input order do not matter', () => {
  const { files, edges } = cliques(4, 6);
  const options = { minComponents: 2, maxComponents: 6 };
  const a = clusterFiles({ files, edges }, options);
  assert.deepEqual(a.groups.map(g => g.length), [6, 6, 6, 6]);
  assert.ok(a.groups.every(g => new Set(g.map(f => f.split('/')[1])).size === 1), 'each group is one folder');
  const r = rng(5);
  const b = clusterFiles({ files: shuffle(files, r), edges: shuffle(edges, r) }, options);
  assert.deepEqual(b, a);
});

test('too many groups are folded to the maximum', () => {
  const { files, edges } = cliques(20, 3);
  const result = clusterFiles({ files, edges }, { minComponents: 4, maxComponents: 8 });
  assert.ok(result.groups.length <= 8 && result.groups.length >= 4, `got ${result.groups.length}`);
  assert.equal(result.groups.flat().length + result.leftovers.length, files.length);
});

test('one huge connected folder is split instead of becoming a single component', () => {
  const files = Array.from({ length: 60 }, (_, i) => `src/all/f${String(i).padStart(2, '0')}.ts`);
  const r = rng(3);
  const edges = [];
  for (let i = 0; i < 60; i++) for (let k = 0; k < 3; k++) { const j = Math.min(59, Math.max(0, i + Math.floor(r() * 7) - 3)); if (i !== j) edges.push({ source: files[i], target: files[j] }); }
  const result = clusterFiles({ files, edges }, { minComponents: 5, maxComponents: 12 });
  assert.ok(result.groups.length >= 5, `got ${result.groups.length}`);
});

test('files that connect to nothing are not guessed into a component', () => {
  const { files, edges } = cliques(3, 5);
  const result = clusterFiles({ files: [...files, 'scripts/lonely.ts'], edges }, { minComponents: 2, maxComponents: 6 });
  assert.deepEqual(result.leftovers, ['scripts/lonely.ts']);
});

test('every file lands in exactly one group on random graphs, and the result is stable', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed * 7919);
    const n = 20 + Math.floor(r() * 180);
    const folders = 3 + Math.floor(r() * 12);
    const files = Array.from({ length: n }, (_, i) => `src/d${i % folders}/f${i}.ts`);
    const edges = [];
    for (let i = 0; i < n * 2; i++) { const a = files[Math.floor(r() * n)], b = files[Math.floor(r() * n)]; if (a !== b) edges.push({ source: a, target: b }); }
    const result = clusterFiles({ files, edges });
    const placed = [...result.groups.flat(), ...result.leftovers];
    assert.equal(placed.length, n, `seed ${seed}`);
    assert.equal(new Set(placed).size, n, `seed ${seed}`);
    assert.ok(result.groups.length <= 15, `seed ${seed}: ${result.groups.length} groups`);
    assert.deepEqual(clusterFiles({ files, edges }), result, `seed ${seed} is deterministic`);
  }
});

test('empty and tiny inputs', () => {
  assert.deepEqual(clusterFiles({ files: [], edges: [] }).groups, []);
  const tiny = clusterFiles({ files: ['a.ts', 'b.ts', 'c.ts'], edges: [{ source: 'a.ts', target: 'b.ts' }, { source: 'b.ts', target: 'c.ts' }] });
  assert.equal(tiny.groups.flat().length + tiny.leftovers.length, 3);
});

test('roles come from folder names and are never claimed as FACT', () => {
  assert.equal(roleOfFile('BE/src/presentation/controllers/ProjectController.ts'), 'controller');
  assert.equal(roleOfFile('BE/src/infrastructure/services/MiningService.ts'), 'gateway', 'infrastructure wins over services');
  assert.equal(roleOfFile('BE/src/infrastructure/repositories/MongoUserRepository.ts'), 'repository');
  assert.equal(roleOfFile('BE/src/application/use-cases/LoginUseCase.ts'), 'service');
  assert.equal(roleOfFile('src/domain/entities/User.ts'), 'entity');
  assert.equal(roleOfFile('src/config/env.ts'), 'config');
  assert.equal(roleOfFile('src/misc/thing.ts'), null);
  const [a, b] = describeGroups([['src/controllers/a.ts', 'src/controllers/b.ts'], ['src/misc/x.ts', 'src/misc/y.ts']]);
  assert.deepEqual([a.role, a.label, a.layer], ['controller', 'INFERENCE', 0]);
  assert.deepEqual([b.role, b.label, b.layer], ['other', 'UNKNOWN', undefined]);
});

test('names are readable, unique and ignore generic folders', () => {
  assert.equal(titleCase('use-cases'), 'Use Cases');
  assert.equal(titleCase('apiClient'), 'API Client');
  const groups = describeGroups([
    ['src/main/java/com/shop/orders/A.java', 'src/main/java/com/shop/orders/B.java'],
    ['x/orders/C.java', 'x/orders/D.java'],
    ['a.ts', 'b.ts'],
  ]);
  assert.equal(groups[0].name, 'Shop / Orders');
  assert.equal(groups[1].name, 'X / Orders');
  assert.equal(groups[2].name, 'Root Files');
  const dup = describeGroups([['p/orders/a.ts', 'p/orders/b.ts'], ['p/orders/c.ts', 'p/orders/d.ts']]);
  assert.notEqual(dup[0].name, dup[1].name);
});

test('a generated view passes the verifier and every edge is backed by file dependencies', () => {
  const { files, edges } = cliques(9, 5);
  const graph = { nodes: files.map(id => ({ id })), edges: edges.map(e => ({ ...e, type: 'imports' })) };
  const { components } = proposeMapping(graph);
  const view = buildView({ projectId: 'p', snapshotId: 's', title: 't', generator: 'cluster-only' }, graph, components);
  const result = validateView(view);
  assert.deepEqual(result.issues.filter(i => i.severity === 'error'), []);
  assert.equal(view.components.length, 9);
  assert.ok(view.edges.length >= 8);
  assert.equal(view.classes.length, files.length);
  for (const e of view.edges) assert.equal(e.weight, e.evidence.length);
});

test('the graph hash changes when the graph does', () => {
  const g = { nodes: [{ id: 'a.ts' }, { id: 'b.ts' }], edges: [{ source: 'a.ts', target: 'b' }] };
  assert.equal(graphHash(g), graphHash({ nodes: [...g.nodes].reverse(), edges: g.edges }));
  assert.notEqual(graphHash(g), graphHash({ ...g, edges: [] }));
});

test('the shared model files stay identical to the frontend copies', () => {
  for (const f of ['types', 'derive', 'validate']) {
    const fe = fs.readFileSync(new URL(`../../FE/src/features/architecture/${f}.ts`, import.meta.url), 'utf8').replace(/from '\.\/([a-z-]+)\.ts'/g, "from './$1.js'");
    const be = fs.readFileSync(new URL(`../src/domain/architecture/${f}.ts`, import.meta.url), 'utf8');
    assert.equal(be, fe, `${f}.ts differs from FE/src/features/architecture/${f}.ts: copy it across (imports use .js here)`);
  }
});
