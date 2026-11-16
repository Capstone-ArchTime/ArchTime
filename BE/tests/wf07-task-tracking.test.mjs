// WF-07 "Track project work against architecture changes" (T10, F-13, RF-07): over HTTP, with the real task router,
// the real authentication middleware, the real ProjectAccessPolicy and the real use cases; only storage is in memory
// (its Mongo twin is tested in task-repository.test.mjs). Each test is one row of docs/report-5-test-plan-and-results.md.
import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { OrganizationRole } from "../src/domain/entities/Organization.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { ProjectStatus, RepoVisibility } from "../src/domain/entities/Project.ts";
import { ImportTasksUseCase, LinkCommitsToTasksUseCase, ListTasksUseCase, TaskImpactUseCase } from "../src/application/use-cases/tasks/TaskUseCases.ts";
import { createTaskRouter } from "../src/presentation/routes/task.routes.ts";
import { createProjectRoleMiddleware } from "../src/presentation/middlewares/projectRole.ts";
import { errorHandler } from "../src/presentation/middlewares/errorHandler.ts";
import { MongoUserRepository } from "../src/infrastructure/repositories/MongoUserRepository.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { InMemoryTaskRepository, minedCommits } from "./task-fakes.mjs";

// mia maintains "shop" (personal project of owen); dev is a member; out is a stranger; admin operates the platform.
// "org-app" belongs to organization Acme (owner olga).
const user = (id, role = UserRole.USER) => ({ id, name: id, email: `${id}@x.io`, role, status: UserStatus.ACTIVE, isVerified: true, tokenVersion: 0 });
const users = [user("owen"), user("mia"), user("dev"), user("out"), user("olga"), user("admin", UserRole.SYSTEM_ADMINISTRATOR)];
const project = (id, userId, organizationId) => ({ id, name: id, userId, organizationId, visibility: RepoVisibility.PRIVATE, status: ProjectStatus.COMPLETED, createdAt: new Date(), updatedAt: new Date() });
const projects = [project("shop", "owen"), project("org-app", "olga", "acme")];
const members = [["shop", "mia", ProjectMemberRole.MAINTAINER], ["shop", "dev", ProjectMemberRole.MEMBER]]
  .map(([projectId, userId, role], i) => ({ id: `m${i}`, projectId, userId, role, status: MemberStatus.ACTIVE }));
const orgMembers = [{ id: "om1", organizationId: "acme", userId: "olga", role: OrganizationRole.OWNER, createdAt: new Date() }];

const projectRepo = {
  async findById(id) { return projects.find(p => p.id === id) ?? null; },
  async findByUserId(userId) { return projects.filter(p => p.userId === userId); },
  async findByOrganizationId(id) { return projects.filter(p => p.organizationId === id); },
  async findByIds(ids) { return projects.filter(p => ids.includes(p.id)); },
};
const memberRepo = {
  async findByProjectAndUserId(projectId, userId) { return members.find(m => m.projectId === projectId && m.userId === userId) ?? null; },
  async findByUserId(userId) { return members.filter(m => m.userId === userId); },
};
const organizations = {
  async findMember(organizationId, userId) { return orgMembers.find(m => m.organizationId === organizationId && m.userId === userId) ?? null; },
  async listMembershipsOfUser(userId) { return orgMembers.filter(m => m.userId === userId); },
  async findById(id) { return id === "acme" ? { id: "acme", name: "Acme" } : null; },
};

const commit = (hash, title, trailers = []) => ({ hash, fullHash: hash.padEnd(40, "0"), title, trailers, author: "dev@x.io", date: new Date("2026-11-10T00:00:00Z") });
const sprint = (id, name, state = "active") => ({ id, name, state });
const issue = (key, { done = false, sprints = [sprint(1, "Sprint 1")], points = 2 } = {}) => ({
  key, fields: { summary: `Do ${key}`, status: { name: done ? "Done" : "In Progress", statusCategory: { key: done ? "done" : "indeterminate" } }, assignee: { displayName: "Mia" }, customfield_10016: points, customfield_10020: sprints },
});
const exportText = (...issues) => JSON.stringify({ issues });

