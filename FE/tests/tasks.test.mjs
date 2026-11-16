import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks, importSummary, progressLabel, readBoard } from '../src/features/tasks.ts';
import { canAccess } from '../src/auth/permissions.ts';
import { navGroupsFor } from '../src/components/layout/navigation.ts';

// F-13 Tasks & Sprints page (WF-07): how the board is read, filtered and worded.

const task = (key, extra = {}) => ({ id: key, key, summary: `Do ${key}`, status: 'To Do', statusCategory: 'todo', assignee: 'Mia', storyPoints: 1, sprintId: 'jira:1', sprintName: 'Sprint 1', removed: false, removedAt: null, commits: [], ...extra });
const progress = (done, total) => ({ done, total, percent: total ? Math.round((done / total) * 100) : null, pointsDone: done, pointsTotal: total });

test('progress reads Done / total, and an empty sprint says so instead of 0 %', () => {
  assert.equal(progressLabel(progress(2, 3)), '2 / 3 done (67 %)');
  assert.equal(progressLabel(progress(0, 0)), 'No tasks');
  assert.equal(progressLabel(progress(0, 4)), '0 / 4 done (0 %)');
});

test('filter: removed tasks are hidden unless asked for; by sprint, backlog and text', () => {
  const tasks = [task('ARCH-1'), task('ARCH-2', { removed: true }), task('ARCH-3', { sprintId: null, sprintName: null, assignee: 'Truong' }), task('T22', { sprintId: 'jira:2' })];
  const keys = f => filterTasks(tasks, { sprint: 'all', showRemoved: false, query: '', ...f }).map(t => t.key);
  assert.deepEqual(keys({}), ['ARCH-1', 'ARCH-3', 'T22']);
  assert.deepEqual(keys({ showRemoved: true }), ['ARCH-1', 'ARCH-2', 'ARCH-3', 'T22']);
  assert.deepEqual(keys({ sprint: 'jira:1' }), ['ARCH-1']);
  assert.deepEqual(keys({ sprint: 'backlog' }), ['ARCH-3']);
  assert.deepEqual(keys({ query: 'truong' }), ['ARCH-3']);
  assert.deepEqual(keys({ query: 't22' }), ['T22']);
});

test('a malformed board is refused rather than half rendered', () => {
  const good = { tasks: [task('ARCH-1')], sprints: [{ id: 's', sprintId: 'jira:1', name: 'Sprint 1', state: 'active', startDate: null, endDate: null, removed: false, progress: progress(0, 1) }], backlog: progress(0, 0), totals: { tasks: 1, removed: 0, linkedCommits: 0 }, lastImportedAt: null };
  assert.equal(readBoard(good).tasks.length, 1);
  assert.throws(() => readBoard({ ...good, tasks: [{ key: 'x' }] }), /invalid task board/);
  assert.throws(() => readBoard({ ...good, sprints: [{ name: 'x' }] }), /invalid task board/);
  assert.throws(() => readBoard(null), /invalid task board/);
});

test('the import summary names what changed and the keys that are no task here', () => {
  const r = { created: 2, updated: 1, unchanged: 3, removed: 1, restored: 0, sprints: 1, sprintsRemoved: 0, links: { commits: 9, linked: 4, unknownKeys: ['ARCH-404'] } };
  assert.equal(importSummary(r), 'Imported: 2 new, 1 updated, 3 unchanged, 1 marked removed. 4 new commit links. Commits also name ARCH-404, which are not tasks here.');
});

test('Tasks & Sprints is a page of every developer-analyst, in the Analyze group; administrators do not get it', () => {
  assert.equal(canAccess('developer-analyst', '/tasks'), true);
  assert.equal(canAccess('system-administrator', '/tasks'), false);
  const analyze = navGroupsFor('developer-analyst').find(g => g.label === 'Analyze');
  assert.ok(analyze.items.some(i => i.path === '/tasks' && i.label === 'Tasks & Sprints'));
});

// ── DS-07a: a task's architectural impact ────────────────────────────────────
import { edgeLabel, fetchTaskImpact, impactSummary, readTaskImpact } from '../src/features/tasks.ts';
import { mockGlobal } from './mock-global.mjs';

const impact = (over = {}) => ({
  key: 'T47', diagram: { confirmed: true, components: 2 },
  commits: [{ hash: 'aaaaaaa', title: 't', date: '2026-11-16', source: 'subject', mined: true, depAdded: 1, depRemoved: 0, evidenceId: 'ev1', components: ['Billing', 'Orders'], edges: [{ source: 'Billing', target: 'Orders', added: 1, removed: 0 }] }],
  totals: { commits: 1, depAdded: 1, depRemoved: 0, components: ['Billing', 'Orders'], architecturalCommits: 1 },
  ...over,
});

test('a task impact is worded: changed dependencies between components, and where', () => {
  assert.equal(edgeLabel({ source: 'Billing', target: 'Orders', added: 1, removed: 2 }), 'Billing → Orders +1 −2');
  assert.equal(impactSummary(impact()), '1 commit, 1 changing dependencies between components in Billing, Orders; 1 dependency added, 0 removed.');
  assert.match(impactSummary(impact({ diagram: null })), /Map path prefixes in the Component Diagram/);
  assert.equal(impactSummary(impact({ commits: [] })), 'No commit names this task yet.');
  assert.throws(() => readTaskImpact({ key: 'T47' }), /invalid task impact/);
});

test('the impact is asked for the task by key, in its workspace', async (t) => {
  mockGlobal(t, 'sessionStorage', { getItem: k => (k === 'accessToken' ? 'token' : null), setItem() {}, removeItem() {} });
  mockGlobal(t, 'localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  const asked = [];
  t.mock.method(globalThis, 'fetch', async url => { asked.push(String(url)); return Response.json({ success: true, data: impact() }); });
  assert.equal((await fetchTaskImpact('p 1', 'T47')).totals.architecturalCommits, 1);
  assert.match(asked[0], /\/projects\/p%201\/tasks\/T47\/impact$/);
});
