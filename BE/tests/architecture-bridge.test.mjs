import test from 'node:test';
import assert from 'node:assert/strict';
import { fileDependencies } from '../src/domain/architecture/buildView.ts';
import {
  analyzeImpact, compactImpact, diffResolved, ownerMapOf, projectImpact, resolveGraph, UNMAPPED, DEFAULT_PAIR_CAP, DEFAULT_UNMAPPED_FILE_CAP,
} from '../src/domain/architecture/bridge.ts';

// The bridge is pure: two snapshot graphs and a file -> component map in, a labelled INFERENCE out.

const g = (files, deps = []) => ({
  nodes: files.map(id => ({ id, name: id.split('/').pop(), type: 'module' })),
  edges: deps.map(([source, target]) => ({ source, target, type: 'imports' })),
});
const comp = (id, ...memberIds) => ({ id, memberIds });
const pairs = list => list.map(p => `${p.source}>${p.target}`);

const ui = ['src/ui/a.ts', 'src/ui/b.ts'];
const api = ['src/api/x.ts', 'src/api/y.ts'];
const db = ['src/db/m.ts'];
const all = [...ui, ...api, ...db];
const components = [comp('ui', ...ui), comp('api', ...api), comp('db', ...db)];

test('only dependencies that differ are reported, as added or removed file pairs', () => {
  const before = g(all, [['src/ui/a.ts', 'src/api/x'], ['src/api/x.ts', 'src/db/m']]);
  const after = g(all, [['src/ui/a.ts', 'src/api/x'], ['src/ui/b.ts', 'src/api/y'], ['src/api/y.ts', 'src/db/m']]);
  const diff = diffResolved(resolveGraph(before), resolveGraph(after));
  assert.equal(diff.hasBaseline, true);
  assert.deepEqual(pairs(diff.addedPairs), ['src/api/y.ts>src/db/m.ts', 'src/ui/b.ts>src/api/y.ts']);
  assert.deepEqual(pairs(diff.removedPairs), ['src/api/x.ts>src/db/m.ts']);
  assert.deepEqual(diff.addedFiles, []);
  assert.deepEqual(diff.removedFiles, []);
});

test('the result is labelled INFERENCE and carries the raw totals', () => {
  const before = g(all, [['src/ui/a.ts', 'src/api/x']]);
  const after = g(all, [['src/ui/a.ts', 'src/api/x'], ['src/ui/b.ts', 'src/api/y']]);
  const out = analyzeImpact(before, after, components);
  assert.equal(out.label, 'INFERENCE');
  assert.equal(out.hasBaseline, true);
  assert.deepEqual(out.fileChanges, { pairsAdded: 1, pairsRemoved: 0, filesAdded: 0, filesRemoved: 0 });
});

test('a dependency between two components is a cross edge with the file pairs behind it', () => {
  const before = g(all, [['src/ui/a.ts', 'src/api/x']]);
  const after = g(all, [['src/ui/a.ts', 'src/api/x'], ['src/ui/b.ts', 'src/api/y'], ['src/ui/a.ts', 'src/api/y']]);
  const out = analyzeImpact(before, after, components);
  assert.equal(out.componentEdges.length, 1);
  const [edge] = out.componentEdges;
  assert.deepEqual({ id: edge.id, kind: edge.kind, source: edge.source, target: edge.target }, { id: 'ui->api', kind: 'cross', source: 'ui', target: 'api' });
  assert.equal(edge.added.totalFilePairs, 2);
  assert.deepEqual(pairs(edge.added.filePairs), ['src/ui/a.ts>src/api/y.ts', 'src/ui/b.ts>src/api/y.ts']);
  assert.deepEqual(edge.removed, { totalFilePairs: 0, filePairs: [] });
  assert.deepEqual(out.components.map(c => [c.id, c.pairsAdded, c.pairsRemoved]), [['api', 2, 0], ['ui', 2, 0]], 'both ends of a dependency count as touched');
});

