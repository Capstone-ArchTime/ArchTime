import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { commitComponentImpact } from '../src/domain/tasks/impact.ts';
import { TaskImpactUseCase } from '../src/application/use-cases/tasks/TaskUseCases.ts';
import { mongoCommitArchitecture } from '../src/infrastructure/repositories/MongoTaskRepository.ts';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';
import { EvidenceModel } from '../src/infrastructure/database/models/EvidenceModel.ts';
import { InMemoryTaskRepository } from './task-fakes.mjs';

// DS-07a / WF-07 business outcome "each task's architectural impact visible": a task lists its commits with the
// dependencies they added and removed, the components of the component diagram they changed, and their evidence.

const graph = edges => ({
  nodes: ['src/orders/order.ts', 'src/billing/bill.ts', 'src/billing/tax.ts'].map(id => ({ id })),
  edges: edges.map(([source, target]) => ({ source, target })),
});
const components = [
  { id: 'orders', name: 'Orders', pathPrefixes: ['src/orders'] },
  { id: 'billing', name: 'Billing', pathPrefixes: ['src/billing'] },
];

test('a commit that adds a dependency between components is an architectural change; one inside a component is not', () => {
  const base = graph([]);
  const cross = commitComponentImpact({ before: base, after: graph([['src/billing/bill.ts', 'src/orders/order.ts']]), components });
  assert.deepEqual(cross, { components: ['billing', 'orders'], edges: [{ source: 'billing', target: 'orders', added: 1, removed: 0 }], architectural: true });
  const inside = commitComponentImpact({ before: base, after: graph([['src/billing/bill.ts', 'src/billing/tax.ts']]), components });
  assert.deepEqual([inside.components, inside.edges, inside.architectural], [['billing'], [], false]);
  assert.equal(commitComponentImpact({ before: null, after: graph([['src/billing/bill.ts', 'src/orders/order.ts']]), components }).architectural, false, 'the first mined commit has nothing to compare with');
});

function world({ withDiagram = true } = {}) {
  const repo = new InMemoryTaskRepository();
  const at = new Date('2026-11-16T06:00:00Z');
  repo.tasks.push({ id: 't1', projectId: 'p1', key: 'T47', removed: false, lastImportedAt: at }, { id: 't2', projectId: 'p1', key: 'T48', removed: false, lastImportedAt: at });
  const link = (hash, title, source = 'subject') => ({ projectId: 'p1', taskKey: 'T47', hash, fullHash: null, title, author: 'a', date: at, source, linkedAt: at });
  repo.links.push(link('aaaaaaa', 'feat(billing): T47 bill reads orders', 'trailer'), link('bbbbbbb', 'refactor(billing): T47 split tax'), link('ccccccc', 'chore: T47 gone'));
  const commits = {
    aaaaaaa: { depAdded: 1, depRemoved: 0, graph: graph([['src/billing/bill.ts', 'src/orders/order.ts']]), baseGraph: graph([]), evidenceId: 'ev1' },
    bbbbbbb: { depAdded: 1, depRemoved: 0, graph: graph([['src/billing/bill.ts', 'src/orders/order.ts'], ['src/billing/bill.ts', 'src/billing/tax.ts']]), baseGraph: graph([['src/billing/bill.ts', 'src/orders/order.ts']]), evidenceId: 'ev2' },
  };
  const workspaces = { findByProjectId: async () => (withDiagram ? { diagram: { components, confirmedAt: at } } : { diagram: { components: [{ id: 'x', name: 'X', pathPrefixes: [] }] } }) };
  return new TaskImpactUseCase(repo, { ofCommit: async (_p, hash) => commits[hash] ?? null }, workspaces);
}

test('DS-07a: T47 lists its commits with their dependencies, components and evidence', async () => {
  const impact = await world().execute('p1', 't47');
  assert.equal(impact.key, 'T47');
  assert.deepEqual(impact.diagram, { confirmed: true, components: 2 });
  const byHash = Object.fromEntries(impact.commits.map(c => [c.hash, c]));
  assert.deepEqual(byHash.aaaaaaa.edges, [{ source: 'Billing', target: 'Orders', added: 1, removed: 0 }]);
  assert.deepEqual([byHash.aaaaaaa.components, byHash.aaaaaaa.evidenceId, byHash.aaaaaaa.source], [['Billing', 'Orders'], 'ev1', 'trailer']);
  assert.deepEqual([byHash.bbbbbbb.components, byHash.bbbbbbb.edges], [['Billing'], []], 'an import inside Billing changes no component dependency');
  assert.deepEqual([byHash.ccccccc.mined, byHash.ccccccc.evidenceId], [false, null], 'a commit no longer mined is listed, not dropped');
  assert.deepEqual(impact.totals, { commits: 3, depAdded: 2, depRemoved: 0, components: ['Billing', 'Orders'], architecturalCommits: 1 });
});

test('without path prefixes on the diagram, dependencies are still shown and components are not guessed', async () => {
  const impact = await world({ withDiagram: false }).execute('p1', 'T47');
  assert.equal(impact.diagram, null);
  assert.ok(impact.commits.every(c => c.components.length === 0 && c.edges.length === 0));
  assert.equal(impact.totals.depAdded, 2);
});

test('a task with no commit, and a key that is no task, are told apart', async () => {
  const uc = world();
  assert.deepEqual((await uc.execute('p1', 'T48')).commits, []);
  await assert.rejects(uc.execute('p1', 'T99'), e => e.statusCode === 404);
  await assert.rejects(uc.execute('p2', 'T47'), e => e.statusCode === 404, 'tasks of another project are not reachable');
});

// ── On MongoDB: the snapshot, its base and its evidence ──────────────────────
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
let connected = false;
before(async () => {
  try { await mongoose.connect(uri, { dbName: `archtime_test_taskimpact_${randomUUID().slice(0, 8)}`, serverSelectionTimeoutMS: 1500 }); connected = true; } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('the Mongo source reads the commit\'s snapshot, the snapshot it was measured against, and its evidence', async t => {
  if (!connected) return t.skip('MongoDB is not reachable');
  const base = { projectId: 'pm', author: 'a', title: 't', branches: [] };
  await SnapshotModel.insertMany([
    { ...base, hash: '1111111', fullHash: '1'.repeat(40), baseHash: '', date: new Date('2026-11-01'), ...graph([]) },
    { ...base, hash: '2222222', fullHash: '2'.repeat(40), baseHash: '1'.repeat(40), depAdded: 1, date: new Date('2026-11-02'), ...graph([['src/billing/bill.ts', 'src/orders/order.ts']]) },
    { ...base, hash: '3333333', fullHash: '3'.repeat(40), date: new Date('2026-11-03'), missingSince: new Date(), ...graph([]) },
  ]);
  const [evidence] = await EvidenceModel.insertMany([{ projectId: 'pm', changeTitle: 'c', type: 'DEPENDENCY CHANGE', repository: 'r', commit: '2222222', date: new Date('2026-11-02'), summary: 's' }]);
  const second = await mongoCommitArchitecture.ofCommit('pm', '2222222');
  assert.deepEqual([second.depAdded, second.graph.edges.length, second.baseGraph.edges.length, second.evidenceId], [1, 1, 0, String(evidence._id)]);
  const first = await mongoCommitArchitecture.ofCommit('pm', '1111111');
  assert.deepEqual([first.baseGraph, first.evidenceId], [null, null]);
  assert.equal(await mongoCommitArchitecture.ofCommit('pm', '3333333'), null, 'force-pushed away');
  assert.equal(await mongoCommitArchitecture.ofCommit('other', '2222222'), null, 'another project');
});
