// T50: system test of roles, organizations and project permissions, over HTTP.
// The real routers (organizations, admin, projects, onboarding), the real authentication and authorization middleware,
// the real ProjectAccessPolicy and the real organization use cases run here; only storage is in memory, and the
// controllers behind the project routes answer "allowed" so the test sees exactly what the permission layer decides.
// Each test is one scenario of the System Test Report (docs/system-test-report.md).
import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { OrganizationRole } from "../src/domain/entities/Organization.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { ProjectStatus, RepoVisibility } from "../src/domain/entities/Project.ts";
import { OrganizationUseCases } from "../src/application/use-cases/organizations/OrganizationUseCases.ts";
import { GetAdminOrganizationsUseCase } from "../src/application/use-cases/admin/GetAdminOrganizationsUseCase.ts";
import { OrganizationController } from "../src/presentation/controllers/OrganizationController.ts";
import { AdminOrganizationController } from "../src/presentation/controllers/AdminOrganizationController.ts";
import { createOrganizationRouter } from "../src/presentation/routes/organization.routes.ts";
import { createAdminRouter } from "../src/presentation/routes/admin.routes.ts";
import { createProjectRouter } from "../src/presentation/routes/project.routes.ts";
import { createOnboardingRouter } from "../src/presentation/routes/onboarding.routes.ts";
import { createProjectRoleMiddleware } from "../src/presentation/middlewares/projectRole.ts";
import { errorHandler } from "../src/presentation/middlewares/errorHandler.ts";
import { MongoUserRepository } from "../src/infrastructure/repositories/MongoUserRepository.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { AuditService } from "../src/infrastructure/services/AuditService.ts";

// ── the world ────────────────────────────────────────────────────────────────
// Acme: alice (owner), bob (member; maintainer of acme-api), carl (member; newcomer on acme-api), frank (member;
// maintainer of acme-web, removed in scenario 4). Beta: dora (owner). eve: no organization, two personal projects.
const user = (id, name, role = UserRole.USER, extra = {}) => ({ id, name, email: `${id}@x.io`, role, status: UserStatus.ACTIVE, isVerified: true, tokenVersion: 0, ...extra });

