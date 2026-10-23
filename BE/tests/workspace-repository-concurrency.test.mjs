import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoWorkspaceRepository } from '../src/infrastructure/repositories/MongoWorkspaceRepository.ts';
import { WorkspaceModel } from '../src/infrastructure/database/models/WorkspaceModel.ts';

// Runs against a throwaway database on a real MongoDB (atomicity cannot be shown with a mock) and is skipped when none
// is reachable. Set MONGODB_TEST_URI to use a server other than the local default.
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_ws_${randomUUID().slice(0, 8)}`;
let connected = false;
let unavailable = 'MongoDB is not reachable';

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await WorkspaceModel.syncIndexes();
    connected = true;
  } catch (err) {
    unavailable = `MongoDB is not usable: ${err.message}`;
    connected = false;
  }
});

after(async () => {
  if (connected) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const repo = new MongoWorkspaceRepository();
const workspace = (projectId, label) => ({
  projectId,
  revision: 0,
  diagram: { components: [{ id: 'c', name: label, kind: 'Service', description: '' }], dependencies: [], revision: 0 },
  rules: [],
  decisions: [],
  updatedBy: label,
});
const isConflict = err => err?.isConflict === true;

test('a save from a stale revision is rejected and leaves the newer save in place', async t => {
  if (!connected) return t.skip(unavailable);
  const projectId = randomUUID();
  assert.equal((await repo.save(workspace(projectId, 'first'), 1)).revision, 2);
  assert.equal((await repo.save(workspace(projectId, 'second'), 2)).revision, 3);

  await assert.rejects(repo.save(workspace(projectId, 'stale'), 2), err => isConflict(err) && err.expectedRevision === 2 && err.currentRevision === 3);
  const stored = await repo.findByProjectId(projectId);
  assert.equal(stored.revision, 3);
  assert.equal(stored.diagram.revision, 3);
  assert.equal(stored.diagram.components[0].name, 'second');
});

test('of many saves made from the same revision, exactly one is applied', async t => {
  if (!connected) return t.skip(unavailable);
  const projectId = randomUUID();
  await repo.save(workspace(projectId, 'base'), 1);

  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => repo.save(workspace(projectId, `writer-${i}`), 2)));
  const applied = results.filter(r => r.status === 'fulfilled');
  assert.equal(applied.length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => isConflict(r.reason)));

  const stored = await repo.findByProjectId(projectId);
  assert.equal(stored.revision, 3);
  assert.equal(stored.diagram.components[0].name, applied[0].value.diagram.components[0].name);
});

test('simultaneous first saves create one workspace, and the others get a conflict', async t => {
  if (!connected) return t.skip(unavailable);
  const projectId = randomUUID();
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => repo.save(workspace(projectId, `first-${i}`), 1)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => isConflict(r.reason)));
  assert.equal(await WorkspaceModel.countDocuments({ projectId }), 1);
});

test('saves without an expected revision are all applied, one revision each', async t => {
  if (!connected) return t.skip(unavailable);
  const projectId = randomUUID();
  await repo.save(workspace(projectId, 'base'), 1);
  const writers = 4;
  await Promise.all(Array.from({ length: writers }, (_, i) => repo.save(workspace(projectId, `any-${i}`))));
  assert.equal((await repo.findByProjectId(projectId)).revision, 2 + writers);
});

test('a revision ahead of an uninitialised workspace is a conflict', async t => {
  if (!connected) return t.skip(unavailable);
  const projectId = randomUUID();
  await assert.rejects(repo.save(workspace(projectId, 'ahead'), 4), err => isConflict(err) && err.currentRevision === 1);
  assert.equal(await WorkspaceModel.countDocuments({ projectId }), 0);
});
