import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { PROJECT, fakeDeps, goodPath, memoryStores } from "./onboarding-fakes.mjs";
import { createLearningRouter, createOnboardingRouter } from "../src/presentation/routes/onboarding.routes.ts";
import { OnboardingController } from "../src/presentation/controllers/OnboardingController.ts";
import { OnboardingPathUseCases } from "../src/application/use-cases/onboarding/OnboardingPathUseCases.ts";
import { OnboardingLearningUseCases } from "../src/application/use-cases/onboarding/OnboardingLearningUseCases.ts";
import { createProjectRoleMiddleware } from "../src/presentation/middlewares/projectRole.ts";
import { errorHandler } from "../src/presentation/middlewares/errorHandler.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { MongoUserRepository } from "../src/infrastructure/repositories/MongoUserRepository.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { RepoVisibility } from "../src/domain/entities/Project.ts";

// These tests send real HTTP requests through the real route guards (authentication and the project access rules), with
// in-memory stores behind them, to show who can do what, and that nobody can read a colleague's progress.

const PUBLIC_PROJECT = "66f000000000000000000002";
const projects = {
  [PROJECT]: { id: PROJECT, userId: "owner", name: "Shop Backend", visibility: RepoVisibility.PRIVATE },
  [PUBLIC_PROJECT]: { id: PUBLIC_PROJECT, userId: "owner", name: "Open Source Thing", visibility: RepoVisibility.PUBLIC },
};
const memberships = [
  { projectId: PROJECT, userId: "maintainer", role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE },
  { projectId: PROJECT, userId: "alice", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
  { projectId: PROJECT, userId: "bob", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
  { projectId: PROJECT, userId: "invited", role: ProjectMemberRole.MEMBER, status: MemberStatus.INVITED },
];
const people = ["owner", "maintainer", "alice", "bob", "invited", "outsider", "viewer"];

async function world(t) {
  const users = new Map(people.map(id => [id, { id, role: "developer-analyst", tokenVersion: 0, status: "active", isVerified: true }]));
  t.mock.method(MongoUserRepository.prototype, "findById", async id => users.get(id) ?? null);

  const stores = memoryStores();
  const deps = fakeDeps({ isMember: async (projectId, userId) => projectId === PROJECT && ["owner", "maintainer", "alice", "bob"].includes(userId) });
  const controller = new OnboardingController(
    new OnboardingPathUseCases(stores.pathStore, stores.assignmentStore, deps),
    new OnboardingLearningUseCases(stores.pathStore, stores.assignmentStore, deps),
  );
  const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
  const role = createProjectRoleMiddleware(
    { findById: async id => projects[id] ?? null },
    { findByProjectAndUserId: async (projectId, userId) => memberships.find(m => m.projectId === projectId && m.userId === userId) ?? null },
  );

  const app = express();
  app.use(express.json());
  app.use("/api/projects", createOnboardingRouter(controller, jwt, role));
  app.use("/api/onboarding", createLearningRouter(controller, jwt));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  /** One request as `as` (a user id, or nobody). */
  const call = async (as, method, path, body) => {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${jwt.generateAccessToken(as, "developer-analyst", 0)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null), text: "" };
  };
  const paths = `/projects/${PROJECT}/onboarding-paths`;
  // Written as a path the mentors would publish, and given to Alice and Bob.
  const published = async () => {
    const created = await call("maintainer", "POST", paths, goodPath());
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const path = created.body.data.path;
    const assigned = await call("maintainer", "POST", `${paths}/${path.id}/assignments`, { userIds: ["alice", "bob"] });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    return path;
  };
  return { ...stores, call, paths, published };
}

test("nothing works without signing in", async t => {
  const { call, paths } = await world(t);
  for (const [method, path] of [["GET", paths], ["POST", paths], ["GET", `${paths}/x`], ["GET", `${paths}/x/mine`], ["POST", `${paths}/x/steps/y/answer`], ["GET", "/onboarding/me"]]) {
    assert.equal((await call(undefined, method, path, method === "POST" ? {} : undefined)).status, 401, `${method} ${path}`);
  }
});

test("owners and maintainers write paths, members and outsiders cannot", async t => {
  const { call, paths } = await world(t);
  const created = await call("maintainer", "POST", paths, goodPath({ status: "draft" }));
  assert.equal(created.status, 201);
  const id = created.body.data.path.id;
  assert.equal((await call("owner", "POST", paths, goodPath({ status: "draft" }))).status, 201);

  const attempts = [
    ["GET", paths], ["POST", paths, goodPath()], ["GET", `${paths}/${id}`], ["PUT", `${paths}/${id}`, { ...goodPath(), expectedRevision: 1 }], ["DELETE", `${paths}/${id}`],
    ["GET", `${paths}/${id}/assignments`], ["POST", `${paths}/${id}/assignments`, { userIds: ["alice"] }], ["DELETE", `${paths}/${id}/assignments/alice`],
  ];
  for (const who of ["alice", "invited", "outsider"]) {
    for (const [method, path, body] of attempts) {
      const { status } = await call(who, method, path, body);
      assert.equal(status, 403, `${who}: ${method} ${path.replace(PROJECT, "<project>")} should be refused`);
    }
  }
  // A viewer of a public project can read it but still cannot write learning paths there.
  assert.equal((await call("viewer", "POST", `/projects/${PUBLIC_PROJECT}/onboarding-paths`, goodPath())).status, 403);
  assert.equal((await call("viewer", "GET", `/projects/${PUBLIC_PROJECT}/onboarding-paths`)).status, 403);
  assert.equal((await call("maintainer", "DELETE", `${paths}/${id}`)).status, 200);
});

test("a member cannot see how far their colleagues have got, only the mentors can", async t => {
  const { call, paths, published } = await world(t);
  const path = await published();
  assert.equal((await call("alice", "GET", `${paths}/${path.id}/assignments`)).status, 403);
  assert.equal((await call("bob", "GET", `${paths}/${path.id}/assignments`)).status, 403);
  assert.equal((await call("outsider", "GET", `${paths}/${path.id}/assignments`)).status, 403);

  const done = await call("alice", "POST", `${paths}/${path.id}/steps/${path.steps[0].id}/complete`);
  assert.equal(done.status, 200);
  const seen = await call("maintainer", "GET", `${paths}/${path.id}/assignments`);
  assert.equal(seen.status, 200);
  const alice = seen.body.data.learners.find(l => l.userId === "alice");
  const bob = seen.body.data.learners.find(l => l.userId === "bob");
  assert.deepEqual([alice.done, alice.total, alice.name, alice.email], [1, 4, "Alice Example", "alice@test.invalid"]);
  assert.deepEqual([bob.done, bob.total], [0, 4]);
});

test("a learner reads only their own copy of a path and their own progress", async t => {
  const { call, paths, published } = await world(t);
  const path = await published();
  const question = path.steps[3];
  assert.equal(question.question.correctIndex, 1, "the mentors' copy carries the answer key");

  await call("alice", "POST", `${paths}/${path.id}/steps/${path.steps[0].id}/complete`);
  await call("alice", "POST", `${paths}/${path.id}/steps/${question.id}/answer`, { choice: 1 });
  await call("bob", "POST", `${paths}/${path.id}/steps/${path.steps[2].id}/complete`);

  const alice = await call("alice", "GET", `${paths}/${path.id}/mine`);
  const bob = await call("bob", "GET", `${paths}/${path.id}/mine`);
  assert.equal(alice.status, 200);
  assert.deepEqual(alice.body.data.progress, { done: 2, total: 4, percent: 50 });
  assert.deepEqual(bob.body.data.progress, { done: 1, total: 4, percent: 25 });
  assert.equal(bob.body.data.path.steps[3].question.explanation, undefined, "Alice's right answer does not unlock Bob's explanation");
  assert.equal(bob.body.data.path.steps[3].question.correctIndex, undefined);
  for (const reply of [alice, bob]) {
    const text = JSON.stringify(reply.body);
    for (const hidden of ["alice@test.invalid", "bob@test.invalid", "Alice Example", "Bob Example", "assignedBy", "maintainer"]) {
      assert.ok(!text.includes(hidden), `a learner's page must not mention "${hidden}"`);
    }
  }
  assert.equal(alice.body.data.path.steps[3].question.explanation, "Billing owns invoices.", "after answering right, Alice sees the explanation");

  const list = await call("bob", "GET", "/onboarding/me");
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.paths.map(p => [p.title, p.done, p.total, p.projectName]), [["Week 1: the billing core", 1, 4, "Shop Backend"]]);
  assert.ok(!JSON.stringify(list.body).includes("alice"));
});

