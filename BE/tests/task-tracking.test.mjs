import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport, sprintProgress, taskKeysOf } from '../src/domain/tasks/tasks.ts';
import { parseJiraExport } from '../src/domain/tasks/jiraExport.ts';
import { ImportTasksUseCase, LinkCommitsToTasksUseCase, ListTasksUseCase } from '../src/application/use-cases/tasks/TaskUseCases.ts';
import { InMemoryTaskRepository, minedCommits } from './task-fakes.mjs';

// T4 / F-13 (RF-07, UC-36 – UC-39, SDD §3.14): tasks and sprints imported from Jira, re-imports that update instead of
// duplicating and mark missing tasks removed, commits linked to the tasks their message names, and sprint progress
// = Done / total.

const sprint = (id, name, state = 'active') => ({ id, name, state, startDate: '2026-11-01T00:00:00Z', endDate: '2026-11-14T00:00:00Z' });
const issue = (key, { status = 'To Do', done = false, sprints = [sprint(1, 'Sprint 1')], points = 1, summary } = {}) => ({
  key,
  fields: {
    summary: summary ?? `Task ${key}`,
    status: { name: done ? 'Done' : status, statusCategory: { key: done ? 'done' : 'new' } },
    assignee: { displayName: 'Truong' },
    customfield_10016: points,
    customfield_10020: sprints,
  },
});
const file = (...issues) => JSON.stringify({ issues });
const clock = (start = Date.UTC(2026, 10, 16)) => { let t = start; return () => new Date(t += 1000); };

function setup(commits = []) {
  const repo = new InMemoryTaskRepository();
  const source = minedCommits(commits);
  const now = clock();
  const link = new LinkCommitsToTasksUseCase(repo, source, now);
  return { repo, source, link, importTasks: new ImportTasksUseCase(repo, link, now), list: new ListTasksUseCase(repo) };
}

// ── Commit → keys ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('taskKeysOf finds ARCH-12 and T22 in the subject and in Task: trailers, each once, trailers first', () => {
  assert.deepEqual(taskKeysOf({ title: 'feat(tasks): ARCH-12 import parser for T22' }), [
    { key: 'ARCH-12', source: 'subject' }, { key: 'T22', source: 'subject' },
  ]);
  assert.deepEqual(taskKeysOf({ title: 'fix: ARCH-12 again', trailers: ['Task: t22, ARCH-12', 'Arch-Change: none', 'Reviewed-by: T99'] }), [
    { key: 'T22', source: 'trailer' }, { key: 'ARCH-12', source: 'trailer' },
  ]);
  // Not keys: lower case in the subject, parts of longer words or paths, hashes.
  assert.deepEqual(taskKeysOf({ title: 'chore: bump arch-12, XARCH-12x, src/T22.ts, T22x, abc123' }), []);
  // A key at the end of a sentence or in brackets still counts.
  assert.deepEqual(taskKeysOf({ title: 'Merge (ARCH-3) and finish T7.' }).map(k => k.key), ['ARCH-3', 'T7']);
  assert.deepEqual(taskKeysOf({ title: '' }), []);
});

// ── Import ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('ImportTasksUseCase creates tasks and sprints, and importing the same file again creates nothing', async () => {
  const { repo, importTasks } = setup();
  const exportFile = file(issue('ARCH-1'), issue('ARCH-2', { done: true }));
  const first = await importTasks.execute('p1', exportFile);
  assert.deepEqual({ created: first.created, updated: first.updated, removed: first.removed, sprints: first.sprints }, { created: 2, updated: 0, removed: 0, sprints: 1 });

  const second = await importTasks.execute('p1', exportFile);
  assert.deepEqual({ created: second.created, updated: second.updated, unchanged: second.unchanged }, { created: 0, updated: 0, unchanged: 2 });
  assert.equal(repo.tasks.length, 2, 'no duplicate task after re-import');
  assert.equal(repo.sprints.length, 1, 'no duplicate sprint after re-import');
});

