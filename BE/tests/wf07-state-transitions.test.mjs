import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportTasksUseCase, LinkCommitsToTasksUseCase, ListTasksUseCase } from '../src/application/use-cases/tasks/TaskUseCases.ts';
import { InMemoryTaskRepository, minedCommits } from './task-fakes.mjs';

// WF-07 state transition tests (BM04 §6.7: SM-09 (4), SM-10 (2)), one per transition. Jira is the source of truth for
// states: a transition reaches ArchTime when a later export is imported. Each test checks that the task or sprint is
// changed in place (no second copy), that its state is the new one, and that sprint progress follows.
//   SM-09 Task:   To Do → In Progress → In Review → Done, and In Review → In Progress (rework)
//   SM-10 Sprint: Future → Active → Closed

const CATEGORY = { 'To Do': 'new', 'In Progress': 'indeterminate', 'In Review': 'indeterminate', Done: 'done' };
const task = (key, status, sprint = { id: 1, name: 'Sprint 1', state: 'active' }) => ({
  key, fields: { summary: key, status: { name: status, statusCategory: { key: CATEGORY[status] } }, customfield_10020: [sprint] },
});
const file = (...issues) => JSON.stringify({ issues });

function setup() {
  const repo = new InMemoryTaskRepository();
  let t = Date.UTC(2026, 10, 16);
  const now = () => new Date(t += 1000);
  const link = new LinkCommitsToTasksUseCase(repo, minedCommits(), now);
  const importTasks = new ImportTasksUseCase(repo, link, now);
  const board = async () => new ListTasksUseCase(repo).execute('p1');
  const stateOf = async key => (await board()).tasks.find(x => x.key === key);
  return { repo, importTasks, board, stateOf };
}

/** Imports `from`, then `to`, and returns the task before and after, the second import's summary and the board. */
async function transition(from, to) {
  const s = setup();
  await s.importTasks.execute('p1', file(task('ARCH-1', from), task('ARCH-2', 'Done')));
  const before = await s.stateOf('ARCH-1');
  const result = await s.importTasks.execute('p1', file(task('ARCH-1', to), task('ARCH-2', 'Done')));
  const after = await s.stateOf('ARCH-1');
  return { before, after, result, board: await s.board(), repo: s.repo };
}

const inPlace = ({ before, after, result, repo }) => {
  assert.equal(after.id, before.id, 'the same task, changed in place');
  assert.equal(result.updated, 1);
  assert.equal(result.created, 0);
  assert.equal(repo.tasks.length, 2, 'no second copy');
};

test('SM-09 T1 Task To Do → In Progress', async () => {
  const r = await transition('To Do', 'In Progress');
  inPlace(r);
  assert.deepEqual([r.before.status, r.before.statusCategory], ['To Do', 'todo']);
  assert.deepEqual([r.after.status, r.after.statusCategory], ['In Progress', 'in-progress']);
  assert.deepEqual([r.board.sprints[0].progress.done, r.board.sprints[0].progress.total], [1, 2], 'still not done');
});

test('SM-09 T2 Task In Progress → In Review', async () => {
  const r = await transition('In Progress', 'In Review');
  inPlace(r);
  assert.deepEqual([r.after.status, r.after.statusCategory], ['In Review', 'in-progress'], 'In Review is work in progress, not done');
  assert.equal(r.board.sprints[0].progress.done, 1);
});

test('SM-09 T3 Task In Review → Done: sprint progress counts it', async () => {
  const r = await transition('In Review', 'Done');
  inPlace(r);
  assert.deepEqual([r.after.status, r.after.statusCategory], ['Done', 'done']);
  assert.deepEqual([r.board.sprints[0].progress.done, r.board.sprints[0].progress.total, r.board.sprints[0].progress.percent], [2, 2, 100]);
});

test('SM-09 T4 Task In Review → In Progress (sent back for rework)', async () => {
  const r = await transition('In Review', 'In Progress');
  inPlace(r);
  assert.deepEqual([r.after.status, r.after.statusCategory], ['In Progress', 'in-progress']);
  // And a task that had been Done and is reopened leaves the sprint's done count.
  const reopened = await transition('Done', 'In Progress');
  assert.deepEqual([reopened.board.sprints[0].progress.done, reopened.board.sprints[0].progress.total], [1, 2]);
});

/** Imports the sprint in state `from`, then `to`; returns the sprint before and after and the board. */
async function sprintTransition(from, to) {
  const s = setup();
  const sprint = state => ({ id: 7, name: 'Sprint 7', state, startDate: '2026-11-15T00:00:00Z', endDate: '2026-11-28T00:00:00Z' });
  await s.importTasks.execute('p1', file(task('ARCH-1', 'Done', sprint(from)), task('ARCH-2', 'To Do', sprint(from)), task('ARCH-3', 'To Do', { id: 1, name: 'Sprint 1', state: 'active' })));
  const before = (await s.board()).sprints.find(x => x.sprintId === 'jira:7');
  const result = await s.importTasks.execute('p1', file(task('ARCH-1', 'Done', sprint(to)), task('ARCH-2', 'To Do', sprint(to)), task('ARCH-3', 'To Do', { id: 1, name: 'Sprint 1', state: 'active' })));
  const board = await s.board();
  return { before, after: board.sprints.find(x => x.sprintId === 'jira:7'), board, result, repo: s.repo };
}

test('SM-10 S1 Sprint Future → Active: moves to the front of the board with its progress', async () => {
  const r = await sprintTransition('future', 'active');
  assert.equal(r.before.state, 'future');
  assert.equal(r.after.state, 'active');
  assert.equal(r.after.id, r.before.id, 'the same sprint, changed in place');
  assert.equal(r.repo.sprints.length, 2, 'no second copy');
  assert.equal(r.result.sprints, 2);
  assert.ok(r.board.sprints.slice(0, 2).every(s => s.state === 'active'), 'active sprints are listed first');
  assert.deepEqual([r.after.progress.done, r.after.progress.total], [1, 2]);
});

test('SM-10 S2 Sprint Active → Closed: listed after the open sprints, its tasks and progress kept', async () => {
  const r = await sprintTransition('active', 'closed');
  assert.deepEqual([r.before.state, r.after.state], ['active', 'closed']);
  assert.equal(r.after.id, r.before.id);
  assert.deepEqual(r.board.sprints.map(s => s.state), ['active', 'closed'], 'a closed sprint comes after the active one');
  assert.deepEqual([r.after.progress.done, r.after.progress.total, r.after.progress.percent], [1, 2, 50], 'its tasks still count');
  assert.equal(r.after.removed, false, 'closed is not removed');
});
