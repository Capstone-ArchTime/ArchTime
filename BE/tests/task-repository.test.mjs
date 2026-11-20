import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoTaskRepository, mongoMinedCommits } from '../src/infrastructure/repositories/MongoTaskRepository.ts';
import { SprintModel, TaskCommitModel, TaskModel } from '../src/infrastructure/database/models/TaskModels.ts';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';
import { ImportTasksUseCase, LinkCommitsToTasksUseCase, ListTasksUseCase } from '../src/application/use-cases/tasks/TaskUseCases.ts';

// F-13 on a real MongoDB (skipped when none is reachable; CI provides one and fails on skips): the unique indexes are
// what keep a re-import and a re-link from duplicating anything.
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_tasks_${randomUUID().slice(0, 8)}`;
let connected = false;
let unavailable = 'MongoDB is not reachable';

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await Promise.all([TaskModel.syncIndexes(), SprintModel.syncIndexes(), TaskCommitModel.syncIndexes(), SnapshotModel.syncIndexes()]);
    connected = true;
  } catch (err) {
    unavailable = `MongoDB is not usable: ${err.message}`;
  }
});
after(async () => {
  if (connected) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const repo = new MongoTaskRepository();
const issue = (key, done = false, sprint = { id: 1, name: 'Sprint 1', state: 'active' }) => ({
  key, fields: { summary: key, status: { name: done ? 'Done' : 'To Do', statusCategory: { key: done ? 'done' : 'new' } }, customfield_10020: sprint ? [sprint] : null },
});
const file = (...i) => JSON.stringify({ issues: i });

test('import, re-import and removal on MongoDB: one document per key, removed ones kept', async t => {
  if (!connected) return t.skip(unavailable);
  const linker = new LinkCommitsToTasksUseCase(repo, mongoMinedCommits);
  const importTasks = new ImportTasksUseCase(repo, linker);
  await importTasks.execute('pA', file(issue('ARCH-1'), issue('ARCH-2'), issue('ARCH-3')));
  // The same file twice at once: the unique index, not luck, keeps one document per key.
  await Promise.all([importTasks.execute('pA', file(issue('ARCH-1', true), issue('ARCH-2'))), importTasks.execute('pA', file(issue('ARCH-1', true), issue('ARCH-2')))]);
  assert.equal(await TaskModel.countDocuments({ projectId: 'pA' }), 3);
  assert.equal(await SprintModel.countDocuments({ projectId: 'pA' }), 1);
  const tasks = await repo.listTasks('pA');
  assert.deepEqual(tasks.map(x => [x.key, x.statusCategory, x.removed]), [['ARCH-1', 'done', false], ['ARCH-2', 'todo', false], ['ARCH-3', 'todo', true]]);
  assert.ok(tasks[2].removedAt instanceof Date);

  const board = await new ListTasksUseCase(repo).execute('pA');
  assert.deepEqual(board.sprints.map(s => [s.name, s.progress.done, s.progress.total, s.progress.percent]), [['Sprint 1', 1, 2, 50]]);
});

test('links are unique per (project, task, commit) on MongoDB, and mined commits come from the snapshots', async t => {
  if (!connected) return t.skip(unavailable);
  await new ImportTasksUseCase(repo, { relinkAll: async () => ({ commits: 0, linked: 0, unknownKeys: [] }) }).execute('pB', file(issue('T22'), issue('ARCH-12')));
  const base = { projectId: 'pB', version: 'v', author: 'a', branches: [], nodes: [], edges: [] };
  await SnapshotModel.insertMany([
    { ...base, hash: 'aaaaaaa', fullHash: 'a'.repeat(40), title: 'feat: T22 part one', trailers: ['Task: ARCH-12'], date: new Date('2026-11-01') },
    { ...base, hash: 'bbbbbbb', fullHash: 'b'.repeat(40), title: 'fix: T22 part two', date: new Date('2026-11-02') }, // mined before trailers were kept
    { ...base, hash: 'ccccccc', fullHash: 'c'.repeat(40), title: 'feat: T22 gone', date: new Date('2026-11-03'), missingSince: new Date() },
  ]);
  const commits = await mongoMinedCommits.commitsOf('pB');
  assert.deepEqual(commits.map(c => c.hash), ['aaaaaaa', 'bbbbbbb'], 'commits force-pushed away are not linked');
  assert.deepEqual(commits[1].trailers, []);

  const linker = new LinkCommitsToTasksUseCase(repo, mongoMinedCommits);
  assert.equal((await linker.relinkAll('pB')).linked, 3);
  const again = await Promise.all([linker.relinkAll('pB'), linker.relinkAll('pB')]);
  assert.deepEqual(again.map(r => r.linked), [0, 0]);
  assert.equal(await TaskCommitModel.countDocuments({ projectId: 'pB' }), 3);
  const links = await repo.listLinks('pB');
  assert.deepEqual(links.map(l => [l.hash, l.taskKey]), [['bbbbbbb', 'T22'], ['aaaaaaa', 'ARCH-12'], ['aaaaaaa', 'T22']]);
});
