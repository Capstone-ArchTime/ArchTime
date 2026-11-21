import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { ProjectStatus, RepoVisibility } from "../src/domain/entities/Project.ts";
import { issueFields, JiraClientError, normalizeJiraSite, normalizeJql } from "../src/domain/tasks/jiraConnection.ts";
import { JiraCloudClient } from "../src/infrastructure/jira/JiraCloudClient.ts";
import { JiraConnectionUseCases } from "../src/application/use-cases/tasks/JiraUseCases.ts";
import { ImportTasksUseCase, LinkCommitsToTasksUseCase, ListTasksUseCase } from "../src/application/use-cases/tasks/TaskUseCases.ts";
import { createTaskRouter } from "../src/presentation/routes/task.routes.ts";
import { createProjectRoleMiddleware } from "../src/presentation/middlewares/projectRole.ts";
import { errorHandler } from "../src/presentation/middlewares/errorHandler.ts";
import { MongoUserRepository } from "../src/infrastructure/repositories/MongoUserRepository.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { InMemoryTaskRepository, minedCommits } from "./task-fakes.mjs";

// F-13: a workspace reads its tasks straight from Jira Cloud (site, account e-mail + API token, JQL) instead of an
// uploaded export. The issues go through the export parser and the import, so the file rules hold for a sync too.

test("the site must be a Jira Cloud site: other hosts, schemes, ports and credentials in the URL are refused", () => {
  for (const ok of ["archtime", "archtime.atlassian.net", "https://archtime.atlassian.net", "https://ArchTime.atlassian.net/jira/software/projects/SCRUM/boards/1", " archtime.atlassian.net/ "]) {
    assert.equal(normalizeJiraSite(ok), "https://archtime.atlassian.net", ok);
  }
  for (const bad of ["", "   ", null, 42, "http://archtime.atlassian.net", "https://archtime.atlassian.net:8443", "https://user:pw@archtime.atlassian.net",
    "https://localhost", "https://127.0.0.1", "https://169.254.169.254", "https://atlassian.net", "https://archtime.atlassian.net.evil.io",
    "https://evil.io/archtime.atlassian.net", "file:///etc/passwd", "https://a..atlassian.net", "-x.atlassian.net"]) {
    assert.equal(normalizeJiraSite(bad), null, String(bad));
  }
  assert.equal(normalizeJql("  project = SCRUM  "), "project = SCRUM");
  assert.equal(normalizeJql(" "), null);
  assert.equal(normalizeJql("x".repeat(2001)), null);
});

test("story points and the sprint field are found by name and by type, whatever the site calls them", () => {
  const { fields, names } = issueFields([
    { id: "summary", name: "Summary" },
    { id: "customfield_10016", name: "Story point estimate" },
    { id: "customfield_10028", name: "Story Points" },
    { id: "customfield_10020", name: "Lượt chạy", schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" } },
    { id: "customfield_10019", name: "Rank" },
  ]);
  assert.deepEqual(fields, ["summary", "status", "assignee", "customfield_10016", "customfield_10028", "customfield_10020"]);
  assert.deepEqual(names, { customfield_10016: "Story point estimate", customfield_10028: "Story Points", customfield_10020: "Sprint" });
});

// ── The client against a fake Jira ──

const credentials = { site: "https://archtime.atlassian.net", email: "lead@example.com", token: "secret-token" };
const FIELDS = [{ id: "customfield_10016", name: "Story point estimate" }, { id: "customfield_10020", name: "Sprint", schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" } }];
const jiraIssue = (key, done = false) => ({
  key, fields: { summary: `Do ${key}`, status: { name: done ? "Done" : "To Do", statusCategory: { key: done ? "done" : "new" } }, assignee: { displayName: "Mia" }, customfield_10016: 3, customfield_10020: [{ id: 1, name: "Sprint 1", state: "active" }] },
});

/** A fake Jira: answers /field, /myself and /search/jql in pages of `pageSize`, and records every request. */
function fakeJira({ issues = [], pageSize = 2, status = 200, body } = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const parsed = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url: String(url), method: init.method, headers: init.headers, body: parsed, redirect: init.redirect });
    if (status !== 200) return Response.json(body ?? {}, { status });
    if (u.pathname === "/rest/api/3/myself") return Response.json({ displayName: "Lead" });
    if (u.pathname === "/rest/api/3/field") return Response.json(FIELDS);
    if (u.pathname === "/rest/api/3/search/jql") {
      const start = parsed.nextPageToken ? Number(parsed.nextPageToken) : 0;
      const page = issues.slice(start, start + pageSize);
      const next = start + pageSize;
      return Response.json(next < issues.length ? { issues: page, nextPageToken: String(next), isLast: false } : { issues: page, isLast: true });
    }
    return Response.json({}, { status: 404 });
  };
  return { fetchImpl, requests };
}

