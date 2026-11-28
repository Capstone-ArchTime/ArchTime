import test from 'node:test';
import assert from 'node:assert/strict';
import { taskContextFor, buildAgentsMd } from '../src/domain/agent/context.ts';
import { AgentContextUseCases } from '../src/application/use-cases/agent/AgentUseCases.ts';
import { InMemoryTaskRepository } from './task-fakes.mjs';

// UC-43 Generate Task Context Pack (FE-16, RF-09, BR-30, BR-31): with a project token, a coding agent sends a task key
// and gets the task, the components its linked commits touched and, for each, the components it may and may not depend
// on (with the rule and its reason) and its ADRs. Names, rules and decisions only: never source code or a patch.

const at = new Date('2026-11-20T08:00:00Z');
const workspace = (confirmedAt = new Date('2026-11-10T00:00:00Z')) => ({
  revision: 4,
  diagram: {
    components: [
      { id: 'web', name: 'Web', kind: 'UI', description: 'The pages', pathPrefixes: ['FE/src'] },
      { id: 'billing', name: 'Billing', kind: 'Service', description: 'Invoices', pathPrefixes: ['BE/src/billing'] },
      { id: 'orders', name: 'Orders', kind: 'Service', description: 'Order lifecycle', pathPrefixes: ['BE/src/orders'] },
      { id: 'db', name: 'Database', kind: 'Database', description: 'Persistence', pathPrefixes: ['BE/src/db'] },
    ],
    dependencies: [
      { id: 'e1', source: 'billing', target: 'db', label: 'SQL' },
      { id: 'e2', source: 'web', target: 'billing', label: 'HTTPS' },
    ],
    revision: 4, confirmedAt, baselineCommit: 'abc1234def',
  },
  rules: [
    { id: 'r1', name: 'Billing never reads Orders', source: 'billing', target: 'orders', constraint: 'forbidden', severity: 'error', rationale: 'Events only.', enabled: true },
    { id: 'r2', name: 'Web never touches the database', source: 'web', target: 'db', constraint: 'forbidden', severity: 'error', rationale: 'Go through the API.', enabled: true },
  ],
  decisions: [
    { id: 'a1', number: 1, title: 'Invoices are immutable', status: 'Accepted', decision: 'Corrections are new invoices.', consequences: 'More rows.', componentIds: ['billing'] },
    { id: 'a2', number: 2, title: 'Old pricing', status: 'Deprecated', decision: 'x', consequences: '', componentIds: ['billing'] },
    { id: 'a3', number: 3, title: 'Orders own the cart', status: 'Accepted', decision: 'y', consequences: '', componentIds: ['orders'] },
  ],
});

const graph = edges => ({
  nodes: ['BE/src/billing/bill.ts', 'BE/src/billing/tax.ts', 'BE/src/db/conn.ts', 'BE/src/orders/order.ts', 'FE/src/page.tsx'].map(id => ({ id })),
  edges: edges.map(([source, target]) => ({ source, target })),
});

/** Two workspaces with their tasks; SHOP-47 has commits touching Billing and Database, SHOP-48 none. */
function world({ ws = workspace() } = {}) {
  const repo = new InMemoryTaskRepository();
  const task = (projectId, key, summary, status) => ({ id: `${projectId}-${key}`, projectId, key, summary, status, statusCategory: 'in-progress', assignee: null, storyPoints: null, sprintId: null, removed: false, removedAt: null, lastImportedAt: at, createdAt: at, updatedAt: at });
  repo.tasks.push(task('p1', 'SHOP-47', 'Bill reads the database', 'In Progress'), task('p1', 'SHOP-48', 'Nothing yet', 'To Do'), task('p2', 'OTHER-1', 'Secret Bravo task', 'Done'));
  const link = (projectId, taskKey, hash, title) => ({ projectId, taskKey, hash, fullHash: null, title, author: 'a', date: at, source: 'subject', linkedAt: at });
  repo.links.push(
    link('p1', 'SHOP-47', 'aaaaaaa', 'feat(billing): SHOP-47 bill writes through db'),
    link('p1', 'SHOP-47', 'bbbbbbb', 'refactor(billing): SHOP-47 split tax'),
    link('p1', 'SHOP-47', 'ccccccc', 'chore: SHOP-47 force-pushed away'),
    link('p2', 'OTHER-1', 'ddddddd', 'feat: OTHER-1 Bravo'),
  );
  const commits = {
    'p1:aaaaaaa': { depAdded: 1, depRemoved: 0, graph: graph([['BE/src/billing/bill.ts', 'BE/src/db/conn.ts']]), baseGraph: graph([]), evidenceId: 'ev1' },
    'p1:bbbbbbb': { depAdded: 1, depRemoved: 0, graph: graph([['BE/src/billing/bill.ts', 'BE/src/db/conn.ts'], ['BE/src/billing/bill.ts', 'BE/src/billing/tax.ts']]), baseGraph: graph([['BE/src/billing/bill.ts', 'BE/src/db/conn.ts']]), evidenceId: 'ev2' },
    'p2:ddddddd': { depAdded: 1, depRemoved: 0, graph: graph([['FE/src/page.tsx', 'BE/src/orders/order.ts']]), baseGraph: graph([]), evidenceId: 'ev3' },
  };
  const workspaces = { findByProjectId: async () => ws };
  const projects = { findById: async id => ({ id, name: 'Shop' }) };
  return new AgentContextUseCases(workspaces, projects, 'http://api', undefined,
    { tasks: repo, commits: { ofCommit: async (p, hash) => commits[`${p}:${hash}`] ?? null } });
}