async function start(t, mined = [], architecture = {}, components = []) {
  t.mock.method(MongoUserRepository.prototype, "findById", async id => users.find(u => u.id === id) ?? null);
  const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
  const repo = new InMemoryTaskRepository();
  const link = new LinkCommitsToTasksUseCase(repo, minedCommits(mined));
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/projects", createTaskRouter({ list: new ListTasksUseCase(repo), importTasks: new ImportTasksUseCase(repo, link), link, impact: new TaskImpactUseCase(repo, { ofCommit: async (_p, hash) => architecture[hash] ?? null }, { findByProjectId: async () => ({ diagram: { components, confirmedAt: new Date() } }) }) }, jwt, createProjectRoleMiddleware(projectRepo, memberRepo, organizations)));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/projects`;
  const token = id => jwt.generateTokens(id, users.find(u => u.id === id).role, 0).accessToken;
  const call = async (method, path, as, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${token(as)}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return { call, repo };
}

test("WF07-01 a maintainer imports a Jira export: tasks, sprints and counts come back", async t => {
  const { call } = await start(t);
  const r = await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1"), issue("ARCH-2", { done: true }), issue("T22", { sprints: null })) });
  assert.equal(r.status, 200);
  assert.deepEqual(
    { created: r.json.data.created, updated: r.json.data.updated, removed: r.json.data.removed, sprints: r.json.data.sprints },
    { created: 3, updated: 0, removed: 0, sprints: 1 },
  );
  const board = (await call("GET", "/shop/tasks", "mia")).json.data;
  assert.deepEqual(board.tasks.map(t => [t.key, t.summary, t.status, t.assignee, t.storyPoints, t.sprintName]), [
    ["ARCH-1", "Do ARCH-1", "In Progress", "Mia", 2, "Sprint 1"],
    ["ARCH-2", "Do ARCH-2", "Done", "Mia", 2, "Sprint 1"],
    ["T22", "Do T22", "In Progress", "Mia", 2, null],
  ]);
});

test("WF07-02 importing the same export again creates no duplicate task or sprint", async t => {
  const { call } = await start(t);
  const file = exportText(issue("ARCH-1"), issue("ARCH-2"));
  await call("POST", "/shop/tasks/import", "mia", { file });
  const again = await call("POST", "/shop/tasks/import", "mia", { export: JSON.parse(file) });
  assert.equal(again.status, 200);
  assert.deepEqual([again.json.data.created, again.json.data.unchanged], [0, 2]);
  const board = (await call("GET", "/shop/tasks", "mia")).json.data;
  assert.equal(board.tasks.length, 2);
  assert.equal(board.sprints.length, 1);
});

test("WF07-03 a task missing from the latest export is shown as removed, not deleted", async t => {
  const { call } = await start(t);
  await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1"), issue("ARCH-2")) });
  const r = await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1")) });
  assert.equal(r.json.data.removed, 1);
  const board = (await call("GET", "/shop/tasks", "dev")).json.data;
  const removed = board.tasks.find(t => t.key === "ARCH-2");
  assert.equal(removed.removed, true);
  assert.ok(removed.removedAt);
  assert.deepEqual([board.totals.tasks, board.totals.removed], [1, 1]);
});

test("WF07-04 MSG22: an export with a task without a key is refused whole and changes nothing", async t => {
  const { call } = await start(t);
  await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1")) });
  const bad = await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-5"), { fields: { summary: "lost" } }) });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.fields.messageId, "MSG22");
  assert.match(bad.json.error.message, /MSG22.*task 2.*Nothing was imported/s);
  const board = (await call("GET", "/shop/tasks", "mia")).json.data;
  assert.deepEqual(board.tasks.map(t => [t.key, t.removed]), [["ARCH-1", false]], "ARCH-5 not created, ARCH-1 not removed");
  assert.equal((await call("POST", "/shop/tasks/import", "mia", { file: "{ broken" })).status, 400);
  assert.equal((await call("POST", "/shop/tasks/import", "mia", {})).status, 400);
});

test("WF07-05 permissions: members read, only maintainers import or relink; strangers and anonymous callers get nothing", async t => {
  const { call } = await start(t);
  const file = exportText(issue("ARCH-1"));
  assert.equal((await call("POST", "/shop/tasks/import", "owen", { file })).status, 200, "owner");
  assert.equal((await call("GET", "/shop/tasks", "dev")).status, 200, "member reads");
  assert.equal((await call("POST", "/shop/tasks/import", "dev", { file })).status, 403, "member cannot import");
  assert.equal((await call("POST", "/shop/tasks/link", "dev")).status, 403, "member cannot relink");
  assert.equal((await call("GET", "/shop/tasks", "out")).status, 403, "stranger");
  assert.equal((await call("POST", "/shop/tasks/import", "out", { file })).status, 403);
  assert.equal((await call("GET", "/shop/tasks")).status, 401, "no token");
  assert.equal((await call("GET", "/nope/tasks", "mia")).status, 404);
});

test("WF07-06 sprint progress is Done / total of live tasks; an empty sprint has no percentage", async t => {
  const { call } = await start(t);
  await call("POST", "/shop/tasks/import", "mia", { file: exportText(
    issue("ARCH-1", { done: true }), issue("ARCH-2", { done: true }), issue("ARCH-3"), issue("ARCH-4"),
    issue("ARCH-9", { sprints: [sprint(2, "Sprint 2", "future")] }),
  ) });
  // ARCH-4 leaves the export (removed: out of the total); Sprint 2 loses its only task (empty: no percentage).
  await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1", { done: true }), issue("ARCH-2", { done: true }), issue("ARCH-3"), { key: "ARCH-10", fields: { summary: "x", customfield_10020: [sprint(2, "Sprint 2", "future")] } }) });
  await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1", { done: true }), issue("ARCH-2", { done: true }), issue("ARCH-3"), { key: "ARCH-11", fields: { summary: "y", customfield_10020: [sprint(3, "Sprint 3", "future")] } }) });
  const board = (await call("GET", "/shop/tasks", "mia")).json.data;
  const progress = Object.fromEntries(board.sprints.map(s => [s.name, [s.progress.done, s.progress.total, s.progress.percent, s.removed]]));
  assert.deepEqual(progress["Sprint 1"], [2, 3, 67, false]);
  assert.deepEqual(progress["Sprint 2"], [0, 0, null, true]);
  assert.deepEqual(progress["Sprint 3"], [0, 1, 0, false]);
});

test("WF07-08 relinking links commits mined before the import, once, and lists them under each task", async t => {
  const mined = [commit("aaaaaaa", "feat(cart): ARCH-1 add cart"), commit("bbbbbbb", "fix(cart): rounding", ["Task: ARCH-1, T22"])];
  const { call } = await start(t, mined);
  const imported = await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1"), issue("T22")) });
  assert.equal(imported.json.data.links.linked, 3, "import links what was mined before");
  const relink = await call("POST", "/shop/tasks/link", "mia");
  assert.equal(relink.status, 200);
  assert.equal(relink.json.data.linked, 0, "nothing new: no duplicate link");
  const board = (await call("GET", "/shop/tasks", "dev")).json.data;
  assert.deepEqual(board.tasks.find(t => t.key === "ARCH-1").commits.map(c => [c.hash, c.source]).sort(), [["aaaaaaa", "subject"], ["bbbbbbb", "trailer"]]);
  assert.deepEqual(board.tasks.find(t => t.key === "T22").commits.map(c => c.hash), ["bbbbbbb"]);
  assert.equal(board.totals.linkedCommits, 2);
});

test("WF07-09 a System Administrator cannot read the tasks of an organization's workspace", async t => {
  const { call } = await start(t);
  assert.equal((await call("POST", "/org-app/tasks/import", "olga", { file: exportText(issue("ACME-1")) })).status, 200);
  const r = await call("GET", "/org-app/tasks", "admin");
  assert.equal(r.status, 403);
  assert.equal(JSON.stringify(r.json).includes("ACME-1"), false);
  assert.equal((await call("POST", "/org-app/tasks/import", "admin", { file: exportText(issue("ACME-2")) })).status, 403);
});

test("WF07-10 commits naming unknown keys are reported and not linked to anything", async t => {
  const mined = [commit("ccccccc", "docs: see ARCH-404 and HTTP2"), commit("ddddddd", "chore: tidy")];
  const { call, repo } = await start(t, mined);
  const r = await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("ARCH-1")) });
  assert.deepEqual(r.json.data.links, { commits: 2, linked: 0, unknownKeys: ["ARCH-404", "HTTP2"] });
  assert.equal(repo.links.length, 0);
});