test('a removed dependency is reported on the same edge as an added one in the other direction', () => {
  const before = g(all, [['src/ui/a.ts', 'src/api/x'], ['src/api/x.ts', 'src/ui/b']]);
  const after = g(all, [['src/ui/a.ts', 'src/api/x']]);
  const out = analyzeImpact(before, after, components);
  assert.deepEqual(out.componentEdges.map(e => `${e.id}:${e.added.totalFilePairs}/${e.removed.totalFilePairs}`), ['api->ui:0/1']);
});

test('a change inside one component is internal, not a component edge between two', () => {
  const before = g(all, []);
  const after = g(all, [['src/ui/a.ts', 'src/ui/b']]);
  const out = analyzeImpact(before, after, components);
  assert.deepEqual(out.componentEdges.map(e => [e.id, e.kind, e.source, e.target]), [['ui', 'internal', 'ui', 'ui']]);
  assert.deepEqual(out.components, [{ id: 'ui', filesAdded: 0, filesRemoved: 0, pairsAdded: 1, pairsRemoved: 0 }], 'an internal dependency counts once for its component');
});

test('an edge between a mapped and an unmapped file is reported as unmapped, never dropped', () => {
  const files = [...all, 'src/misc/z.ts'];
  const before = g(files, []);
  const after = g(files, [['src/ui/a.ts', 'src/misc/z'], ['src/misc/z.ts', 'src/db/m']]);
  const out = analyzeImpact(before, after, components);
  assert.deepEqual(out.componentEdges.map(e => [e.id, e.kind, e.source, e.target]), [
    [`${UNMAPPED}->db`, 'unmapped', null, 'db'],
    [`ui->${UNMAPPED}`, 'unmapped', 'ui', null],
  ]);
  assert.deepEqual(out.unmappedFiles, { total: 1, files: ['src/misc/z.ts'] });
  assert.deepEqual(out.components.map(c => c.id), ['db', 'ui'], 'the mapped end is still touched');
});

test('a dependency whose two files have no owner is counted, and its files are listed as unmapped', () => {
  const files = [...all, 'src/misc/z.ts', 'src/misc/w.ts'];
  const out = analyzeImpact(g(files, []), g(files, [['src/misc/z.ts', 'src/misc/w']]), components);
  assert.deepEqual(out.componentEdges, []);
  assert.equal(out.unmappedPairs, 1);
  assert.deepEqual(out.unmappedFiles, { total: 2, files: ['src/misc/w.ts', 'src/misc/z.ts'] });
  assert.equal(out.fileChanges.pairsAdded, 1);
});

test('added and removed files belong to the component that owns them, and unowned ones are unmapped', () => {
  const before = g(['src/ui/a.ts', 'src/old/gone.ts', 'src/db/m.ts'], []);
  const after = g(['src/ui/a.ts', 'src/ui/b.ts', 'src/db/m.ts', 'src/new/n.ts'], []);
  const out = analyzeImpact(before, after, components);
  assert.deepEqual(out.fileChanges, { pairsAdded: 0, pairsRemoved: 0, filesAdded: 2, filesRemoved: 1 });
  assert.deepEqual(out.components, [{ id: 'ui', filesAdded: 1, filesRemoved: 0, pairsAdded: 0, pairsRemoved: 0 }]);
  assert.deepEqual(out.unmappedFiles.files, ['src/new/n.ts', 'src/old/gone.ts']);
});