test('UC-43-01: a valid token gets the task, the components its commits touched, their rules and ADRs', async () => {
  const pack = await world().taskContext('p1', ' shop-47 ');
  assert.deepEqual(pack.task, { key: 'SHOP-47', summary: 'Bill reads the database', status: 'In Progress' });
  assert.deepEqual(pack.components.map(c => c.name), ['Billing', 'Database'], 'touched components, by name');
  const billing = pack.components.find(c => c.id === 'billing');
  assert.deepEqual(billing.allowedDependencies, [{ id: 'db', name: 'Database', kind: 'Database', reason: 'declared' }]);
  assert.deepEqual(billing.forbiddenDependencies, [{ id: 'orders', name: 'Orders', kind: 'Service', rule: 'Billing never reads Orders', severity: 'error', rationale: 'Events only.' }]);
  assert.deepEqual(billing.decisions.map(d => d.number), [1], 'deprecated ADRs are left out');
  const db = pack.components.find(c => c.id === 'db');
  assert.deepEqual(db.forbiddenCallers.map(c => [c.name, c.rule, c.rationale]), [['Web', 'Web never touches the database', 'Go through the API.']]);
  assert.deepEqual(pack.commits.map(c => [c.hash, c.mined]), [['aaaaaaa', true], ['bbbbbbb', true], ['ccccccc', false]]);
  assert.equal(pack.diagram.revision, 4);
  assert.match(pack.guidance.join(' '), /Task: SHOP-47/);
});

test('UC-43-02: a task key that is no task of the workspace is a 404 with a clear message; a missing key is a 400', async () => {
  await assert.rejects(world().taskContext('p1', 'SHOP-99'), e => e.statusCode === 404 && /Task SHOP-99 not found in this workspace/.test(e.message));
  await assert.rejects(world().taskContext('p1', undefined), e => e.statusCode === 400 && /\?task=/.test(e.message));
  await assert.rejects(world().taskContext('p1', '  '), e => e.statusCode === 400);
});

test('UC-43-03: a task with no commit has no components, and says how to ask about files instead', async () => {
  const pack = await world().taskContext('p1', 'SHOP-48');
  assert.deepEqual([pack.task.key, pack.commits, pack.components], ['SHOP-48', [], []]);
  assert.match(pack.guidance[0], /No commit names SHOP-48/);
});

test('UC-43-04 (N-08): the token decides the workspace, so another workspace\'s task is not found and leaks nothing', async () => {
  const uc = world();
  await assert.rejects(uc.taskContext('p1', 'OTHER-1'), e => e.statusCode === 404 && !/Bravo/.test(e.message));
  await assert.rejects(uc.taskContext('p2', 'SHOP-47'), e => e.statusCode === 404);
});

test('UC-43-05: an unconfirmed diagram is a 409, as for /agent/context', async () => {
  await assert.rejects(world({ ws: workspace(null) }).taskContext('p1', 'SHOP-47'), e => e.statusCode === 409 && /not confirmed/.test(e.message));
  await assert.rejects(world({ ws: null }).taskContext('p1', 'SHOP-47'), e => e.statusCode === 409);
});

test('UC-43-06 (BR-31): the pack holds names, rules and decisions only: no source code, no patch, no graph', async () => {
  const pack = await world().taskContext('p1', 'SHOP-47');
  const keys = new Set();
  const text = JSON.stringify(pack, (k, v) => { keys.add(k); return v; });
  for (const k of ['source', 'code', 'content', 'diff', 'patch', 'body', 'text', 'graph', 'baseGraph', 'edges', 'nodes', 'files']) assert.ok(!keys.has(k), k);
  assert.ok(!text.includes('BE/src/billing/bill.ts') && !text.includes('conn.ts'), 'no file of the commits is listed');
});

test('the pack lists only touched components that are on the diagram, sorted, and copes with commits outside every path', () => {
  const pack = taskContextFor({ key: 'K-1' }, [{ hash: 'x', mined: true }], ['orders', 'ghost', 'billing'], workspace());
  assert.deepEqual(pack.components.map(c => c.id), ['billing', 'orders']);
  assert.deepEqual(pack.task, { key: 'K-1', summary: '', status: null });
  const none = taskContextFor({ key: 'K-2' }, [{ hash: 'y', mined: false }], [], workspace());
  assert.match(none.guidance[0], /touch no component/);
});

test('AGENTS.md tells the agent how to ask for a task context pack', () => {
  const md = buildAgentsMd('Shop', workspace(), 'https://archtime.example/api/');
  assert.ok(md.includes('"https://archtime.example/api/agent/task-context?task=<TASK-KEY>"'));
});