test("the client signs in with the e-mail and token, reads every page, and asks only for the fields it needs", async () => {
  const jira = fakeJira({ issues: ["A-1", "A-2", "A-3", "A-4", "A-5"].map(k => jiraIssue(k)) });
  const client = new JiraCloudClient(jira.fetchImpl);
  assert.equal(await client.myself(credentials), "Lead");
  const result = await client.searchIssues(credentials, "project = A");
  assert.deepEqual(result.issues.map(i => i.key), ["A-1", "A-2", "A-3", "A-4", "A-5"]);
  assert.deepEqual(result.names, { customfield_10016: "Story point estimate", customfield_10020: "Sprint" });
  const searches = jira.requests.filter(r => r.url.endsWith("/search/jql"));
  assert.equal(searches.length, 3, "5 issues in pages of 2");
  assert.deepEqual(searches[0].body, { jql: "project = A", fields: ["summary", "status", "assignee", "customfield_10016", "customfield_10020"], maxResults: 100 });
  assert.equal(searches[1].body.nextPageToken, "2");
  assert.equal(jira.requests[0].headers.Authorization, `Basic ${Buffer.from("lead@example.com:secret-token").toString("base64")}`);
  assert.ok(jira.requests.every(r => r.url.startsWith("https://archtime.atlassian.net/rest/api/3/") && r.redirect === "error"), "never follows a redirect off the site");
});

test("the client words Jira's refusals, and never reports one as a sign-in failure of ArchTime", async () => {
  const fails = async (options, kind, pattern) => {
    const err = await new JiraCloudClient(fakeJira(options).fetchImpl).searchIssues(credentials, "bad jql").catch(e => e);
    assert.ok(err instanceof JiraClientError, String(err));
    assert.equal(err.kind, kind);
    assert.match(err.message, pattern);
  };
  await fails({ status: 401 }, "auth", /refused the e-mail or API token/);
  await fails({ status: 403 }, "forbidden", /not allowed/);
  await fails({ status: 404 }, "not-found", /No Jira site answers at https:\/\/archtime\.atlassian\.net/);
  await fails({ status: 429 }, "rate-limited", /Try again in a minute/);
  const offline = new JiraCloudClient(async () => { throw new TypeError("fetch failed"); });
  assert.equal((await offline.myself(credentials).catch(e => e)).kind, "unreachable");
});

test("a JQL Jira refuses comes back with Jira's own reason", async () => {
  const fetchImpl = async url => String(url).endsWith("/field") ? Response.json(FIELDS)
    : Response.json({ errorMessages: ["Field 'projct' does not exist or you do not have permission to view it."] }, { status: 400 });
  const err = await new JiraCloudClient(fetchImpl).searchIssues(credentials, "projct = A").catch(e => e);
  assert.equal(err.kind, "jql");
  assert.match(err.message, /Jira refused the JQL: Field 'projct' does not exist/);
});

// ── Routes, end to end with a fake Jira ──

const user = (id, role = UserRole.USER) => ({ id, name: id, email: `${id}@x.io`, role, status: UserStatus.ACTIVE, isVerified: true, tokenVersion: 0 });
const users = [user("owen"), user("mia"), user("dev"), user("out")];
const projects = [{ id: "shop", name: "shop", userId: "owen", visibility: RepoVisibility.PRIVATE, status: ProjectStatus.COMPLETED, createdAt: new Date(), updatedAt: new Date() }];
const members = [["mia", ProjectMemberRole.MAINTAINER], ["dev", ProjectMemberRole.MEMBER]].map(([userId, role], i) => ({ id: `m${i}`, projectId: "shop", userId, role, status: MemberStatus.ACTIVE }));
const projectRepo = {
  async findById(id) { return projects.find(p => p.id === id) ?? null; },
  async findByUserId(userId) { return projects.filter(p => p.userId === userId); },
  async findByOrganizationId() { return []; },
  async findByIds(ids) { return projects.filter(p => ids.includes(p.id)); },
};
const memberRepo = {
  async findByProjectAndUserId(projectId, userId) { return members.find(m => m.projectId === projectId && m.userId === userId) ?? null; },
  async findByUserId(userId) { return members.filter(m => m.userId === userId); },
};
const organizations = { async findMember() { return null; }, async listMembershipsOfUser() { return []; }, async findById() { return null; } };