test('a rename is a removed file plus an added file, with its dependencies removed and added under the two paths', () => {
  const before = g(['src/ui/a.ts', 'src/ui/old.ts', 'src/db/m.ts'], [['src/ui/a.ts', 'src/ui/old'], ['src/ui/old.ts', 'src/db/m']]);
  const after = g(['src/ui/a.ts', 'src/ui/new.ts', 'src/db/m.ts'], [['src/ui/a.ts', 'src/ui/new'], ['src/ui/new.ts', 'src/db/m']]);
  const diff = diffResolved(resolveGraph(before), resolveGraph(after));
  assert.deepEqual(diff.removedFiles, ['src/ui/old.ts']);
  assert.deepEqual(diff.addedFiles, ['src/ui/new.ts']);
  assert.deepEqual(pairs(diff.removedPairs), ['src/ui/a.ts>src/ui/old.ts', 'src/ui/old.ts>src/db/m.ts']);
  assert.deepEqual(pairs(diff.addedPairs), ['src/ui/a.ts>src/ui/new.ts', 'src/ui/new.ts>src/db/m.ts']);
  const out = projectImpact(diff, ownerMapOf([comp('ui', 'src/ui/a.ts', 'src/ui/new.ts'), comp('db', 'src/db/m.ts')]));
  assert.deepEqual(out.unmappedFiles.files, ['src/ui/old.ts'], 'the old path has no component in the later grouping');
  assert.deepEqual(out.componentEdges.map(e => `${e.id}:${e.kind}:${e.added.totalFilePairs}/${e.removed.totalFilePairs}`), [
    'ui->db:cross:1/0', 'ui:internal:1/0', `${UNMAPPED}->db:unmapped:0/1`, `ui->${UNMAPPED}:unmapped:0/1`,
  ]);
});

test('file pairs are capped per edge and side, with the full total reported', () => {
  const many = Array.from({ length: 25 }, (_, i) => `src/api/f${String(i).padStart(2, '0')}.ts`);
  const files = ['src/ui/a.ts', ...many];
  const after = g(files, many.map(f => ['src/ui/a.ts', f.replace(/\.ts$/, '')]));
  const owners = [comp('ui', 'src/ui/a.ts'), comp('api', ...many)];
  const out = analyzeImpact(g(files, []), after, owners);
  assert.equal(DEFAULT_PAIR_CAP, 10);
  const [edge] = out.componentEdges;
  assert.equal(edge.added.totalFilePairs, 25);
  assert.equal(edge.added.filePairs.length, 10);
  assert.deepEqual(pairs(edge.added.filePairs), many.slice(0, 10).map(f => `src/ui/a.ts>${f}`), 'the first pairs in path order');
  const small = analyzeImpact(g(files, []), after, owners, { pairCap: 3 });
  assert.equal(small.componentEdges[0].added.filePairs.length, 3);
  assert.equal(small.componentEdges[0].added.totalFilePairs, 25);
  const none = analyzeImpact(g(files, []), after, owners, { pairCap: 0 });
  assert.deepEqual(none.componentEdges[0].added, { totalFilePairs: 25, filePairs: [] });
  const bad = analyzeImpact(g(files, []), after, owners, { pairCap: -1 });
  assert.equal(bad.componentEdges[0].added.filePairs.length, 10, 'a nonsense cap falls back to the default');
});

test('unmapped files are capped and counted', () => {
  const stray = Array.from({ length: 30 }, (_, i) => `src/misc/s${String(i).padStart(2, '0')}.ts`);
  const out = analyzeImpact(g(['src/ui/a.ts'], []), g(['src/ui/a.ts', ...stray], []), components);
  assert.equal(DEFAULT_UNMAPPED_FILE_CAP, 20);
  assert.equal(out.unmappedFiles.total, 30);
  assert.deepEqual(out.unmappedFiles.files, stray.slice(0, 20));
  const few = analyzeImpact(g(['src/ui/a.ts'], []), g(['src/ui/a.ts', ...stray], []), components, { unmappedFileCap: 2 });
  assert.deepEqual(few.unmappedFiles, { total: 30, files: stray.slice(0, 2) });
});

