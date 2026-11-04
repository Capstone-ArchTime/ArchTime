import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { OrganizationRole } from "../src/domain/entities/Organization.ts";
import { ProjectStatus, RepoVisibility } from "../src/domain/entities/Project.ts";
import { GetAdminOrganizationsUseCase } from "../src/application/use-cases/admin/GetAdminOrganizationsUseCase.ts";
import { AdminOrganizationController } from "../src/presentation/controllers/AdminOrganizationController.ts";
import { createAdminRouter } from "../src/presentation/routes/admin.routes.ts";
import { errorHandler } from "../src/presentation/middlewares/errorHandler.ts";
import { MongoUserRepository } from "../src/infrastructure/repositories/MongoUserRepository.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";

const day = (d) => new Date(`2026-0${d}-01T00:00:00Z`);
const users = [
  { id: "admin", name: "Ada Admin", email: "ada@platform.io", role: UserRole.SYSTEM_ADMINISTRATOR },
  { id: "olivia", name: "Olivia Owner", email: "olivia@acme.io", role: UserRole.USER },
  { id: "dan", name: "Dan Dev", email: "dan@acme.io", role: UserRole.USER },
  { id: "bob", name: "Bob Beta", email: "bob@beta.io", role: UserRole.USER },
].map((u) => ({ tokenVersion: 0, status: UserStatus.ACTIVE, isVerified: true, ...u }));
const orgs = [
  { id: "acme", name: "Acme Engineering", description: "Payments team", createdBy: "olivia", createdAt: day(1), updatedAt: day(1) },
  { id: "beta", name: "Beta Labs", createdBy: "bob", createdAt: day(2), updatedAt: day(2) },
];
const members = [
  { id: "m1", organizationId: "acme", userId: "olivia", role: OrganizationRole.OWNER, createdAt: day(1) },
  { id: "m2", organizationId: "acme", userId: "dan", role: OrganizationRole.MEMBER, createdAt: day(3) },
  { id: "m3", organizationId: "beta", userId: "bob", role: OrganizationRole.OWNER, createdAt: day(2) },
];
const projects = [{
  id: "p1", name: "payments-api", organizationId: "acme", userId: "olivia", status: ProjectStatus.PARTIAL, visibility: RepoVisibility.PRIVATE,
  repoUrl: "https://github.com/acme/secret-payments.git", description: "Handles card data", token: "ghp_supersecret", credentialId: "cred1",
  history: { totalCommits: 420, monthly: [], scannedAt: day(4) }, createdAt: day(4), updatedAt: day(4),
}];

const organizationRepo = {
  async findPaginated({ page, limit, search }) {
    const hit = orgs.filter((o) => !search || o.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt);
    return { items: hit.slice((page - 1) * limit, page * limit), total: hit.length };
  },
  async findById(id) { return orgs.find((o) => o.id === id) ?? null; },
  async listMembers(organizationId) { return members.filter((m) => m.organizationId === organizationId); },
};
const projectRepo = { async findByOrganizationId(id) { return projects.filter((p) => p.organizationId === id); } };
const userRepo = { async findById(id) { return users.find((u) => u.id === id) ?? null; } };

test("Admin organizations: the use case lists metadata with owners, members and project counts", async () => {
  const uc = new GetAdminOrganizationsUseCase(organizationRepo, projectRepo, userRepo);
  const { organizations, meta } = await uc.list({ page: "1", limit: "10" });
  assert.deepEqual(organizations.map((o) => o.name), ["Beta Labs", "Acme Engineering"], "newest first");
  const acme = organizations[1];
  assert.deepEqual([acme.memberCount, acme.projectCount], [2, 1]);
  assert.deepEqual(acme.owners, [{ userId: "olivia", name: "Olivia Owner", email: "olivia@acme.io" }]);
  assert.equal(acme.createdBy.name, "Olivia Owner");
  assert.equal(meta.total, 2);
  assert.deepEqual((await uc.list({ search: "acme" })).organizations.map((o) => o.id), ["acme"]);
  assert.equal((await uc.list({ limit: "1000" })).meta.limit, 50, "the page size is capped");
});

test("Admin organizations: HTTP is for System Administrators only, and a project shows no content", async (t) => {
  t.mock.method(MongoUserRepository.prototype, "findById", async (id) => userRepo.findById(id));
  const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
  const noop = new Proxy({}, { get: () => (_req, res) => res.status(204).end() });
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({
    userController: noop, jobController: noop, auditController: noop, settingsController: noop, metricsController: noop, llmController: noop,
    organizationController: new AdminOrganizationController(new GetAdminOrganizationsUseCase(organizationRepo, projectRepo, userRepo)),
  }, jwt));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/organizations`;
  const as = (id) => ({ Authorization: `Bearer ${jwt.generateTokens(id, users.find((u) => u.id === id).role, 0).accessToken}` });

  assert.equal((await fetch(base)).status, 401, "signed out");
  assert.equal((await fetch(base, { headers: as("olivia") })).status, 403, "an organization owner is not a platform administrator");
  assert.equal((await fetch(`${base}/acme`, { headers: as("dan") })).status, 403);

  const list = await fetch(`${base}?search=beta`, { headers: as("admin") });
  assert.equal(list.status, 200);
  const listed = await list.json();
  assert.deepEqual(listed.data.organizations.map((o) => o.name), ["Beta Labs"]);
  assert.equal(listed.meta.total, 1);

  const detail = await fetch(`${base}/acme`, { headers: as("admin") });
  assert.equal(detail.status, 200);
  const raw = await detail.text();
  const { organization } = JSON.parse(raw).data;
  assert.deepEqual(organization.members.map((m) => [m.name, m.role]), [["Olivia Owner", "owner"], ["Dan Dev", "member"]]);
  assert.deepEqual(organization.projects, [{ id: "p1", name: "payments-api", status: "PARTIAL", visibility: "private", totalCommits: 420, createdAt: day(4).toISOString() }]);
  for (const secret of ["secret-payments", "Handles card data", "ghp_supersecret", "cred1", "repoUrl", "token"]) {
    assert.equal(raw.includes(secret), false, `the answer must not contain ${secret}`);
  }
  assert.equal((await fetch(`${base}/nope`, { headers: as("admin") })).status, 404);
});