/** Same contract as MongoJiraConnectionRepository, the token kept in memory. */
class InMemoryJiraConnections {
  constructor() { this.rows = new Map(); }
  async find(projectId) { const r = this.rows.get(projectId); if (!r) return null; const { token: _t, ...view } = r; return { ...view }; }
  async token(projectId) { return this.rows.get(projectId)?.token ?? null; }
  async save(projectId, input) {
    const old = this.rows.get(projectId);
    const token = input.token ?? old.token;
    this.rows.set(projectId, { site: input.site, email: input.email, jql: input.jql, token, tokenLast4: token.slice(-4), lastSyncAt: old?.lastSyncAt ?? null, updatedAt: new Date() });
    return this.find(projectId);
  }
  async remove(projectId) { return this.rows.delete(projectId); }
  async markSynced(projectId, at) { this.rows.get(projectId).lastSyncAt = at; }
}

async function start(t, jira) {
  t.mock.method(MongoUserRepository.prototype, "findById", async id => users.find(u => u.id === id) ?? null);
  const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
  const repo = new InMemoryTaskRepository();
  const link = new LinkCommitsToTasksUseCase(repo, minedCommits([]));
  const importTasks = new ImportTasksUseCase(repo, link);
  const connections = new InMemoryJiraConnections();
  const app = express();
  app.use(express.json());
  app.use("/api/projects", createTaskRouter({
    list: new ListTasksUseCase(repo), importTasks, link,
    jira: new JiraConnectionUseCases(connections, new JiraCloudClient(jira.fetchImpl), importTasks),
  }, jwt, createProjectRoleMiddleware(projectRepo, memberRepo, organizations)));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/projects`;
  const call = async (method, path, as, body) => {
    const headers = { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${jwt.generateTokens(as, UserRole.USER, 0).accessToken}` } : {}) };
    const res = await fetch(`${base}${path}`, { method, headers, ...(body !== undefined && method !== "GET" ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return { call, connections, repo };
}

const connect = { site: "archtime.atlassian.net", email: "lead@example.com", token: "secret-token-abcd", jql: "project = A" };

test("JIRA-01 a maintainer connects Jira and syncs: the tasks and sprints of the JQL appear; the token never comes back", async t => {
  const inJira = [jiraIssue("A-1"), jiraIssue("A-2", true), jiraIssue("A-3")];
  const jira = fakeJira({ issues: inJira });
  const { call } = await start(t, jira);
  assert.equal((await call("GET", "/shop/tasks/jira", "mia")).json.data, null, "not connected yet");

  const saved = await call("PUT", "/shop/tasks/jira", "mia", connect);
  assert.equal(saved.status, 200);
  assert.equal(saved.json.data.account, "Lead");
  assert.deepEqual([saved.json.data.site, saved.json.data.tokenLast4], ["https://archtime.atlassian.net", "abcd"]);
  const shown = (await call("GET", "/shop/tasks/jira", "mia")).json.data;
  assert.ok(!JSON.stringify(shown).includes("secret-token"), "the token is not sent back");

  const synced = await call("POST", "/shop/tasks/jira/sync", "mia");
  assert.equal(synced.status, 200);
  assert.deepEqual([synced.json.data.issues, synced.json.data.created, synced.json.data.sprints], [3, 3, 1]);
  const board = (await call("GET", "/shop/tasks", "dev")).json.data;
  assert.deepEqual(board.tasks.map(x => [x.key, x.summary, x.statusCategory, x.storyPoints, x.sprintName]), [
    ["A-1", "Do A-1", "todo", 3, "Sprint 1"], ["A-2", "Do A-2", "done", 3, "Sprint 1"], ["A-3", "Do A-3", "todo", 3, "Sprint 1"],
  ]);
  assert.ok((await call("GET", "/shop/tasks/jira", "mia")).json.data.lastSyncAt);

  // Syncing again changes nothing; an issue gone from Jira is marked removed, as with a file.
  const again = await call("POST", "/shop/tasks/jira/sync", "mia");
  assert.deepEqual([again.json.data.created, again.json.data.unchanged], [0, 3]);
  inJira.pop();
  const afterDelete = await call("POST", "/shop/tasks/jira/sync", "mia");
  assert.deepEqual([afterDelete.json.data.issues, afterDelete.json.data.removed], [2, 1]);
  assert.equal((await call("GET", "/shop/tasks", "dev")).json.data.tasks.find(x => x.key === "A-3").removed, true);
});

test("JIRA-02 a connection Jira refuses is not stored, and bad fields are named", async t => {
  const { call, connections } = await start(t, fakeJira({ status: 401 }));
  const refused = await call("PUT", "/shop/tasks/jira", "mia", connect);
  assert.equal(refused.status, 400, "a 401 from Jira must not sign the ArchTime user out");
  assert.match(refused.json.error.message, /refused the e-mail or API token/);
  assert.equal(connections.rows.size, 0);

  const bad = await call("PUT", "/shop/tasks/jira", "mia", { site: "https://169.254.169.254", email: "nope", jql: "" });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.json.error.fields).sort(), ["email", "jql", "site"]);
  assert.equal((await call("PUT", "/shop/tasks/jira", "mia", { ...connect, token: "" })).json.error.fields.token, "required", "a first connection needs a token");
});