test('ordering does not depend on the order of nodes, edges or components', () => {
  const before = g(all, [['src/api/x.ts', 'src/db/m']]);
  const edges = [['src/ui/a.ts', 'src/api/x'], ['src/ui/b.ts', 'src/api/y'], ['src/api/y.ts', 'src/db/m'], ['src/ui/a.ts', 'src/ui/b'], ['src/ui/b.ts', 'src/db/m']];
  const first = analyzeImpact(before, g(all, edges), components);
  const second = analyzeImpact(
    { nodes: [...before.nodes].reverse(), edges: before.edges },
    { nodes: [...g(all, edges).nodes].reverse(), edges: [...g(all, edges).edges].reverse() },
    [...components].reverse(),
  );
  assert.deepEqual(second, first);
  assert.deepEqual(first.componentEdges.map(e => e.id), ['api->db', 'ui->api', 'ui->db', 'ui'], 'cross edges first, then internal, each by id');
  assert.deepEqual(first.components.map(c => c.id), ['api', 'db', 'ui']);
});

test('the first snapshot has no baseline and reports nothing as changed', () => {
  const out = analyzeImpact(null, g(all, [['src/ui/a.ts', 'src/api/x']]), components);
  assert.equal(out.hasBaseline, false);
  assert.deepEqual(out.fileChanges, { pairsAdded: 0, pairsRemoved: 0, filesAdded: 0, filesRemoved: 0 });
  assert.deepEqual(out.componentEdges, []);
  assert.deepEqual(out.components, []);
  assert.deepEqual(out.unmappedFiles, { total: 0, files: [] });
  assert.equal(out.label, 'INFERENCE');
});

test('empty graphs: an empty baseline makes everything added, an empty result makes everything removed, two empties change nothing', () => {
  const full = g(all, [['src/ui/a.ts', 'src/api/x']]);
  const grown = analyzeImpact(g([], []), full, components);
  assert.equal(grown.hasBaseline, true);
  assert.deepEqual(grown.fileChanges, { pairsAdded: 1, pairsRemoved: 0, filesAdded: 5, filesRemoved: 0 });
  const shrunk = analyzeImpact(full, g([], []), components);
  assert.deepEqual(shrunk.fileChanges, { pairsAdded: 0, pairsRemoved: 1, filesAdded: 0, filesRemoved: 5 });
  assert.deepEqual(shrunk.components.map(c => [c.id, c.filesRemoved]), [['api', 2], ['db', 1], ['ui', 2]], 'removed files count for the component that lists them');
  assert.equal(analyzeImpact(full, g([], []), []).unmappedFiles.total, 5, 'and are unmapped when no component does');
  const same = analyzeImpact(g([], []), g([], []), []);
  assert.deepEqual(same.fileChanges, { pairsAdded: 0, pairsRemoved: 0, filesAdded: 0, filesRemoved: 0 });
  assert.deepEqual(analyzeImpact(full, full, []).componentEdges, []);
  assert.deepEqual(analyzeImpact(full, full, components).components, []);
});

test('duplicate edges, self edges and equivalent specifiers count once or not at all', () => {
  const before = g(all, []);
  const after = g(all, [
    ['src/ui/a.ts', 'src/api/x'], ['src/ui/a.ts', 'src/api/x'], ['src/ui/a.ts', 'src/api/x.js'], ['src/ui/a.ts', 'src/api/x.ts'],
    ['src/ui/a.ts', 'src/ui/a'], ['src/db/m.ts', 'src/db/m.ts'],
    ['src/ui/a.ts', 'react'], ['src/ui/a.ts', 'src/missing/file'],
  ]);
  const out = analyzeImpact(before, after, components);
  assert.equal(out.fileChanges.pairsAdded, 1);
  assert.equal(out.componentEdges.length, 1);
  assert.equal(out.componentEdges[0].added.totalFilePairs, 1);
});