test("someone who was not given the path gets nothing, even as a member of the project", async t => {
  const { call, paths, published } = await world(t);
  const path = await published();
  const other = await call("owner", "POST", paths, goodPath({ title: "Not for Alice" }));
  const otherId = other.body.data.path.id;
  await call("maintainer", "POST", `${paths}/${otherId}/assignments`, { userIds: ["bob"] });

  assert.equal((await call("alice", "GET", `${paths}/${otherId}/mine`)).status, 404);
  assert.equal((await call("alice", "POST", `${paths}/${otherId}/steps/${other.body.data.path.steps[0].id}/complete`)).status, 404);
  assert.equal((await call("alice", "POST", `${paths}/${otherId}/steps/${other.body.data.path.steps[3].id}/answer`, { choice: 1 })).status, 404);
  // The mentors can read the path as a learner would only if it was given to them.
  assert.equal((await call("maintainer", "GET", `${paths}/${path.id}/mine`)).status, 404);

  const mine = await call("alice", "GET", "/onboarding/me");
  assert.deepEqual(mine.body.data.paths.map(p => p.pathId), [path.id]);

  // Ids that are not ids are not found, and are not errors of ours.
  assert.equal((await call("alice", "GET", `${paths}/not-an-id/mine`)).status, 404);
  assert.equal((await call("outsider", "GET", `${paths}/${path.id}/mine`)).status, 403);
  assert.equal((await call("invited", "GET", `${paths}/${path.id}/mine`)).status, 403);
  assert.equal((await call("outsider", "GET", "/onboarding/me")).body.data.paths.length, 0);
});