test("WF07-E2E DS-07a: import, link mined commits, open T47: its commits, evidence and components; members read, strangers do not", async t => {
  const g = edges => ({ nodes: ["src/orders/o.ts", "src/billing/b.ts"].map(id => ({ id })), edges: edges.map(([source, target]) => ({ source, target })) });
  const mined = [commit("aaaaaaa", "feat(billing): T47 bill reads orders"), commit("bbbbbbb", "fix(orders): rounding", ["Task: T22"])];
  const architecture = {
    aaaaaaa: { depAdded: 1, depRemoved: 0, graph: g([["src/billing/b.ts", "src/orders/o.ts"]]), baseGraph: g([]), evidenceId: "ev-1" },
    bbbbbbb: { depAdded: 0, depRemoved: 0, graph: g([["src/billing/b.ts", "src/orders/o.ts"]]), baseGraph: g([["src/billing/b.ts", "src/orders/o.ts"]]), evidenceId: null },
  };
  const components = [{ id: "orders", name: "Orders", pathPrefixes: ["src/orders"] }, { id: "billing", name: "Billing", pathPrefixes: ["src/billing"] }];
  const { call } = await start(t, mined, architecture, components);
  // An export with two sprints, as in DS-07a.
  const imported = await call("POST", "/shop/tasks/import", "mia", { file: exportText(issue("T47"), issue("T22", { sprints: [sprint(2, "Sprint 2", "future")] })) });
  assert.equal(imported.json.data.created, 2);
  assert.equal(imported.json.data.links.linked, 2);
  const board = (await call("GET", "/shop/tasks", "dev")).json.data;
  assert.deepEqual(board.sprints.map(s => s.name), ["Sprint 1", "Sprint 2"]);
  const impact = await call("GET", "/shop/tasks/T47/impact", "dev");
  assert.equal(impact.status, 200);
  assert.deepEqual(impact.json.data.commits.map(c => [c.hash, c.evidenceId, c.components, c.edges]), [["aaaaaaa", "ev-1", ["Billing", "Orders"], [{ source: "Billing", target: "Orders", added: 1, removed: 0 }]]]);
  assert.deepEqual(impact.json.data.totals.components, ["Billing", "Orders"]);
  assert.equal((await call("GET", "/shop/tasks/T22/impact", "dev")).json.data.totals.architecturalCommits, 0);
  assert.equal((await call("GET", "/shop/tasks/T99/impact", "dev")).status, 404);
  assert.equal((await call("GET", "/shop/tasks/T47/impact", "out")).status, 403);
  assert.equal((await call("GET", "/shop/tasks/T47/impact")).status, 401);
});