test('duplicate nodes do not duplicate added or removed files', () => {
  const out = analyzeImpact(g(['src/ui/a.ts'], []), g(['src/ui/a.ts', 'src/ui/b.ts', 'src/ui/b.ts'], []), components);
  assert.equal(out.fileChanges.filesAdded, 1);
  assert.deepEqual(out.components, [{ id: 'ui', filesAdded: 1, filesRemoved: 0, pairsAdded: 0, pairsRemoved: 0 }]);
});

test('test files, build output and declaration files are outside the analysis, as in the views', () => {
  const before = g(['src/ui/a.ts'], []);
  const after = g(['src/ui/a.ts', 'src/ui/a.test.ts', 'tests/t.ts', 'dist/x.js', 'src/types.d.ts'], [['src/ui/a.test.ts', 'src/ui/a']]);
  const out = analyzeImpact(before, after, components);
  assert.deepEqual(out.fileChanges, { pairsAdded: 0, pairsRemoved: 0, filesAdded: 0, filesRemoved: 0 });
});

test('a file listed under two components belongs to the first, and unknown ids are ignored', () => {
  const owner = ownerMapOf([comp('one', 'f.ts', 'g.ts'), comp('two', 'g.ts', 'h.ts')]);
  assert.equal(owner.get('g.ts'), 'one');
  assert.equal(owner.get('h.ts'), 'two');
  assert.equal(owner.get('nope.ts'), undefined);
  assert.equal(ownerMapOf([]).size, 0);
});

test('the dependencies it compares are exactly the ones fileDependencies gives the views', () => {
  const before = g(
    ['src/a.ts', 'src/b.ts', 'src/c/index.ts', 'src/d.tsx', 'lib/e.js', 'src/a.test.ts'],
    [['src/a.ts', 'src/b'], ['src/a.ts', 'src/c'], ['src/b.ts', 'src/d.js'], ['src/a.ts', 'lodash'], ['src/b.ts', '@/c'], ['src/a.test.ts', 'src/a']],
  );
  const after = g(
    ['src/a.ts', 'src/b.ts', 'src/c/index.ts', 'src/d.tsx', 'lib/e.js', 'src/f.ts'],
    [['src/a.ts', 'src/b'], ['src/b.ts', 'src/d.js'], ['src/f.ts', 'src/c'], ['src/a.ts', 'src/f'], ['lib/e.js', 'lib/e.js']],
  );
  const key = e => `${e.source}>${e.target}`;
  const was = new Set(fileDependencies(before).edges.map(key)), is = new Set(fileDependencies(after).edges.map(key));
  const diff = diffResolved(resolveGraph(before), resolveGraph(after));
  assert.deepEqual(pairs(diff.addedPairs), [...is].filter(k => !was.has(k)).sort());
  assert.deepEqual(pairs(diff.removedPairs), [...was].filter(k => !is.has(k)).sort());
  assert.ok(diff.addedPairs.length > 0 && diff.removedPairs.length > 0, 'the fixture changes something both ways');
});

test('the inputs are not modified', () => {
  const before = g(all, [['src/ui/a.ts', 'src/api/x']]);
  const after = g(all, [['src/ui/b.ts', 'src/api/y']]);
  const snapshot = JSON.stringify([before, after, components]);
  analyzeImpact(before, after, components);
  assert.equal(JSON.stringify([before, after, components]), snapshot);
});

test('the compact form keeps components, plain edge counts and the unmapped total', () => {
  const files = [...all, 'src/misc/z.ts'];
  const out = analyzeImpact(g(files, []), g(files, [['src/ui/a.ts', 'src/api/x'], ['src/ui/b.ts', 'src/misc/z']]), components);
  assert.deepEqual(compactImpact(out), {
    components: ['api', 'ui'],
    componentEdges: [
      { id: 'ui->api', kind: 'cross', source: 'ui', target: 'api', added: 1, removed: 0 },
      { id: `ui->${UNMAPPED}`, kind: 'unmapped', source: 'ui', target: null, added: 1, removed: 0 },
    ],
    unmappedCount: 1,
  });
});