test("JIRA-03 changing the JQL keeps the stored token; a JQL matching nothing changes nothing", async t => {
  const jira = fakeJira({ issues: [jiraIssue("A-1")] });
  const { call, connections } = await start(t, jira);
  await call("PUT", "/shop/tasks/jira", "mia", connect);
  await call("POST", "/shop/tasks/jira/sync", "mia");
  const changed = await call("PUT", "/shop/tasks/jira", "mia", { ...connect, token: undefined, jql: "project = B" });
  assert.equal(changed.status, 200);
  assert.equal(await connections.token("shop"), "secret-token-abcd");
  assert.equal(jira.requests.at(-1).headers.Authorization, `Basic ${Buffer.from("lead@example.com:secret-token-abcd").toString("base64")}`, "checked with the stored token");

  const empty = await start(t, fakeJira({ issues: [] }));
  await empty.call("PUT", "/shop/tasks/jira", "mia", connect);
  await empty.repo.applyImport("shop", { create: [{ key: "A-9", summary: "", status: null, statusCategory: "todo", assignee: null, storyPoints: null, sprintId: null }], update: [], unchanged: [], remove: [], restore: [], sprints: { upsert: [], remove: [] } }, new Date());
  const r = await empty.call("POST", "/shop/tasks/jira/sync", "mia");
  assert.equal(r.status, 400);
  assert.match(r.json.error.message, /matches no issue/);
  assert.deepEqual((await empty.call("GET", "/shop/tasks", "mia")).json.data.tasks.map(x => [x.key, x.removed]), [["A-9", false]], "nothing marked removed");
});

test("JIRA-04 only maintainers see, change, sync or remove the connection; removing it keeps the tasks", async t => {
  const { call } = await start(t, fakeJira({ issues: [jiraIssue("A-1")] }));
  await call("PUT", "/shop/tasks/jira", "owen", connect);
  await call("POST", "/shop/tasks/jira/sync", "owen");
  for (const [method, path] of [["GET", "/shop/tasks/jira"], ["PUT", "/shop/tasks/jira"], ["POST", "/shop/tasks/jira/sync"], ["DELETE", "/shop/tasks/jira"]]) {
    assert.equal((await call(method, path, "dev", connect)).status, 403, `member ${method} ${path}`);
    assert.equal((await call(method, path, "out", connect)).status, 404, `stranger ${method} ${path}`);
    assert.equal((await call(method, path, undefined, connect)).status, 401);
  }
  assert.equal((await call("DELETE", "/shop/tasks/jira", "mia")).status, 200);
  assert.equal((await call("GET", "/shop/tasks/jira", "mia")).json.data, null);
  assert.equal((await call("GET", "/shop/tasks", "dev")).json.data.tasks.length, 1, "the synced tasks stay");
  assert.equal((await call("DELETE", "/shop/tasks/jira", "mia")).status, 404);
  assert.equal((await call("POST", "/shop/tasks/jira/sync", "mia")).status, 404);
});

test("JIRA-05 Jira out of reach is a 503 and the board is untouched", async t => {
  const { call, connections } = await start(t, fakeJira({ issues: [jiraIssue("A-1")] }));
  await call("PUT", "/shop/tasks/jira", "mia", connect);
  const down = new JiraConnectionUseCases(connections, new JiraCloudClient(async () => { throw new TypeError("fetch failed"); }), { execute: async () => assert.fail("nothing is imported") });
  const err = await down.sync("shop").catch(e => e);
  assert.equal(err.statusCode, 503);
  assert.match(err.message, /Could not reach Jira at https:\/\/archtime\.atlassian\.net/);
});
