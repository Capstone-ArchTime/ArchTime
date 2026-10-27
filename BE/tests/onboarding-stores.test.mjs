import "./setup-env.mjs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoAssignmentStore, MongoPathStore } from "../src/infrastructure/repositories/MongoOnboardingStores.ts";
import { OnboardingAssignmentModel } from "../src/infrastructure/database/models/OnboardingAssignmentModel.ts";
import { OnboardingPathModel } from "../src/infrastructure/database/models/OnboardingPathModel.ts";

// The queries behind the learning paths, against a throwaway database on a real MongoDB (what makes a write atomic cannot be
// shown with a mock). Skipped when none is reachable. Set MONGODB_TEST_URI to use a server other than the local default.
const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_onboarding_${randomUUID().slice(0, 8)}`;
let connected = false;
let unavailable = "MongoDB is not reachable";

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await Promise.all([OnboardingPathModel.syncIndexes(), OnboardingAssignmentModel.syncIndexes()]);
    connected = true;
  } catch (error) {
    unavailable = `MongoDB is not usable: ${error.message}`;
    connected = false;
  }
});

after(async () => {
  if (connected) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const ready = t => {
  if (!connected) t.skip(unavailable);
  return connected;
};

const paths = new MongoPathStore();
const assignments = new MongoAssignmentStore();
const revision = { commit: "a".repeat(40), snapshotId: "snap-1", workspaceRevision: 3, pinnedAt: new Date("2026-10-20T00:00:00Z") };
const newPath = (projectId, extra = {}) => ({
  projectId, title: "Week 1", description: "d", status: "published", revision: 1, createdBy: "m", updatedBy: "m",
  steps: [
    { id: "step-1", kind: "adr", title: "A", body: "", adrId: "adr-1", revision: { ...revision, fingerprint: "f".repeat(32) } },
    { id: "step-2", kind: "question", title: "Q", body: "", question: { prompt: "?", options: ["x", "y"], correctIndex: 1, explanation: "because" }, revision },
  ],
  ...extra,
});
const project = () => new mongoose.Types.ObjectId().toString();

test("a path is stored with its steps, pins and question, and read back for its own workspace only", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const saved = await paths.create(newPath(projectId));
  assert.match(saved.id, /^[0-9a-f]{24}$/);
  assert.equal(saved.revision, 1);
  const found = await paths.find(projectId, saved.id);
  assert.equal(found.steps[1].question.correctIndex, 1);
  assert.equal(found.steps[0].revision.commit, "a".repeat(40));
  assert.ok(found.steps[0].revision.pinnedAt instanceof Date);
  assert.equal(found.steps[0].commitTitle, undefined);
  assert.equal(found.steps[0].revision.fingerprint, "f".repeat(32), "the fingerprint of the step's decision is kept");
  assert.equal(found.steps[1].revision.fingerprint, undefined, "a question has none");
  const replaced = await paths.replace(projectId, saved.id, 1, { title: "T", description: "", status: "published", steps: [{ ...found.steps[0], revision: { ...revision, fingerprint: "e".repeat(32) } }], updatedBy: "m" });
  assert.equal(replaced.steps[0].revision.fingerprint, "e".repeat(32), "and replaced on a re-pin");
  assert.equal(await paths.find(project(), saved.id), null, "another workspace does not find it");
  assert.equal(await paths.find(projectId, "not-an-object-id"), null);
  assert.equal(await paths.count(projectId), 1);
  assert.deepEqual((await paths.list(projectId, 10)).map(p => p.id), [saved.id]);
  assert.deepEqual((await paths.findMany([saved.id, "junk"])).map(p => p.id), [saved.id]);
  assert.deepEqual(await paths.findMany([]), []);
  assert.equal(await paths.remove(project(), saved.id), false, "another workspace cannot delete it");
  assert.equal(await paths.remove(projectId, saved.id), true);
  assert.equal(await paths.remove(projectId, saved.id), false);
});

test("the list is newest edit first and stops at the limit", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const first = await paths.create(newPath(projectId, { title: "old" }));
  const second = await paths.create(newPath(projectId, { title: "new" }));
  await paths.replace(projectId, first.id, 1, { title: "old, edited", description: "", status: "draft", steps: [], updatedBy: "m" });
  assert.deepEqual((await paths.list(projectId, 10)).map(p => p.title), ["old, edited", "new"]);
  assert.deepEqual((await paths.list(projectId, 1)).map(p => p.id), [first.id]);
  assert.ok(second.id);
});

test("of several saves made from the same revision, exactly one is applied", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const saved = await paths.create(newPath(projectId));
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => paths.replace(projectId, saved.id, 1, { title: `edit ${i}`, description: "", status: "draft", steps: [], updatedBy: `m${i}` })));
  assert.equal(attempts.filter(Boolean).length, 1);
  const now = await paths.find(projectId, saved.id);
  assert.equal(now.revision, 2);
  assert.equal(now.title, attempts.find(Boolean).title);
  assert.equal(await paths.replace(projectId, saved.id, 1, { title: "late", description: "", status: "draft", steps: [], updatedBy: "m" }), null);
  assert.equal(await paths.replace(project(), saved.id, 2, { title: "elsewhere", description: "", status: "draft", steps: [], updatedBy: "m" }), null);
  assert.equal(await paths.replace(projectId, "junk", 1, { title: "x", description: "", status: "draft", steps: [], updatedBy: "m" }), null);
});

test("giving a path to someone twice, even at the same moment, leaves one assignment", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const pathId = new mongoose.Types.ObjectId().toString();
  await Promise.all(Array.from({ length: 10 }, () => assignments.assign(projectId, pathId, "alice", "m")));
  assert.equal(await OnboardingAssignmentModel.countDocuments({ pathId, userId: "alice" }), 1);
  await assignments.assign(projectId, pathId, "bob", "m");
  assert.equal((await assignments.listByPaths(projectId, [pathId])).length, 2);
  const found = await assignments.find(pathId, "alice");
  assert.deepEqual(found.progress, {});
  assert.equal(found.assignedBy, "m");

  // Giving it again later does not wipe what Alice has done, nor change who gave it or when.
  await assignments.complete(pathId, "alice", "step-1", new Date("2026-10-24T08:00:00Z"));
  await assignments.assign(projectId, pathId, "alice", "someone-else");
  const again = await assignments.find(pathId, "alice");
  assert.ok(again.progress["step-1"].completedAt, "the progress is still there");
  assert.equal(again.assignedBy, "m");
  assert.equal(again.assignedAt.toISOString(), found.assignedAt.toISOString());
});

test("a step is finished once: the first time stays", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const pathId = new mongoose.Types.ObjectId().toString();
  await assignments.assign(projectId, pathId, "alice", "m");
  const first = await assignments.complete(pathId, "alice", "step-1", new Date("2026-10-24T08:00:00Z"));
  assert.equal(first.progress["step-1"].completedAt.toISOString(), "2026-10-24T08:00:00.000Z");
  const second = await assignments.complete(pathId, "alice", "step-1", new Date("2026-10-25T08:00:00Z"));
  assert.equal(second.progress["step-1"].completedAt.toISOString(), "2026-10-24T08:00:00.000Z");
  assert.equal(await assignments.complete(pathId, "nobody", "step-1", new Date()), null);
});

test("attempts are counted exactly, and a right answer finishes the step for good", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const pathId = new mongoose.Types.ObjectId().toString();
  await assignments.assign(projectId, pathId, "alice", "m");
  await Promise.all(Array.from({ length: 20 }, () => assignments.recordAnswer(pathId, "alice", "step-2", 0, false, new Date())));
  let now = await assignments.find(pathId, "alice");
  assert.equal(now.progress["step-2"].attempts, 20);
  assert.equal(now.progress["step-2"].lastChoice, 0);
  assert.equal(now.progress["step-2"].completedAt, undefined);

  const right = await assignments.recordAnswer(pathId, "alice", "step-2", 1, true, new Date("2026-10-24T09:00:00Z"));
  assert.equal(right.progress["step-2"].attempts, 21);
  assert.equal(right.progress["step-2"].completedAt.toISOString(), "2026-10-24T09:00:00.000Z");
  await assignments.recordAnswer(pathId, "alice", "step-2", 0, false, new Date("2026-10-26T09:00:00Z"));
  now = await assignments.find(pathId, "alice");
  assert.equal(now.progress["step-2"].attempts, 22);
  assert.equal(now.progress["step-2"].completedAt.toISOString(), "2026-10-24T09:00:00.000Z", "a wrong answer afterwards does not undo it");
  assert.equal(await assignments.recordAnswer(pathId, "nobody", "step-2", 1, true, new Date()), null);
});

test("progress on one step or one person never touches another's", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const pathId = new mongoose.Types.ObjectId().toString();
  await assignments.assign(projectId, pathId, "alice", "m");
  await assignments.assign(projectId, pathId, "bob", "m");
  await assignments.complete(pathId, "alice", "step-1", new Date());
  await assignments.recordAnswer(pathId, "alice", "step-2", 0, false, new Date());
  const bob = await assignments.find(pathId, "bob");
  assert.deepEqual(bob.progress, {});
  const alice = await assignments.find(pathId, "alice");
  assert.deepEqual(Object.keys(alice.progress).sort(), ["step-1", "step-2"]);
  assert.equal(alice.progress["step-1"].attempts, undefined);
});

test("a person's list holds only their own assignments, across projects, most recently touched first", async t => {
  if (!ready(t)) return;
  const [p1, p2] = [project(), project()];
  const [a, b, c] = [1, 2, 3].map(() => new mongoose.Types.ObjectId().toString());
  const user = `user-${randomUUID().slice(0, 6)}`;
  await assignments.assign(p1, a, user, "m");
  await assignments.assign(p2, b, user, "m");
  await assignments.assign(p1, c, "somebody-else", "m");
  await assignments.complete(a, user, "step-1", new Date());
  const mine = await assignments.listByUser(user, 10);
  assert.deepEqual(mine.map(x => x.pathId), [a, b]);
  assert.ok(mine.every(x => x.userId === user));
  assert.deepEqual((await assignments.listByUser(user, 1)).map(x => x.pathId), [a]);
  assert.deepEqual((await assignments.listByPaths(p1, [a, b, c])).map(x => x.pathId).sort(), [a, c].sort(), "a workspace sees its own paths only");
  assert.deepEqual(await assignments.listByPaths(p1, []), []);
});

test("taking a path back, or deleting it, removes the assignments and their progress", async t => {
  if (!ready(t)) return;
  const projectId = project();
  const pathId = new mongoose.Types.ObjectId().toString();
  await assignments.assign(projectId, pathId, "alice", "m");
  await assignments.assign(projectId, pathId, "bob", "m");
  assert.equal(await assignments.unassign(pathId, "alice"), true);
  assert.equal(await assignments.unassign(pathId, "alice"), false);
  assert.equal(await assignments.find(pathId, "alice"), null);
  await assignments.removeByPath(pathId);
  assert.equal((await assignments.listByPaths(projectId, [pathId])).length, 0);
});