test('a re-import updates changed tasks in place, marks missing ones removed, and restores them when they come back', async () => {
  const { repo, importTasks, list } = setup();
  await importTasks.execute('p1', file(issue('ARCH-1'), issue('ARCH-2'), issue('ARCH-3')));
  const idBefore = repo.tasks.find(t => t.key === 'ARCH-1').id;

  const r = await importTasks.execute('p1', file(issue('ARCH-1', { done: true, summary: 'Renamed' }), issue('ARCH-2')));
  assert.deepEqual({ created: r.created, updated: r.updated, unchanged: r.unchanged, removed: r.removed }, { created: 0, updated: 1, unchanged: 1, removed: 1 });
  const a1 = repo.tasks.find(t => t.key === 'ARCH-1');
  assert.equal(a1.id, idBefore, 'updated in place');
  assert.equal(a1.summary, 'Renamed');
  assert.equal(a1.statusCategory, 'done');
  const a3 = repo.tasks.find(t => t.key === 'ARCH-3');
  assert.equal(a3.removed, true, 'kept, marked removed');
  assert.ok(a3.removedAt instanceof Date);
  assert.equal(a3.summary, 'Task ARCH-3', 'its history is kept');

  // Removing again does not touch the removal date; coming back restores it.
  const removedAt = a3.removedAt;
  await importTasks.execute('p1', file(issue('ARCH-1', { done: true, summary: 'Renamed' }), issue('ARCH-2')));
  assert.equal(repo.tasks.find(t => t.key === 'ARCH-3').removedAt, removedAt);
  const back = await importTasks.execute('p1', file(issue('ARCH-1', { done: true, summary: 'Renamed' }), issue('ARCH-2'), issue('ARCH-3')));
  assert.equal(back.restored, 1);
  assert.equal(repo.tasks.find(t => t.key === 'ARCH-3').removed, false);

  const board = await list.execute('p1');
  assert.equal(board.totals.tasks, 3);
  assert.equal(board.totals.removed, 0);
});

test('a refused file (MSG22) writes nothing: existing tasks are neither changed nor marked removed', async () => {
  const { repo, importTasks } = setup();
  await importTasks.execute('p1', file(issue('ARCH-1'), issue('ARCH-2')));
  const before = JSON.stringify(repo.tasks);
  await assert.rejects(importTasks.execute('p1', file(issue('ARCH-1'), { fields: { summary: 'no key' } })), err => {
    assert.equal(err.statusCode, 400);
    assert.equal(err.fields.messageId, 'MSG22');
    assert.equal(err.fields.task, '2');
    return true;
  });
  await assert.rejects(importTasks.execute('p1', '{not json'), err => err.statusCode === 400 && !err.fields.messageId);
  await assert.rejects(importTasks.execute('p1', undefined), err => err.statusCode === 400);
  assert.equal(JSON.stringify(repo.tasks), before);
});

test('tasks of different projects never mix', async () => {
  const { repo, importTasks } = setup();
  await importTasks.execute('p1', file(issue('ARCH-1')));
  await importTasks.execute('p2', file(issue('ARCH-9')));
  assert.deepEqual((await repo.listTasks('p1')).map(t => t.key), ['ARCH-1']);
  assert.equal((await repo.listTasks('p1')).every(t => !t.removed), true, 'importing p2 did not remove p1 tasks');
});

// ── Linking ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const commit = (hash, title, trailers = [], day = 1) => ({ hash, fullHash: hash.padEnd(40, '0'), title, trailers, author: 'dev@x.io', date: new Date(Date.UTC(2026, 10, day)) });

test('LinkCommitsToTasksUseCase links commits to the tasks they name, once, and reports unknown keys', async () => {
  const { repo, importTasks, link } = setup();
  await importTasks.execute('p1', file(issue('ARCH-12'), issue('T22')));
  const batch = [
    commit('aaaaaaa', 'feat(tasks): ARCH-12 parser'),
    commit('bbbbbbb', 'fix(tasks): edge cases', ['Task: T22, ARCH-12']),
    commit('ccccccc', 'docs: mention ARCH-99 and HTTP2'),
  ];
  const r = await link.execute('p1', batch);
  assert.deepEqual(r, { commits: 3, linked: 3, unknownKeys: ['ARCH-99', 'HTTP2'] });
  // Linking the same batch again (a retried batch, a relink) adds nothing.
  assert.equal((await link.execute('p1', batch)).linked, 0);
  assert.equal(repo.links.length, 3);
  assert.deepEqual(repo.links.filter(l => l.taskKey === 'ARCH-12').map(l => [l.hash, l.source]).sort(), [['aaaaaaa', 'subject'], ['bbbbbbb', 'trailer']]);
});

test('importing links commits mined before the tasks existed; removed tasks keep their commits', async () => {
  const { importTasks, list } = setup([commit('aaaaaaa', 'feat: ARCH-1 first', [], 1), commit('bbbbbbb', 'feat: ARCH-2 second', [], 2)]);
  const first = await importTasks.execute('p1', file(issue('ARCH-1'), issue('ARCH-2')));
  assert.equal(first.links.linked, 2);
  await importTasks.execute('p1', file(issue('ARCH-1')));
  const board = await list.execute('p1');
  const a2 = board.tasks.find(t => t.key === 'ARCH-2');
  assert.equal(a2.removed, true);
  assert.deepEqual(a2.commits.map(c => c.hash), ['bbbbbbb']);
  assert.equal(board.totals.linkedCommits, 2);
});

test('an empty batch, or commits without any key, link nothing and never fail', async () => {
  const { link, importTasks } = setup();
  assert.deepEqual(await link.execute('p1', []), { commits: 0, linked: 0, unknownKeys: [] });
  await importTasks.execute('p1', file(issue('ARCH-1')));
  assert.deepEqual(await link.execute('p1', [commit('aaaaaaa', 'chore: tidy up'), { hash: '', title: 'ARCH-1' }]), { commits: 2, linked: 0, unknownKeys: [] });
});

