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
import { referenceFingerprint } from "../src/domain/onboarding/stepReference.ts";

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
    diagram: {
      components: [{ id: "billing", name: "Billing", kind: "Service", description: "" }, { id: "orders", name: "Orders", kind: "Service", description: "" }],
      dependencies: [{ id: "d1", source: "orders", target: "billing", label: "creates invoices" }], revision: 3, confirmedAt: new Date("2026-10-01T00:00:00Z"),
    },
    decisions: [{
      id: "adr-1", number: 1, title: "Use a queue", status: "Accepted", context: "", decision: "Queue invoices.", alternatives: "", consequences: "", componentIds: ["billing"],
      sources: [{ kind: "approval", ref: "req-1", title: "Approved" }], updatedAt: new Date("2026-10-01T00:00:00Z"),
    }],
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

/** The fingerprints of billing and adr-1 as seed() stores them. */
async function seededFingerprints(id) {
  const { refs } = await deps.workspace(id);
  return { billing: referenceFingerprint({ kind: "component", componentId: "billing" }, refs), adr: referenceFingerprint({ kind: "adr", adrId: "adr-1" }, refs) };
}

test("the workspace facts carry what steps are about: components, dependencies, decisions and when the diagram was confirmed", async t => {
  if (!ready(t)) return;
  const { id } = await seed();
  const { refs } = await deps.workspace(id);
  assert.deepEqual(refs.components.map(c => c.name), ["Billing", "Orders"]);
  assert.deepEqual(refs.dependencies.map(d => [d.source, d.target, d.label]), [["orders", "billing", "creates invoices"]]);
  assert.equal(refs.decisions[0].decision, "Queue invoices.");
  assert.deepEqual(refs.decisions[0].componentIds, ["billing"]);
  assert.equal(refs.confirmedAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(refs.decisions[0].sources, undefined, "provenance is not loaded");
  assert.deepEqual((await deps.workspace(oid().toString())).refs, { components: [], dependencies: [], decisions: [], confirmedAt: null });
});

test("each step is judged on its own, in the order given: current, outdated or missing", async t => {
  if (!ready(t)) return;
  const { id, snapshotIds } = await seed();
  const fingerprints = await seededFingerprints(id);
  const at = new Date("2026-10-20T00:00:00Z");
  const on = (snapshot, hash, extra = {}) => ({ commit: full(hash), snapshotId: snapshot, workspaceRevision: 3, pinnedAt: at, ...extra });
  const steps = [
    { kind: "commit", revision: on(snapshotIds[0], "a1b2c3d") },                                                      // still fine
    { kind: "commit", revision: on(snapshotIds[2], "c3d4e5f") },                                                      // the commit left the history
    { kind: "commit", revision: on(snapshotIds[0], "a1b2c3d", { workspaceRevision: 2 }) },                            // the map changed: not about it
    { kind: "component", componentId: "billing", revision: on(snapshotIds[0], "a1b2c3d", { fingerprint: fingerprints.billing }) },
    { kind: "component", componentId: "billing", revision: on(snapshotIds[0], "a1b2c3d", { fingerprint: "0".repeat(32) }) }, // billing changed since
    { kind: "adr", adrId: "adr-1", revision: { commit: null, snapshotId: null, workspaceRevision: 2, pinnedAt: at, fingerprint: fingerprints.adr } }, // nothing mined
    { kind: "component", componentId: "gone", revision: on(snapshotIds[0], "a1b2c3d") },                              // no longer in the diagram
    { kind: "question", revision: { commit: full("e5f6a7b"), snapshotId: null, workspaceRevision: 3, pinnedAt: at } }, // a commit this workspace never had
  ];
  const results = await deps.assess(id, steps);
  assert.deepEqual(results.map(r => r.status), ["current", "missing", "current", "current", "outdated", "current", "missing", "missing"]);
  assert.deepEqual(results[1].issues.map(i => i.code), ["COMMIT_GONE"]);
  assert.deepEqual(results[4].issues.map(i => i.code), ["MAP_CHANGED"]);
  assert.deepEqual(results[6].issues.map(i => i.code), ["REF_GONE"]);
  assert.deepEqual(results[7].issues.map(i => i.code), ["SNAPSHOT_GONE"]);
  assert.deepEqual(await deps.assess(id, []), []);
});

test("saving the workspace without touching a step's component or decision does not flag it", async t => {
  if (!ready(t)) return;
  const { id, snapshotIds } = await seed();
  const fingerprints = await seededFingerprints(id);
  const at = new Date("2026-10-20T00:00:00Z");
  const steps = [
    { kind: "component", componentId: "billing", revision: { commit: full("a1b2c3d"), snapshotId: snapshotIds[0], workspaceRevision: 3, pinnedAt: at, fingerprint: fingerprints.billing } },
    { kind: "adr", adrId: "adr-1", revision: { commit: full("a1b2c3d"), snapshotId: snapshotIds[0], workspaceRevision: 3, pinnedAt: at, fingerprint: fingerprints.adr } },
  ];
  const save = update => WorkspaceModel.collection.updateOne({ projectId: id }, { ...update, $inc: { revision: 1, "diagram.revision": 1 } });
  await save({ $push: { rules: { id: "r1", name: "No cycles", source: "orders", target: "billing", constraint: "forbidden", severity: "error", rationale: "", enabled: true } } });
  await save({ $set: { "diagram.components.1.description": "Takes and tracks orders.", "diagram.confirmedAt": new Date("2026-11-01T00:00:00Z") } });
  await save({ $push: { decisions: { id: "adr-2", number: 2, title: "Use Postgres", status: "Proposed", context: "", decision: "", alternatives: "", consequences: "", componentIds: [] } } });
  assert.deepEqual((await deps.assess(id, steps)).map(r => r.status), ["current", "current"]);

  await save({ $set: { "diagram.dependencies.0.label": "bills" } });
  await save({ $set: { "decisions.0.alternatives": "Direct calls, or a cron job." } });
  assert.deepEqual((await deps.assess(id, steps)).map(r => r.status), ["outdated", "outdated"]);
});

test("many steps are judged at once, in order", async t => {
  if (!ready(t)) return;
  const { id, snapshotIds } = await seed();
  const at = new Date("2026-10-20T00:00:00Z");
  const fine = { kind: "commit", revision: { commit: full("a1b2c3d"), snapshotId: snapshotIds[0], workspaceRevision: 3, pinnedAt: at } };
  const gone = { kind: "commit", revision: { commit: full("c3d4e5f"), snapshotId: snapshotIds[2], workspaceRevision: 3, pinnedAt: at } };
  const legacy = { kind: "adr", adrId: "adr-1", revision: { commit: null, snapshotId: null, workspaceRevision: 1, pinnedAt: new Date("2026-09-01T00:00:00Z") } };
  const steps = Array.from({ length: 450 }, (_, i) => (i === 300 ? gone : i === 449 ? legacy : fine));
  const results = await deps.assess(id, steps);
  assert.equal(results.length, 450);
  assert.deepEqual(results.map((r, i) => i).filter(i => results[i].status !== "current"), [300, 449]);
  assert.equal(results[300].status, "missing");
  assert.equal(results[449].status, "outdated", "a step pinned before fingerprints, and before the decision was last edited");
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

test("in an organization's project, leaving the organization ends membership, even for the owner and active members", async t => {
  if (!ready(t)) return;
  const { id, ownerId, aliceId } = await seed();
  await ProjectModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { organizationId: "org-1" } });
  const insiders = new Set([ownerId]);
  const inOrganization = createOnboardingDeps(new MongoProjectMemberRepository(), {
    findMember: async (organizationId, userId) => (organizationId === "org-1" && insiders.has(userId) ? { organizationId, userId, role: "member" } : null),
  });
  assert.equal(await inOrganization.isMember(id, ownerId), true);
  assert.equal(await inOrganization.isMember(id, aliceId), false, "an active project member who is not in the organization");
  insiders.delete(ownerId);
  assert.equal(await inOrganization.isMember(id, ownerId), false, "the owner after leaving the organization");
  insiders.add(aliceId);
  assert.equal(await inOrganization.isMember(id, aliceId), true);
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
