import "./setup-env.mjs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { createOnboardingDeps } from "../src/infrastructure/services/OnboardingDeps.ts";
import { MongoProjectMemberRepository } from "../src/infrastructure/repositories/MongoProjectMemberRepository.ts";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.ts";
import { ProjectMemberModel } from "../src/infrastructure/database/models/ProjectMemberModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { UserModel } from "../src/infrastructure/database/models/UserModel.ts";
import { WorkspaceModel } from "../src/infrastructure/database/models/WorkspaceModel.ts";
import { NotFoundError, BadRequestError } from "../src/shared/errors/AppError.ts";

// What the learning paths ask of the rest of the system, against a throwaway database on a real MongoDB: the workspace's
// components and decisions, pinning and checking revisions, and who belongs to a project. Skipped when none is reachable.
// Set MONGODB_TEST_URI to use a server other than the local default.
const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_onboarding_deps_${randomUUID().slice(0, 8)}`;
let connected = false;
let unavailable = "MongoDB is not reachable";

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
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

const deps = createOnboardingDeps(new MongoProjectMemberRepository());
const oid = () => new mongoose.Types.ObjectId();
const full = prefix => prefix + "0".repeat(40 - prefix.length);

/** A project with a workspace (revision 3), three snapshots (the newest of them removed from the remote), an owner and members. */
async function seed() {
  const [projectId, ownerId, aliceId, invitedId] = [oid(), oid(), oid(), oid()];
  const id = projectId.toString();
  // The users collection has a unique index on email, so every seeding gets addresses of its own.
  const tag = id.slice(-8);
  await ProjectModel.collection.insertOne({ _id: projectId, name: "Shop Backend", userId: ownerId.toString() });
  await UserModel.collection.insertMany([
    { _id: ownerId, name: "Olivia Owner", email: `olivia-${tag}@test.invalid` },
    { _id: aliceId, name: "Alice Example", email: `alice-${tag}@test.invalid` },
  ]);
  await ProjectMemberModel.collection.insertMany([
    { projectId: id, userId: aliceId.toString(), email: `alice-${tag}@test.invalid`, name: "Alice", role: "developer-analyst", status: "active" },
    { projectId: id, userId: invitedId.toString(), email: `inv-${tag}@test.invalid`, name: "Invited", role: "developer-analyst", status: "invited" },
  ]);
  await WorkspaceModel.collection.insertOne({
    projectId: id, revision: 3, rules: [],
    diagram: { components: [{ id: "billing", name: "Billing", kind: "Service", description: "" }, { id: "orders", name: "Orders", kind: "Service", description: "" }], dependencies: [], revision: 3 },
    decisions: [{ id: "adr-1", number: 1, title: "Use a queue", status: "Accepted", context: "", decision: "", alternatives: "", consequences: "", componentIds: [] }],
  });
  const snap = (hash, day, extra = {}) => ({ projectId: id, hash, fullHash: full(hash), title: `Commit ${hash}\n\nlong body`, date: new Date(Date.UTC(2026, 8, day)), missingSince: null, ...extra });
  const inserted = await SnapshotModel.collection.insertMany([
    snap("a1b2c3d", 1), snap("b2c3d4e", 10), snap("c3d4e5f", 20, { missingSince: new Date("2026-10-12T00:00:00Z") }),
  ]);
  return { id, tag, ownerId: ownerId.toString(), aliceId: aliceId.toString(), invitedId: invitedId.toString(), snapshotIds: Object.values(inserted.insertedIds).map(String) };
}

test("the workspace's components, decisions and revision are read for checking steps against it", async t => {
  if (!ready(t)) return;
  const { id } = await seed();
  const facts = await deps.workspace(id);
  assert.equal(facts.revision, 3);
  assert.deepEqual([...facts.componentIds].sort(), ["billing", "orders"]);
  assert.deepEqual([...facts.adrIds], ["adr-1"]);
  const none = await deps.workspace(oid().toString());
  assert.deepEqual([none.revision, none.componentIds.size, none.adrIds.size], [null, 0, 0]);
});

test("a commit is pinned to its snapshot and the map revision; without one, the latest commit still on the remote", async t => {
  if (!ready(t)) return;
  const { id, snapshotIds } = await seed();
  const named = await deps.pin(id, "a1b2c3d");
  assert.equal(named.revision.commit, full("a1b2c3d"));
  assert.equal(named.revision.snapshotId, snapshotIds[0]);
  assert.equal(named.revision.workspaceRevision, 3);
  assert.equal(named.title, "Commit a1b2c3d", "the first line of the commit's title");
  const prefix = await deps.pin(id, full("a1b2c3d").slice(0, 12));
  assert.equal(prefix.revision.snapshotId, snapshotIds[0]);

  const latest = await deps.pin(id);
  assert.equal(latest.revision.commit, full("b2c3d4e"), "the newest snapshot was removed from the remote, so the one before it is the latest");
  assert.equal(latest.title, "Commit b2c3d4e");
  await assert.rejects(() => deps.pin(id, "deadbeef"), error => error instanceof NotFoundError);
  await assert.rejects(() => deps.pin(id, "c3d4e5f"), error => error instanceof BadRequestError && /no longer/.test(error.message));
});

test("a workspace that has not been mined still lets a step be tied to the map as it is", async t => {
  if (!ready(t)) return;
  const id = oid().toString();
  await WorkspaceModel.collection.insertOne({ projectId: id, revision: 5, rules: [], decisions: [], diagram: { components: [], dependencies: [], revision: 5 } });
  const pinned = await deps.pin(id);
  assert.deepEqual([pinned.revision.commit, pinned.revision.snapshotId, pinned.revision.workspaceRevision], [null, null, 5]);
  await assert.rejects(() => deps.pin(id, "a1b2c3d"), error => error instanceof NotFoundError, "a named commit still has to exist");
  const bare = await deps.pin(oid().toString());
  assert.equal(bare.revision.workspaceRevision, null);
});

test("each step is judged on its own, in the order given: current, outdated or missing", async t => {
  if (!ready(t)) return;
  const { id, snapshotIds } = await seed();
  const at = new Date("2026-10-20T00:00:00Z");
  const revisions = [
    { commit: full("a1b2c3d"), snapshotId: snapshotIds[0], workspaceRevision: 3, pinnedAt: at },   // still fine
    { commit: full("c3d4e5f"), snapshotId: snapshotIds[2], workspaceRevision: 3, pinnedAt: at },   // the commit left the history
    { commit: full("a1b2c3d"), snapshotId: snapshotIds[0], workspaceRevision: 2, pinnedAt: at },   // the map changed since
    { commit: null, snapshotId: null, workspaceRevision: 2, pinnedAt: at },                       // pinned before anything was mined, map changed
    { commit: null, snapshotId: null, workspaceRevision: 3, pinnedAt: at },                       // same, map unchanged
    { commit: full("e5f6a7b"), snapshotId: null, workspaceRevision: 3, pinnedAt: at },             // a commit this workspace never had
  ];
  const results = await deps.assess(id, revisions);
  assert.deepEqual(results.map(r => r.status), ["current", "missing", "outdated", "outdated", "current", "missing"]);
  assert.deepEqual(results[1].issues.map(i => i.code), ["COMMIT_GONE"]);
  assert.deepEqual(results[2].issues.map(i => i.code), ["MAP_CHANGED"]);
  assert.deepEqual(results[5].issues.map(i => i.code), ["SNAPSHOT_GONE"]);
  assert.deepEqual(await deps.assess(id, []), []);
});

test("more steps than one check can take are still judged, in order", async t => {
  if (!ready(t)) return;
  const { id, snapshotIds } = await seed();
  const at = new Date("2026-10-20T00:00:00Z");
  const fine = { commit: full("a1b2c3d"), snapshotId: snapshotIds[0], workspaceRevision: 3, pinnedAt: at };
  const gone = { commit: full("c3d4e5f"), snapshotId: snapshotIds[2], workspaceRevision: 3, pinnedAt: at };
  const revisions = Array.from({ length: 450 }, (_, i) => (i === 300 ? gone : i === 449 ? { commit: null, snapshotId: null, workspaceRevision: 1, pinnedAt: at } : fine));
  const results = await deps.assess(id, revisions);
  assert.equal(results.length, 450);
  assert.deepEqual(results.map((r, i) => i).filter(i => results[i].status !== "current"), [300, 449]);
  assert.equal(results[300].status, "missing");
  assert.equal(results[449].status, "outdated");
});

test("the owner and active members belong to the project; invited people, strangers and bad ids do not", async t => {
  if (!ready(t)) return;
  const { id, ownerId, aliceId, invitedId } = await seed();
  assert.equal(await deps.isMember(id, ownerId), true);
  assert.equal(await deps.isMember(id, aliceId), true);
  assert.equal(await deps.isMember(id, invitedId), false);
  assert.equal(await deps.isMember(id, oid().toString()), false);
  assert.equal(await deps.isMember(oid().toString(), aliceId), false);
  assert.equal(await deps.isMember("not-an-id", aliceId), false);
});

test("people and project names are looked up by id, and ids that are not ids are ignored", async t => {
  if (!ready(t)) return;
  const { id, tag, ownerId, aliceId } = await seed();
  const people = await deps.people([aliceId, ownerId, "junk", aliceId]);
  assert.deepEqual([...people.entries()].map(([key, value]) => [key, value.name, value.email]).sort(), [
    [aliceId, "Alice Example", `alice-${tag}@test.invalid`], [ownerId, "Olivia Owner", `olivia-${tag}@test.invalid`],
  ].sort());
  assert.equal((await deps.people(["junk"])).size, 0);
  assert.equal((await deps.people([])).size, 0);
  assert.deepEqual([...(await deps.projectNames([id, "junk"])).entries()], [[id, "Shop Backend"]]);
  assert.equal((await deps.projectNames([])).size, 0);
  assert.ok(deps.now() instanceof Date);
});
