import test from 'node:test';
import assert from 'node:assert/strict';
import { exportReference, panelText } from '../src/domain/evaluation/referenceExport.ts';
import { referenceGrouping } from '../src/domain/architecture/quality.ts';

// T6: a final reference must be importable by the workspace (≤ 40 components, ≤ 50 prefixes each). A file-by-file
// reference is compressed into folder prefixes WITHOUT changing any assignment.

const files = [
  'app/a/one.ts', 'app/a/two.ts', 'app/a/three.ts',
  'app/b/x.ts', 'app/b/y.ts',
  'server/m/doc.ts', 'server/m/user.ts', 'server/m/team.ts',
  'scripts/build.ts',
];
const sameAssignment = (a, b) => {
  const ga = referenceGrouping(files, a), gb = referenceGrouping(files, b);
  return ga.size === gb.size && [...ga].every(([f, c]) => gb.get(f) === c);
};

test('files of one folder that all share a component become the folder', () => {
  const ref = [
    { name: 'A', prefixes: ['app/a/one.ts', 'app/a/two.ts', 'app/a/three.ts'] },
    { name: 'B', prefixes: ['app/b/x.ts', 'app/b/y.ts'] },
  ];
  const r = exportReference(ref, files);
  // app/ holds only A and B (no unassigned file): it goes to its majority A, and B overrides it with app/b/.
  assert.deepEqual(r.components, [{ name: 'A', prefixes: ['app/'] }, { name: 'B', prefixes: ['app/b/'] }]);
  assert.ok(sameAssignment(ref, r.components));
  assert.equal(r.identical, true);
  assert.equal(r.assigned, 5);
  assert.deepEqual(r.problems, []);
});

test('a mixed folder goes to its majority, the others override it with their files; nothing changes', () => {
  const ref = [
    { name: 'Docs', prefixes: ['server/m/doc.ts'] },
    { name: 'Users', prefixes: ['server/m/user.ts', 'server/m/team.ts', 'app/'] },
  ];
  const r = exportReference(ref, files);
  assert.equal(r.identical, true);
  assert.ok(sameAssignment(ref, r.components));
  assert.ok(r.components.find(c => c.name === 'Docs').prefixes.includes('server/m/doc.ts'), 'the exception keeps its file');
});

test('a folder with an unassigned file is never used as a prefix: it would assign that file', () => {
  const ref = [{ name: 'Server', prefixes: ['server/m/doc.ts', 'server/m/user.ts'] }, { name: 'Other', prefixes: ['app/a/one.ts'] }];
  const r = exportReference(ref, files);
  assert.equal(r.identical, true);
  assert.ok(!r.components.some(c => c.prefixes.includes('server/m/') || c.prefixes.includes('server/')), 'server/m/team.ts is unassigned');
  assert.equal(referenceGrouping(files, r.components).has('server/m/team.ts'), false);
});

test('limits of the workspace are reported, not silently broken', () => {
  const many = Array.from({ length: 60 }, (_, i) => `f${i}/x.ts`);
  const ref = [{ name: 'N'.repeat(61), prefixes: many.filter((_, i) => i % 2 === 0) }, { name: 'Other', prefixes: many.filter((_, i) => i % 2 === 1) }];
  const r = exportReference(ref, many);
  assert.equal(r.identical, true);
  assert.ok(r.problems.some(p => /longer than 60/.test(p)));
  // 30 folders of one file each under the root cannot be merged (the root holds both components).
  assert.deepEqual(r.problems.filter(p => /prefixes after compression/.test(p)), []);
  assert.equal(panelText([{ name: 'A', prefixes: ['a/', 'b.ts'] }]), 'A: a/, b.ts');
});

// ── What the workspace accepts (PUT /architecture/reference) ─────────────────
import { IMPORT_LIMITS, parseReferenceBody } from '../src/domain/evaluation/referenceExport.ts';

test('the reference body: names and prefixes trimmed, duplicates refused, an empty list removes the reference', () => {
  assert.deepEqual(parseReferenceBody({ components: [{ name: ' Core ', prefixes: [' src/ ', 'src/', 'lib/a.ts'] }] }), [{ name: 'Core', prefixes: ['src/', 'lib/a.ts'] }]);
  assert.deepEqual(parseReferenceBody({ components: [] }), []);
  assert.throws(() => parseReferenceBody({ components: [{ name: 'A', prefixes: ['a/'] }, { name: 'a', prefixes: ['b/'] }] }), /used twice/);
  assert.throws(() => parseReferenceBody({ components: [{ name: '', prefixes: ['a/'] }] }), /name must be 1 to 60/);
  assert.throws(() => parseReferenceBody({ components: [{ name: 'A', prefixes: [] }] }), /needs 1 to 1000 path prefixes/);
  assert.throws(() => parseReferenceBody({}), /at most 40 entries/);
  assert.throws(() => parseReferenceBody({ components: Array.from({ length: 41 }, (_, i) => ({ name: `C${i}`, prefixes: ['x/'] })) }), /at most 40/);
});

test('a file-by-file reference fits: up to 1,000 prefixes per component, 5,000 in all', () => {
  const files = n => Array.from({ length: n }, (_, i) => `src/f${i}.ts`);
  assert.equal(parseReferenceBody({ components: [{ name: 'Big', prefixes: files(1000) }] })[0].prefixes.length, 1000);
  assert.throws(() => parseReferenceBody({ components: [{ name: 'Big', prefixes: files(1001) }] }), /1 to 1000/);
  const six = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, prefixes: files(1000).map(f => `${i}/${f}`) }));
  assert.throws(() => parseReferenceBody({ components: six }), /at most 5000 path prefixes in all/);
  assert.equal(IMPORT_LIMITS.prefixes, 1000);
  assert.throws(() => parseReferenceBody({ components: [{ name: 'A', prefixes: ['x'.repeat(201)] }] }), /at most 200 characters/);
});