test("answers and completion work over HTTP, and the replies say what to show", async t => {
  const { call, paths, published } = await world(t);
  const path = await published();
  const question = path.steps[3];
  const wrong = await call("alice", "POST", `${paths}/${path.id}/steps/${question.id}/answer`, { choice: 0 });
  assert.equal(wrong.status, 200);
  assert.deepEqual([wrong.body.data.correct, wrong.body.data.completed, wrong.body.data.attempts], [false, false, 1]);
  assert.equal(wrong.body.data.explanation, undefined);
  assert.equal((await call("alice", "POST", `${paths}/${path.id}/steps/${question.id}/answer`, { choice: 7 })).status, 400);
  assert.equal((await call("alice", "POST", `${paths}/${path.id}/steps/${question.id}/answer`, {})).status, 400);
  assert.equal((await call("alice", "POST", `${paths}/${path.id}/steps/${question.id}/complete`)).status, 400, "a question is finished by answering it");
  const right = await call("alice", "POST", `${paths}/${path.id}/steps/${question.id}/answer`, { choice: 1 });
  assert.deepEqual([right.body.data.correct, right.body.data.completed, right.body.data.explanation], [true, true, "Billing owns invoices."]);
  for (const step of path.steps.slice(0, 3)) await call("alice", "POST", `${paths}/${path.id}/steps/${step.id}/complete`);
  assert.deepEqual((await call("alice", "GET", `${paths}/${path.id}/mine`)).body.data.progress, { done: 4, total: 4, percent: 100 });
  const rows = await call("maintainer", "GET", `${paths}`);
  assert.deepEqual(rows.body.data.paths.map(p => [p.assigned, p.finished]), [[2, 1]]);
});

test("invalid paths are refused with the fields at fault, and a stale save is a conflict", async t => {
  const { call, paths } = await world(t);
  const bad = await call("maintainer", "POST", paths, { title: "", steps: [{ kind: "component", title: "x" }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(Object.keys(bad.body.error.fields).sort(), ["steps[0].componentId", "title"]);

  const created = (await call("maintainer", "POST", paths, goodPath())).body.data.path;
  const sent = created.steps.map(({ assessment, revision, commitTitle, ...s }) => s);
  const first = await call("maintainer", "PUT", `${paths}/${created.id}`, { ...goodPath({ title: "Edited" }), steps: sent, expectedRevision: 1 });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.path.revision, 2);
  const stale = await call("owner", "PUT", `${paths}/${created.id}`, { ...goodPath({ title: "Edited elsewhere" }), steps: sent, expectedRevision: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "CONFLICT");
  assert.equal((await call("maintainer", "GET", `${paths}/${created.id}`)).body.data.path.title, "Edited");
  assert.equal((await call("maintainer", "PUT", `${paths}/${created.id}`, { ...goodPath(), steps: sent })).status, 400, "the revision is required");
});

test("only published paths can be given, and only to members of the project", async t => {
  const { call, paths } = await world(t);
  const draft = (await call("maintainer", "POST", paths, goodPath({ status: "draft" }))).body.data.path;
  assert.equal((await call("maintainer", "POST", `${paths}/${draft.id}/assignments`, { userIds: ["alice"] })).status, 400);
  const live = (await call("maintainer", "POST", paths, goodPath())).body.data.path;
  const outsider = await call("maintainer", "POST", `${paths}/${live.id}/assignments`, { userIds: ["alice", "outsider"] });
  assert.equal(outsider.status, 400);
  assert.match(outsider.body.error.fields.userIds, /outsider/);
  assert.equal((await call("maintainer", "POST", `${paths}/${live.id}/assignments`, { userIds: [] })).status, 400);
  assert.equal((await call("alice", "GET", "/onboarding/me")).body.data.paths.length, 0, "a refused request gave nothing to Alice");
  assert.equal((await call("maintainer", "POST", `${paths}/${live.id}/assignments`, { userIds: ["alice"] })).status, 200);
  assert.equal((await call("maintainer", "DELETE", `${paths}/${live.id}/assignments/alice`)).status, 200);
  assert.equal((await call("maintainer", "DELETE", `${paths}/${live.id}/assignments/alice`)).status, 404);
  assert.equal((await call("alice", "GET", `${paths}/${live.id}/mine`)).status, 404);
});