// ── Sprint progress ───────────────────────────────────────────────────────────────────────────────────────────────────

test('sprint progress = Done / total, removed tasks left out, an empty sprint has no percentage', () => {
  const t = (statusCategory, removed = false, storyPoints = 2) => ({ statusCategory, removed, storyPoints });
  assert.deepEqual(sprintProgress([t('done'), t('todo'), t('in-progress'), t('done', true)]), { done: 1, total: 3, percent: 33, pointsDone: 2, pointsTotal: 6 });
  assert.deepEqual(sprintProgress([]), { done: 0, total: 0, percent: null, pointsDone: 0, pointsTotal: 0 });
  assert.deepEqual(sprintProgress([t('done', true)]), { done: 0, total: 0, percent: null, pointsDone: 0, pointsTotal: 0 });
  assert.equal(sprintProgress([t('done', false, null)]).percent, 100);
});

test('the board lists sprints active first with their progress, the backlog, and each task\'s sprint name', async () => {
  const { importTasks, list } = setup();
  await importTasks.execute('p1', file(
    issue('ARCH-1', { done: true }),
    issue('ARCH-2'),
    issue('ARCH-3', { sprints: [sprint(2, 'Sprint 2', 'future')] }),
    issue('ARCH-4', { sprints: null }),
  ));
  const board = await list.execute('p1');
  assert.deepEqual(board.sprints.map(s => [s.name, s.progress.done, s.progress.total, s.progress.percent]), [['Sprint 1', 1, 2, 50], ['Sprint 2', 0, 1, 0]]);
  assert.deepEqual([board.backlog.done, board.backlog.total], [0, 1]);
  assert.equal(board.tasks.find(t => t.key === 'ARCH-3').sprintName, 'Sprint 2');
  assert.equal(board.tasks.find(t => t.key === 'ARCH-4').sprintName, null);
  assert.ok(!('projectId' in board.tasks[0]));

  // A sprint the next export no longer has is marked removed and listed last.
  await importTasks.execute('p1', file(issue('ARCH-1', { done: true }), issue('ARCH-2')));
  const after = await list.execute('p1');
  assert.deepEqual(after.sprints.map(s => [s.name, s.removed]), [['Sprint 1', false], ['Sprint 2', true]]);
  assert.equal(after.sprints[1].progress.total, 0, 'its only task was removed');
});

test('planImport is a pure diff: create, update, unchanged, remove, restore', () => {
  const parsed = parseJiraExport(file(issue('A-1'), issue('A-2', { done: true }), issue('A-4')));
  const existing = {
    tasks: [
      { key: 'A-1', summary: 'Task A-1', status: 'To Do', statusCategory: 'todo', assignee: 'Truong', storyPoints: 1, sprintId: 'jira:1', removed: false },
      { key: 'A-2', summary: 'Task A-2', status: 'To Do', statusCategory: 'todo', assignee: 'Truong', storyPoints: 1, sprintId: 'jira:1', removed: false },
      { key: 'A-3', summary: 'gone', status: null, statusCategory: 'todo', assignee: null, storyPoints: null, sprintId: null, removed: false },
      { key: 'A-4', summary: 'Task A-4', status: 'To Do', statusCategory: 'todo', assignee: 'Truong', storyPoints: 1, sprintId: 'jira:1', removed: true },
    ],
    sprints: [{ sprintId: 'jira:1' }, { sprintId: 'jira:0' }],
  };
  const plan = planImport(existing, parsed);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.update.map(t => t.key), ['A-2', 'A-4']);
  assert.deepEqual(plan.unchanged, ['A-1']);
  assert.deepEqual(plan.remove, ['A-3']);
  assert.deepEqual(plan.restore, ['A-4']);
  assert.deepEqual(plan.sprints.remove, ['jira:0']);
});

test('an export larger than the old 2 MB limit is imported; over 20 MB is refused before parsing', async () => {
  const { repo, importTasks } = setup();
  // 3,000 issues with long summaries: over 3 MB of JSON. (Few issues, so the in-memory store of this test stays quick.)
  const issues = Array.from({ length: 3000 }, (_, i) => issue(`BIG-${i + 1}`, { summary: `Task ${i + 1} ${'with a long description '.repeat(40)}` }));
  const text = file(...issues);
  assert.ok(text.length > 3_000_000, `${text.length} characters`);
  const r = await importTasks.execute('p1', text);
  assert.equal(r.created, 3000);
  assert.equal(repo.tasks.length, 3000);
  await assert.rejects(importTasks.execute('p1', ' '.repeat(20_000_001)), err => err.statusCode === 400 && /larger than 20 MB/.test(err.message));
});
