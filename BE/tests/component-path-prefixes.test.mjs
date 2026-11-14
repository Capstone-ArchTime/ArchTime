import test from 'node:test';
import assert from 'node:assert/strict';
import { findPrefixOverlap, normalizePathPrefix, normalizePathPrefixes } from '../src/domain/architecture/paths.ts';
import { diagramContentKey } from '../src/domain/architecture/canonical.ts';
import { SetComponentPathsUseCase, settleComponentPaths } from '../src/application/use-cases/workspace/SetComponentPathsUseCase.ts';
import { SaveProjectWorkspaceUseCase } from '../src/application/use-cases/workspace/SaveProjectWorkspaceUseCase.ts';
import { AppError } from '../src/shared/errors/AppError.ts';

// D2 — path prefixes on the components of the confirmed diagram (RF-08, BR-27). A prefix maps the files under it to a
// component; one prefix belongs to one component only (MSG24). Nested prefixes are allowed: the longest one wins.

test('a prefix is written one way: forward slashes, no leading ./ or /, no trailing /', () => {
  assert.equal(normalizePathPrefix(' ./BE/src/domain/ '), 'BE/src/domain');
  assert.equal(normalizePathPrefix('BE\\src\\\\domain\\'), 'BE/src/domain');
  assert.equal(normalizePathPrefix('/FE/src/pages//'), 'FE/src/pages');
  assert.equal(normalizePathPrefix('package.json'), 'package.json');
});

test('a prefix that cannot name a place in the repository is refused', () => {
  for (const bad of ['', '   ', '/', './', '../secrets', 'src/../../etc', 'src/./a', 'C:/repo/src', 'src/*.ts', 'src/a?', 'a'.repeat(201), 'src/\u0000x']) {
    assert.equal(normalizePathPrefix(bad), null, JSON.stringify(bad));
  }
  assert.equal(normalizePathPrefix(42), null);
});

test('a list of prefixes is normalized, de-duplicated and kept in the order given', () => {
  assert.deepEqual(normalizePathPrefixes(['src/b/', './src/a', 'src/b']), { prefixes: ['src/b', 'src/a'] });
  assert.deepEqual(normalizePathPrefixes([]), { prefixes: [] });
  assert.deepEqual(normalizePathPrefixes(['src/a', '../x']), { invalid: '../x' });
  assert.deepEqual(normalizePathPrefixes('src/a'), { invalid: 'src/a' });
  assert.ok('invalid' in normalizePathPrefixes(Array.from({ length: 51 }, (_, i) => `p${i}`)));
});

test('the same prefix on two components is an overlap; nested prefixes are not', () => {
  const components = [
    { id: 'a', name: 'Orders', pathPrefixes: ['BE/src/orders', 'BE/src/shared'] },
    { id: 'b', name: 'Billing', pathPrefixes: ['BE/src/billing', 'BE/src/shared'] },
  ];
  assert.deepEqual(findPrefixOverlap(components), { prefix: 'BE/src/shared', first: { id: 'a', name: 'Orders' }, second: { id: 'b', name: 'Billing' } });
  assert.equal(findPrefixOverlap([
    { id: 'a', name: 'Orders', pathPrefixes: ['BE/src'] },
    { id: 'b', name: 'Billing', pathPrefixes: ['BE/src/billing'] },
    { id: 'c', name: 'Legacy' },
  ]), null);
});

test('a whole-diagram save keeps the stored prefixes of components the page sent without them', () => {
  const stored = [{ id: 'a', name: 'Orders', kind: 'Service', description: '', pathPrefixes: ['src/orders'] }];
  const settled = settleComponentPaths([{ id: 'a', name: 'Orders', kind: 'Service', description: '' }, { id: 'n', name: 'New', kind: 'UI', description: '' }], stored);
  assert.deepEqual(settled.map(c => c.pathPrefixes), [['src/orders'], []]);
  assert.throws(() => settleComponentPaths([{ id: 'a', name: 'A', pathPrefixes: ['x'] }, { id: 'b', name: 'B', pathPrefixes: ['./x/'] }], []),
    error => error instanceof AppError && error.statusCode === 400 && /"x".*A.*B/s.test(error.message));
});

test('prefixes are not part of the confirmed content: mapping files does not unconfirm the diagram', () => {
  const base = { components: [{ id: 'a', name: 'Orders', kind: 'Service', description: '' }], dependencies: [] };
  const mapped = { ...base, components: [{ ...base.components[0], pathPrefixes: ['src/orders'] }] };
  assert.equal(diagramContentKey(mapped), diagramContentKey(base));
});

// ── Use case ─────────────────────────────────────────────────────────────────