function world() {
  const users = [
    user("admin", "Ada Admin", UserRole.SYSTEM_ADMINISTRATOR), user("alice", "Alice"), user("bob", "Bob"), user("carl", "Carl"),
    user("dora", "Dora"), user("eve", "Eve"), user("frank", "Frank"), user("gina", "Gina"),
    user("sam", "Suspended Sam", UserRole.USER, { status: UserStatus.SUSPENDED }),
  ];
  const orgs = [
    { id: "acme", name: "Acme", createdBy: "alice", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") },
    { id: "beta", name: "Beta", createdBy: "dora", createdAt: new Date("2026-02-01"), updatedAt: new Date("2026-02-01") },
  ];
  const orgMembers = [
    ["acme", "alice", OrganizationRole.OWNER], ["acme", "bob", OrganizationRole.MEMBER], ["acme", "carl", OrganizationRole.MEMBER],
    ["acme", "frank", OrganizationRole.MEMBER], ["beta", "dora", OrganizationRole.OWNER],
  ].map(([organizationId, userId, role], i) => ({ id: `om${i}`, organizationId, userId, role, createdAt: new Date() }));
  const project = (id, userId, organizationId, visibility = RepoVisibility.PRIVATE) => ({
    id, name: id, userId, organizationId, visibility, status: ProjectStatus.COMPLETED, repoUrl: `https://git.example/${id}.git`,
    description: `${id} internals`, createdAt: new Date(), updatedAt: new Date(),
  });
  const projects = [
    project("acme-api", "alice", "acme", RepoVisibility.PUBLIC), // public, but an organization project: still members only
    project("acme-web", "alice", "acme"), project("beta-core", "dora", "beta"),
    project("eve-public", "eve", undefined, RepoVisibility.PUBLIC), project("eve-private", "eve", undefined),
    project("frank-own", "frank", undefined),
  ];
  const projectMembers = [
    ["acme-api", "bob", ProjectMemberRole.MAINTAINER], ["acme-api", "carl", ProjectMemberRole.MEMBER],
    ["acme-web", "frank", ProjectMemberRole.MAINTAINER], ["frank-own", "carl", ProjectMemberRole.MEMBER],
  ].map(([projectId, userId, role], i) => ({ id: `pm${i}`, projectId, userId, role, status: MemberStatus.ACTIVE }));

  const organizations = {
    async create(d) { const o = { id: `org${orgs.length}`, ...d, createdAt: new Date(), updatedAt: new Date() }; orgs.push(o); return o; },
    async findById(id) { return orgs.find((o) => o.id === id) ?? null; },
    async findByIds(ids) { return orgs.filter((o) => ids.includes(o.id)); },
    async update(id, patch) { const o = orgs.find((x) => x.id === id); if (o) Object.assign(o, patch); return o ?? null; },
    async addMember(d) { const m = { id: `om${orgMembers.length + 10}`, ...d, createdAt: new Date() }; orgMembers.push(m); return m; },
    async findMember(organizationId, userId) { return orgMembers.find((m) => m.organizationId === organizationId && m.userId === userId && m.status !== "invited") ?? null; },
    async findMemberOrInvitation(organizationId, userId) { return orgMembers.find((m) => m.organizationId === organizationId && m.userId === userId) ?? null; },
    async listInvited(organizationId) { return orgMembers.filter((m) => m.organizationId === organizationId && m.status === "invited"); },
    async listInvitationsOfUser(userId) { return orgMembers.filter((m) => m.userId === userId && m.status === "invited"); },
    async activateMember(id) { const m = orgMembers.find((x) => x.id === id && x.status === "invited"); if (m) m.status = "active"; return m ?? null; },
    async findMemberById(organizationId, id) { return orgMembers.find((m) => m.organizationId === organizationId && m.id === id) ?? null; },
    async listMembers(organizationId) { return orgMembers.filter((m) => m.organizationId === organizationId && m.status !== "invited"); },
    async listMembershipsOfUser(userId) { return orgMembers.filter((m) => m.userId === userId && m.status !== "invited"); },
    async updateMemberRole(id, role) { const m = orgMembers.find((x) => x.id === id); if (m) m.role = role; return m ?? null; },
    async removeMember(id) { const i = orgMembers.findIndex((m) => m.id === id); if (i < 0) return false; orgMembers.splice(i, 1); return true; },
    async countOwners(organizationId) { return orgMembers.filter((m) => m.organizationId === organizationId && m.role === OrganizationRole.OWNER && m.status !== "invited").length; },
    async findPaginated({ page, limit }) { return { items: orgs.slice((page - 1) * limit, page * limit), total: orgs.length }; },
  };
  const projectRepo = {
    async findById(id) { return projects.find((p) => p.id === id) ?? null; },
    async findByUserId(userId) { return projects.filter((p) => p.userId === userId); },
    async findByOrganizationId(organizationId) { return projects.filter((p) => p.organizationId === organizationId); },
    async findByIds(ids) { return projects.filter((p) => ids.includes(p.id)); },
  };
  const memberRepo = {
    async findByProjectAndUserId(projectId, userId) { return projectMembers.find((m) => m.projectId === projectId && m.userId === userId) ?? null; },
    async findByUserId(userId) { return projectMembers.filter((m) => m.userId === userId); },
    async deleteByUserInProjects(userId, projectIds) {
      const before = projectMembers.length;
      for (let i = projectMembers.length - 1; i >= 0; i--) if (projectMembers[i].userId === userId && projectIds.includes(projectMembers[i].projectId)) projectMembers.splice(i, 1);
      return before - projectMembers.length;
    },
  };
  const userRepo = {
    async findById(id) { return users.find((u) => u.id === id) ?? null; },
    async findByEmail(email) { return users.find((u) => u.email === email) ?? null; },
  };
  const pendingInvitations = [{ projectId: "acme-api", email: "frank@x.io" }];
  const invitationStore = {
    async cancelPending(projectIds, email) {
      const before = pendingInvitations.length;
      for (let i = pendingInvitations.length - 1; i >= 0; i--) if (projectIds.includes(pendingInvitations[i].projectId) && pendingInvitations[i].email === email) pendingInvitations.splice(i, 1);
      return before - pendingInvitations.length;
    },
  };
  return { users, orgs, orgMembers, projects, projectMembers, pendingInvitations, organizations, projectRepo, memberRepo, userRepo, invitationStore };
}

/** A controller whose every handler answers 200 with its name: the response says the permission layer let it through. */
const allowAll = () => new Proxy({}, { get: (_t, name) => (_req, res) => res.json({ handler: String(name) }) });

async function start(t) {
  const w = world();
  const audits = [];
  t.mock.method(MongoUserRepository.prototype, "findById", async (id) => w.userRepo.findById(id));
  t.mock.method(AuditService, "log", async (entry) => { audits.push(entry); });
  const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
  const checkRole = createProjectRoleMiddleware(w.projectRepo, w.memberRepo, w.organizations);
  const orgUseCases = new OrganizationUseCases(w.organizations, w.userRepo, w.projectRepo, w.memberRepo, w.invitationStore);

  const app = express();
  app.use(express.json());
  app.use("/api/organizations", createOrganizationRouter(new OrganizationController(orgUseCases, allowAll()), jwt));
  app.use("/api/admin", createAdminRouter({
    userController: allowAll(), jobController: allowAll(), auditController: allowAll(), settingsController: allowAll(), metricsController: allowAll(), llmController: allowAll(),
    organizationController: new AdminOrganizationController(new GetAdminOrganizationsUseCase(w.organizations, w.projectRepo, w.userRepo)),
  }, jwt));
  app.use("/api/projects", createOnboardingRouter(allowAll(), jwt, checkRole));
  app.use("/api/projects", createProjectRouter(allowAll(), jwt, allowAll(), checkRole, allowAll(), allowAll()));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const tokenOf = (id) => { const u = w.users.find((x) => x.id === id); return jwt.generateTokens(id, u.role, u.tokenVersion).accessToken; };
  const call = async (method, path, as, body) => {
    const headers = { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${typeof as === "string" && as.includes(".") ? as : tokenOf(as)}` } : {}) };
    const res = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : null };
  };
  const status = async (method, path, as, body) => (await call(method, path, as, body)).status;
  return { w, call, status, tokenOf, audits };
}

// ── scenarios ────────────────────────────────────────────────────────────────

test("S01 System Administrator manages organizations: lists them and reads their metadata", async (t) => {
  const { call } = await start(t);
  const list = await call("GET", "/admin/organizations", "admin");
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.data.organizations.map((o) => [o.name, o.memberCount, o.projectCount]), [["Acme", 4, 2], ["Beta", 1, 1]]);
  const acme = await call("GET", "/admin/organizations/acme", "admin");
  assert.equal(acme.status, 200);
  assert.deepEqual(acme.json.data.organization.projects.map((p) => p.name).sort(), ["acme-api", "acme-web"]);
  assert.equal(acme.text.includes("git.example"), false, "no repository address");
  assert.equal(acme.text.includes("internals"), false, "no project description");
});

test("S02 Organization Owner sees their own organization, with its members", async (t) => {
  const { call } = await start(t);
  const mine = await call("GET", "/organizations", "alice");
  assert.deepEqual(mine.json.data.organizations.map((o) => [o.name, o.myRole]), [["Acme", "owner"]]);
  assert.equal((await call("GET", "/organizations/acme", "alice")).status, 200);
  assert.equal((await call("GET", "/organizations/acme/members", "alice")).json.data.members.length, 4);
});

test("S03 Organization Owner adds members; a member cannot", async (t) => {
  const { status, w } = await start(t);
  assert.equal(await status("POST", "/organizations/acme/members", "alice", { email: "gina@x.io" }), 201);
  assert.ok(w.orgMembers.some((m) => m.organizationId === "acme" && m.userId === "gina"));
  assert.equal(await status("POST", "/organizations/acme/members", "bob", { email: "eve@x.io" }), 403);
  assert.equal(await status("POST", "/organizations/acme/members", "dora", { email: "eve@x.io" }), 404, "another organization's owner cannot even see it");
});

test("S04 Organization Owner removes a member: memberships in its projects and pending invitations end, and it is audited", async (t) => {
  const { call, status, w, audits } = await start(t);
  const frank = w.orgMembers.find((m) => m.userId === "frank");
  assert.equal(await status("DELETE", `/organizations/acme/members/${frank.id}`, "bob"), 403, "a member cannot remove someone else");
  const removed = await call("DELETE", `/organizations/acme/members/${frank.id}`, "alice");
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.json.data, { removedProjectMemberships: 1, cancelledInvitations: 1 });
  assert.ok(audits.some((a) => a.action === "ORGANIZATION_MEMBER_REMOVE" && a.userId === "alice"));
  const owner = w.orgMembers.find((m) => m.userId === "alice");
  assert.equal(await status("DELETE", `/organizations/acme/members/${owner.id}`, "alice"), 400, "the last owner cannot be removed");
});

test("S05 A removed member loses every project of the organization at once, with the same token; personal work is untouched", async (t) => {
  const { status, w, tokenOf } = await start(t);
  const token = tokenOf("frank"); // signed in before the removal
  assert.equal(await status("GET", "/projects/acme-web/snapshots", token), 200, "before: maintainer of acme-web");
  const frank = w.orgMembers.find((m) => m.userId === "frank");
  assert.equal(await status("DELETE", `/organizations/acme/members/${frank.id}`, "alice"), 200);
  for (const [method, path] of [["GET", "/projects/acme-web"], ["GET", "/projects/acme-web/snapshots"], ["POST", "/projects/acme-web/diagram/confirm"], ["GET", "/projects/acme-api/snapshots"]]) {
    assert.equal(await status(method, path, token), 403, `${method} ${path}`);
  }
  assert.equal(await status("GET", "/organizations/acme", token), 404);
  assert.equal(await status("GET", "/projects/frank-own/snapshots", token), 200, "their own personal project");
  assert.ok(w.projectMembers.some((m) => m.projectId === "frank-own" && m.userId === "carl"), "memberships in personal projects are kept");
});

test("S06 A member of one organization cannot reach another organization or its projects", async (t) => {
  const { status } = await start(t);
  assert.equal(await status("GET", "/organizations/beta", "bob"), 404, "not even its existence");
  assert.equal(await status("GET", "/organizations/beta/members", "bob"), 404);
  assert.equal(await status("GET", "/projects/beta-core", "bob"), 403);
  assert.equal(await status("GET", "/projects/beta-core/snapshots", "alice"), 403, "owning one organization gives nothing in another");
  assert.equal(await status("GET", "/projects/acme-api/snapshots", "dora"), 403, "a public organization project is still members only");
});

test("S07 Project Owner manages the project: members, invitations, approvals, deletion", async (t) => {
  const { status } = await start(t);
  for (const [method, path] of [["POST", "/projects/acme-api/members/invite"], ["GET", "/projects/acme-api/invitations"], ["POST", "/projects/acme-api/approvals/a1/approve"], ["DELETE", "/projects/acme-api"]]) {
    assert.equal(await status(method, path, "alice"), 200, `${method} ${path}`);
  }
  assert.equal(await status("DELETE", "/projects/eve-private", "eve"), 200, "personal project owner too");
});

test("S08 Maintainer (Mentor) manages knowledge: diagram, decisions, rules, learning paths; cannot delete the project", async (t) => {
  const { status } = await start(t);
  for (const [method, path] of [
    ["POST", "/projects/acme-api/diagram/confirm"], ["POST", "/projects/acme-api/decisions"], ["POST", "/projects/acme-api/rules"],
    ["POST", "/projects/acme-api/onboarding-paths"], ["POST", "/projects/acme-api/onboarding-paths/p1/assignments"], ["GET", "/projects/acme-api/onboarding-paths/p1/assignments"],
  ]) assert.equal(await status(method, path, "bob"), 200, `${method} ${path}`);
  assert.equal(await status("DELETE", "/projects/acme-api", "bob"), 403);
  assert.equal(await status("POST", "/projects/acme-web/diagram/confirm", "bob"), 403, "only in the project they maintain");
});

test("S09 Newcomer (Member) learns and reads; cannot change knowledge or see others' progress", async (t) => {
  const { status } = await start(t);
  for (const [method, path] of [
    ["GET", "/projects/acme-api/snapshots"], ["GET", "/projects/acme-api/diagram"], ["GET", "/projects/acme-api/onboarding-paths/p1/mine"],
    ["POST", "/projects/acme-api/onboarding-paths/p1/steps/s1/complete"], ["POST", "/projects/acme-api/onboarding-paths/p1/steps/s1/answer"],
  ]) assert.equal(await status(method, path, "carl"), 200, `${method} ${path}`);
  for (const [method, path] of [
    ["POST", "/projects/acme-api/diagram/confirm"], ["POST", "/projects/acme-api/decisions"], ["POST", "/projects/acme-api/onboarding-paths"],
    ["GET", "/projects/acme-api/onboarding-paths/p1/assignments"], ["POST", "/projects/acme-api/members/invite"],
  ]) assert.equal(await status(method, path, "carl"), 403, `${method} ${path}`);
  // That a learner's own calls only ever touch their own progress is tested in onboarding-routes.test.mjs.
});

test("S10 Viewer reads public personal projects only, and never writes", async (t) => {
  const { status } = await start(t);
  assert.equal(await status("GET", "/projects/eve-public/snapshots", "gina"), 200);
  assert.equal(await status("POST", "/projects/eve-public/diagram/confirm", "gina"), 403);
  assert.equal(await status("POST", "/projects/eve-public/onboarding-paths/p1/steps/s1/complete", "gina"), 200, "reading includes following a path they were given");
  assert.equal(await status("GET", "/projects/eve-private/snapshots", "gina"), 403);
  assert.equal(await status("GET", "/projects/acme-api/snapshots", "gina"), 403, "organization projects are never public");
});

test("S11 Nobody but a System Administrator calls the admin API, and authentication is enforced", async (t) => {
  const { status, w, tokenOf } = await start(t);
  for (const path of ["/admin/users", "/admin/organizations", "/admin/audit-logs", "/admin/settings", "/admin/llm-models"]) {
    assert.equal(await status("GET", path, undefined), 401, `${path} signed out`);
    assert.equal(await status("GET", path, "alice"), 403, `${path} as an organization owner`);
    assert.equal(await status("GET", path, "admin"), 200, `${path} as an administrator`);
  }
  assert.equal(await status("PATCH", "/admin/users/bob/role", "bob", { role: "system-administrator" }), 403, "no self-promotion");
  assert.equal(await status("GET", "/projects/eve-public", "sam"), 401, "a suspended account");
  const old = tokenOf("eve");
  w.users.find((u) => u.id === "eve").tokenVersion += 1; // signed out everywhere / password changed
  assert.equal(await status("GET", "/projects/eve-public", old), 401, "a revoked session");
  assert.equal(await status("GET", "/projects/eve-public", "bad.token.value"), 401);
});

test("S12 A System Administrator cannot read the content of an organization's projects", async (t) => {
  const { status } = await start(t);
  assert.equal(await status("GET", "/projects/acme-api", "admin"), 200, "metadata");
  assert.equal(await status("GET", "/projects/acme-api/mining", "admin"), 200, "mining progress");
  for (const [method, path] of [
    ["GET", "/projects/acme-api/snapshots"], ["GET", "/projects/acme-api/evidences"], ["GET", "/projects/acme-api/architecture"],
    ["GET", "/projects/acme-api/diagram"], ["GET", "/projects/acme-api/decisions"], ["GET", "/projects/acme-api/onboarding-paths/p1/mine"],
    ["POST", "/projects/acme-api/diagram/confirm"], ["DELETE", "/projects/acme-api"],
  ]) assert.equal(await status(method, path, "admin"), 403, `${method} ${path}`);
  assert.equal(await status("GET", "/organizations/acme", "admin"), 404, "not a member");
});