function repos(diagram) {
  let stored = { id: 'w1', projectId: 'p1', revision: 4, diagram: { revision: 4, ...diagram }, rules: [{ id: 'r1' }], decisions: [{ id: 'd1' }] };
  const saves = [];
  return {
    saves,
    get stored() { return stored; },
    projects: { findById: async id => (id === 'p1' ? { id: 'p1' } : null) },
    workspaces: {
      findByProjectId: async id => (id === 'p1' ? structuredClone(stored) : null),
      save: async (ws, expected) => {
        if (expected !== undefined && expected !== stored.revision) throw Object.assign(new Error('conflict'), { isConflict: true, expectedRevision: expected, currentRevision: stored.revision });
        saves.push({ ws: structuredClone(ws), expected });
        stored = { ...stored, ...structuredClone(ws), revision: stored.revision + 1, diagram: { ...structuredClone(ws.diagram), revision: stored.revision + 1 } };
        return structuredClone(stored);
      },
    },
  };
}

const confirmed = () => ({
  components: [
    { id: 'orders', name: 'Orders', kind: 'Service', description: '', pathPrefixes: ['BE/src/orders'] },
    { id: 'billing', name: 'Billing', kind: 'Service', description: '' },
  ],
  dependencies: [{ id: 'e1', source: 'orders', target: 'billing', label: 'REST' }],
  confirmedAt: new Date('2026-11-10T00:00:00Z'), confirmedBy: 'u1', confirmedRevision: 3, baselineCommit: 'abc123',
});

test('SetComponentPaths sets one component\'s prefixes and keeps the confirmation, rules and decisions', async () => {
  const r = repos(confirmed());
  const result = await new SetComponentPathsUseCase(r.workspaces, r.projects).execute({ projectId: 'p1', componentId: 'billing', pathPrefixes: ['./BE/src/billing/', 'BE/src/payments'], expectedRevision: 4, userId: 'u2' });
  assert.deepEqual(result.component.pathPrefixes, ['BE/src/billing', 'BE/src/payments']);
  assert.equal(result.revision, 5);
  const saved = r.saves[0];
  assert.equal(saved.expected, 4);
  assert.deepEqual(saved.ws.diagram.components.find(c => c.id === 'orders').pathPrefixes, ['BE/src/orders']);
  assert.equal(new Date(saved.ws.diagram.confirmedAt).toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(saved.ws.diagram.baselineCommit, 'abc123');
  assert.deepEqual(saved.ws.rules, [{ id: 'r1' }]);
  assert.deepEqual(saved.ws.decisions, [{ id: 'd1' }]);
  assert.equal(saved.ws.updatedBy, 'u2');
});

test('SetComponentPaths refuses a prefix another component already has (MSG24) and writes nothing', async () => {
  const r = repos(confirmed());
  await assert.rejects(
    new SetComponentPathsUseCase(r.workspaces, r.projects).execute({ projectId: 'p1', componentId: 'billing', pathPrefixes: ['BE/src/orders/'] }),
    error => error instanceof AppError && error.statusCode === 400 && error.message.includes('"BE/src/orders"') && error.message.includes('Orders'),
  );
  assert.equal(r.saves.length, 0);
});

test('SetComponentPaths answers 404 for an unknown component or project, 400 for bad input, 409 for a stale revision', async () => {
  const r = repos(confirmed());
  const uc = new SetComponentPathsUseCase(r.workspaces, r.projects);
  await assert.rejects(uc.execute({ projectId: 'p1', componentId: 'nope', pathPrefixes: [] }), e => e.statusCode === 404);
  await assert.rejects(uc.execute({ projectId: 'p9', componentId: 'orders', pathPrefixes: [] }), e => e.statusCode === 404);
  await assert.rejects(uc.execute({ projectId: 'p1', componentId: 'orders', pathPrefixes: ['../etc'] }), e => e.statusCode === 400 && e.message.includes('../etc'));
  await assert.rejects(uc.execute({ projectId: 'p1', componentId: 'orders', pathPrefixes: 'src' }), e => e.statusCode === 400);
  await assert.rejects(uc.execute({ projectId: 'p1', componentId: 'orders', pathPrefixes: ['src'], expectedRevision: 2 }), e => e.statusCode === 409);
  assert.equal(r.saves.length, 0);
});

test('a whole-workspace save checks prefixes too and keeps the ones the page did not send', async () => {
  const r = repos(confirmed());
  const uc = new SaveProjectWorkspaceUseCase(r.workspaces, r.projects);
  const diagram = { ...confirmed(), components: confirmed().components.map(({ pathPrefixes, ...c }) => c) };
  await uc.execute({ projectId: 'p1', expectedRevision: 4, diagram, rules: [], decisions: [], userId: 'u1' });
  assert.deepEqual(r.saves[0].ws.diagram.components.map(c => c.pathPrefixes), [['BE/src/orders'], []]);
  // The diagram stays confirmed: only the files mapped to it were touched.
  assert.ok(r.saves[0].ws.diagram.confirmedAt);

  const clash = { ...confirmed(), components: [confirmed().components[0], { ...confirmed().components[1], pathPrefixes: ['BE/src/orders'] }] };
  await assert.rejects(uc.execute({ projectId: 'p1', expectedRevision: 5, diagram: clash, rules: [], decisions: [] }), e => e.statusCode === 400 && /BE\/src\/orders/.test(e.message));
  assert.equal(r.saves.length, 1);
});
