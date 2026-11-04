import test from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "../src/domain/entities/User.ts";
import { RepoVisibility, ProjectStatus } from "../src/domain/entities/Project.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { OrganizationRole } from "../src/domain/entities/Organization.ts";
import { OrganizationUseCases } from "../src/application/use-cases/organizations/OrganizationUseCases.ts";
import { OrganizationCredentialUseCases } from "../src/application/use-cases/organizations/OrganizationCredentialUseCases.ts";
import { RegisterProjectUseCase } from "../src/application/use-cases/projects/RegisterProjectUseCase.ts";
import { createProjectRoleMiddleware } from "../src/presentation/middlewares/projectRole.ts";
import { AppError } from "../src/shared/errors/AppError.ts";
import { InviteProjectMemberUseCase } from "../src/application/use-cases/members/InviteProjectMemberUseCase.ts";
import {
  AcceptProjectInvitationUseCase,
  InviteProjectMemberTokenUseCase,
} from "../src/application/use-cases/pm/ProjectInvitationUseCases.ts";
import { ProjectInvitationModel } from "../src/infrastructure/database/models/ProjectInvitationModel.ts";

const rejectsWith = (status) => (err) => err instanceof AppError && err.statusCode === status;
let seq = 0;
const nextId = (p) => `${p}${++seq}`;

function world() {
  const users = [
    { id: "owner", name: "Olivia Owner", email: "olivia@acme.io" },
    { id: "dev", name: "Dan Dev", email: "dan@acme.io" },
    { id: "other", name: "Oscar Outsider", email: "oscar@else.io" },
  ];
  const orgs = [];
  const orgMembers = [];
  const credentials = [];
  const projects = [];
  const projectMembers = [];

  const organizations = {
    async create(d) { const o = { id: nextId("org"), ...d, createdAt: new Date(), updatedAt: new Date() }; orgs.push(o); return o; },
    async findById(id) { return orgs.find((o) => o.id === id) ?? null; },
    async findByIds(ids) { return orgs.filter((o) => ids.includes(o.id)); },
    async update(id, patch) { const o = orgs.find((x) => x.id === id); if (!o) return null; Object.assign(o, patch); return o; },
    async addMember(d) { const m = { id: nextId("om"), ...d }; orgMembers.push(m); return m; },
    async findMember(organizationId, userId) { return orgMembers.find((m) => m.organizationId === organizationId && m.userId === userId) ?? null; },
    async findMemberById(organizationId, id) { return orgMembers.find((m) => m.organizationId === organizationId && m.id === id) ?? null; },
    async listMembers(organizationId) { return orgMembers.filter((m) => m.organizationId === organizationId); },
    async listMembershipsOfUser(userId) { return orgMembers.filter((m) => m.userId === userId); },
    async updateMemberRole(id, role) { const m = orgMembers.find((x) => x.id === id); if (m) m.role = role; return m ?? null; },
    async removeMember(id) { const i = orgMembers.findIndex((m) => m.id === id); if (i < 0) return false; orgMembers.splice(i, 1); return true; },
    async countOwners(organizationId) { return orgMembers.filter((m) => m.organizationId === organizationId && m.role === OrganizationRole.OWNER).length; },
  };
  const credentialRepo = {
    async create(d) {
      const c = { id: nextId("cred"), organizationId: d.organizationId, name: d.name, provider: d.provider, last4: d.secret.slice(-4), createdBy: d.createdBy };
      credentials.push({ ...c, secret: d.secret });
      return c;
    },
    async findById(organizationId, id) {
      const c = credentials.find((x) => x.organizationId === organizationId && x.id === id);
      if (!c) return null;
      const { secret: _s, ...rest } = c;
      return rest;
    },
    async list(organizationId) { return credentials.filter((c) => c.organizationId === organizationId).map(({ secret: _s, ...rest }) => rest); },
    async rotate(organizationId, id, secret) {
      const c = credentials.find((x) => x.organizationId === organizationId && x.id === id);
      if (!c) return null;
      Object.assign(c, { secret, last4: secret.slice(-4), rotatedAt: new Date() });
      const { secret: _s, ...rest } = c;
      return rest;
    },
    async delete(organizationId, id) { const i = credentials.findIndex((c) => c.organizationId === organizationId && c.id === id); if (i < 0) return false; credentials.splice(i, 1); return true; },
  };
  const projectRepo = {
    async create(d) { const p = { id: nextId("p"), ...d }; projects.push(p); return p; },
    async findById(id) { return projects.find((p) => p.id === id) ?? null; },
    async findByOrganizationId(organizationId) { return projects.filter((p) => p.organizationId === organizationId); },
    async countByCredentialId(credentialId) { return projects.filter((p) => p.credentialId === credentialId).length; },
  };
  const memberRepo = {
    async addMember(d) { const m = { id: nextId("pm"), ...d }; projectMembers.push(m); return m; },
    async findByProjectAndUserId(projectId, userId) { return projectMembers.find((m) => m.projectId === projectId && m.userId === userId) ?? null; },
    async deleteByUserInProjects(userId, projectIds) {
      const before = projectMembers.length;
      for (let i = projectMembers.length - 1; i >= 0; i--) {
        if (projectMembers[i].userId === userId && projectIds.includes(projectMembers[i].projectId)) projectMembers.splice(i, 1);
      }
      return before - projectMembers.length;
    },
  };
  const userRepo = {
    async findById(id) { return users.find((u) => u.id === id) ?? null; },
    async findByEmail(email) { return users.find((u) => u.email === email) ?? null; },
  };

  const pendingInvitations = [];
  const invitationStore = {
    async cancelPending(projectIds, email) {
      const before = pendingInvitations.length;
      for (let i = pendingInvitations.length - 1; i >= 0; i--) {
        if (projectIds.includes(pendingInvitations[i].projectId) && pendingInvitations[i].email === email) pendingInvitations.splice(i, 1);
      }
      return before - pendingInvitations.length;
    },
  };
  memberRepo.findByProjectAndEmail = async (projectId, email) => projectMembers.find((m) => m.projectId === projectId && m.email === email) ?? null;

  const orgUC = new OrganizationUseCases(organizations, userRepo, projectRepo, memberRepo, invitationStore);
  const credUC = new OrganizationCredentialUseCases(orgUC, credentialRepo, projectRepo);
  const register = new RegisterProjectUseCase(projectRepo, memberRepo, userRepo, {
    requireOwner: (o, u) => orgUC.requireOwner(o, u),
    requireCredential: (o, c) => credUC.requireCredential(o, c),
  });
  const checkRole = createProjectRoleMiddleware(projectRepo, memberRepo, organizations);
  return { orgs, orgMembers, credentials, projects, projectMembers, pendingInvitations, organizations, projectRepo, memberRepo, userRepo, orgUC, credUC, register, checkRole };
}

async function run(middleware, user, projectId) {
  const req = { params: { id: projectId }, user };
  let error;
  await middleware(req, {}, (err) => { error = err; });
  return { error, req };
}
const as = (userId, role = UserRole.USER) => ({ userId, role });

// ── organizations and members ────────────────────────────────────────────────

test("Organization: the creator becomes its owner; only members can see it", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme Engineering" });
  assert.equal(org.myRole, OrganizationRole.OWNER);
  assert.equal((await w.orgUC.listMine("owner")).length, 1);
  assert.equal((await w.orgUC.listMine("other")).length, 0);
  await assert.rejects(w.orgUC.get(org.id, "other"), rejectsWith(404), "non-members cannot probe organization ids");
  await assert.rejects(w.orgUC.create({ userId: "owner", name: "A" }), rejectsWith(400));
});

test("Organization: owners add members by email; members cannot manage", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const dev = await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  assert.equal(dev.role, OrganizationRole.MEMBER);
  assert.equal(dev.name, "Dan Dev");
  await assert.rejects(w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" }), rejectsWith(409));
  await assert.rejects(w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "ghost@acme.io" }), rejectsWith(404));
  await assert.rejects(w.orgUC.addMember({ organizationId: org.id, userId: "dev", email: "oscar@else.io" }), rejectsWith(403));
  await assert.rejects(w.orgUC.update({ organizationId: org.id, userId: "dev", name: "Hacked" }), rejectsWith(403));
  assert.equal((await w.orgUC.listMembers(org.id, "dev")).length, 2, "members can see who else is in");
});

test("Organization: the last owner cannot be demoted or removed", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const self = w.orgMembers.find((m) => m.userId === "owner");
  await assert.rejects(w.orgUC.updateMemberRole({ organizationId: org.id, userId: "owner", memberId: self.id, role: "member" }), rejectsWith(400));
  await assert.rejects(w.orgUC.removeMember({ organizationId: org.id, userId: "owner", memberId: self.id }), rejectsWith(400));
  const dev = await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io", role: "owner" });
  await w.orgUC.updateMemberRole({ organizationId: org.id, userId: "owner", memberId: self.id, role: "member" });
  assert.equal(w.orgMembers.find((m) => m.id === dev.id).role, OrganizationRole.OWNER);
});

test("Organization: removing a member also removes them from every project of the organization", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const dev = await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  const project = await w.register.execute({ name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PUBLIC, userId: "owner", organizationId: org.id });
  w.projectMembers.push({ id: "pm-dev", projectId: project.id, userId: "dev", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE });
  const personal = await w.register.execute({ name: "mine", repoUrl: "https://git.example/mine", visibility: RepoVisibility.PUBLIC, userId: "owner" });
  w.projectMembers.push({ id: "pm-dev-2", projectId: personal.id, userId: "dev", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE });

  const result = await w.orgUC.removeMember({ organizationId: org.id, userId: "owner", memberId: dev.id });
  assert.equal(result.removedProjectMemberships, 1);
  assert.ok(w.projectMembers.some((m) => m.id === "pm-dev-2"), "memberships outside the organization are kept");
  const { error } = await run(w.checkRole("read"), as("dev"), project.id);
  assert.equal(error?.statusCode, 403);
});

test("Organization: removing a member withdraws their pending invitations to its projects only", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const dev = await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  const project = await w.register.execute({ name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PUBLIC, userId: "owner", organizationId: org.id });
  const personal = await w.register.execute({ name: "mine", repoUrl: "https://git.example/mine", visibility: RepoVisibility.PUBLIC, userId: "owner" });
  w.pendingInvitations.push(
    { projectId: project.id, email: "dan@acme.io" },
    { projectId: personal.id, email: "dan@acme.io" },
    { projectId: project.id, email: "oscar@else.io" },
  );

  const result = await w.orgUC.removeMember({ organizationId: org.id, userId: "owner", memberId: dev.id });
  assert.equal(result.cancelledInvitations, 1);
  assert.deepEqual(w.pendingInvitations.map((i) => `${i.projectId}:${i.email}`).sort(), [`${personal.id}:dan@acme.io`, `${project.id}:oscar@else.io`].sort());
});

test("Organization projects: a project role is only handed to members of the organization", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  const project = await w.register.execute({ name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PUBLIC, userId: "owner", organizationId: org.id });
  const personal = await w.register.execute({ name: "mine", repoUrl: "https://git.example/mine", visibility: RepoVisibility.PUBLIC, userId: "owner" });

  const direct = new InviteProjectMemberUseCase(w.memberRepo, w.projectRepo, w.userRepo, w.organizations);
  await assert.rejects(direct.execute({ projectId: project.id, email: "oscar@else.io", name: "Oscar" }), rejectsWith(403), "registered outsider");
  await assert.rejects(direct.execute({ projectId: project.id, email: "nobody@else.io", name: "Nobody" }), rejectsWith(403), "no account, so not a member");
  const added = await direct.execute({ projectId: project.id, email: "dan@acme.io", name: "Dan" });
  assert.equal(added.userId, "dev");
  const outsiderOnPersonal = await direct.execute({ projectId: personal.id, email: "oscar@else.io", name: "Oscar" });
  assert.equal(outsiderOnPersonal.userId, "other", "personal projects are not affected");

  const originals = { create: ProjectInvitationModel.create, deleteMany: ProjectInvitationModel.deleteMany };
  ProjectInvitationModel.deleteMany = async () => ({ deletedCount: 0 });
  ProjectInvitationModel.create = async (doc) => ({ ...doc, toJSON: () => ({ ...doc }) });
  try {
    const byLink = new InviteProjectMemberTokenUseCase(w.projectRepo, w.memberRepo, w.userRepo, undefined, undefined, w.organizations);
    await assert.rejects(byLink.execute({ projectId: project.id, email: "oscar@else.io", invitedBy: "owner" }), rejectsWith(403));
    const sent = await byLink.execute({ projectId: personal.id, email: "nobody@else.io", invitedBy: "owner" });
    assert.equal(sent.email, "nobody@else.io", "personal projects may invite anyone");
  } finally {
    Object.assign(ProjectInvitationModel, originals);
  }
});

test("Organization projects: an invitation sent before removal can no longer be accepted", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const dev = await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  const project = await w.register.execute({ name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PUBLIC, userId: "owner", organizationId: org.id });
  await w.orgUC.removeMember({ organizationId: org.id, userId: "owner", memberId: dev.id });

  const invitation = {
    projectId: project.id, email: "dan@acme.io", role: ProjectMemberRole.MAINTAINER, status: "pending",
    expiresAt: new Date(Date.now() + 60_000), async save() {},
  };
  const originalFindOne = ProjectInvitationModel.findOne;
  ProjectInvitationModel.findOne = async () => invitation;
  try {
    const accept = new AcceptProjectInvitationUseCase(w.memberRepo, w.userRepo, w.projectRepo, w.organizations);
    await assert.rejects(accept.execute("token", "dev"), rejectsWith(403));
    assert.equal(invitation.status, "pending", "nothing was accepted");
    assert.equal(w.projectMembers.filter((m) => m.projectId === project.id && m.userId === "dev").length, 0, "no dormant role left behind");

    await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
    const accepted = await accept.execute("token", "dev");
    assert.equal(accepted.role, ProjectMemberRole.MAINTAINER, "a member again may accept");
  } finally {
    ProjectInvitationModel.findOne = originalFindOne;
  }
});

test("Organization: a removed member's open session loses access to the organization's projects at once", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const dev = await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  const project = await w.register.execute({ name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PUBLIC, userId: "owner", organizationId: org.id });
  w.projects.find((p) => p.id === project.id).userId = "dev"; // the removed person owns it: ownership does not outlive membership
  assert.equal((await run(w.checkRole("write"), as("dev"), project.id)).error, undefined, "before: owner of the project");
  await w.orgUC.removeMember({ organizationId: org.id, userId: "owner", memberId: dev.id });
  // Same token, no new sign-in: access is decided on every request.
  for (const action of ["metadata", "read", "write"]) {
    const { error } = await run(w.checkRole(action), as("dev"), project.id);
    assert.equal(error?.statusCode, 403, `${action} after removal`);
  }
});

test("Organization: any member may leave; members cannot remove others", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const dev = await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "oscar@else.io" });
  const oscar = w.orgMembers.find((m) => m.userId === "other");
  await assert.rejects(w.orgUC.removeMember({ organizationId: org.id, userId: "dev", memberId: oscar.id }), rejectsWith(403));
  await w.orgUC.removeMember({ organizationId: org.id, userId: "dev", memberId: dev.id });
  assert.equal(await w.orgUC.listMine("dev").then((l) => l.length), 0);
});

// ── credentials ──────────────────────────────────────────────────────────────

test("Credentials: owners only, the token is never returned, rotating keeps the id", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  const cred = await w.credUC.create({ organizationId: org.id, userId: "owner", name: "GitHub bot", token: "ghp_abcdefgh1234" });
  assert.equal(cred.last4, "1234");
  assert.equal(cred.usedBy, 0);
  assert.equal(JSON.stringify(cred).includes("ghp_"), false);
  assert.equal(JSON.stringify(await w.credUC.list(org.id, "owner")).includes("ghp_"), false);
  await assert.rejects(w.credUC.list(org.id, "dev"), rejectsWith(403));
  await assert.rejects(w.credUC.create({ organizationId: org.id, userId: "owner", name: "github BOT", token: "ghp_zzzzzzzz9999" }), rejectsWith(409));
  await assert.rejects(w.credUC.create({ organizationId: org.id, userId: "owner", name: "short", token: "abc" }), rejectsWith(400));

  const rotated = await w.credUC.rotate({ organizationId: org.id, userId: "owner", credentialId: cred.id, token: "ghp_newtoken5678" });
  assert.equal(rotated.id, cred.id);
  assert.equal(rotated.last4, "5678");
  assert.equal(w.credentials[0].secret, "ghp_newtoken5678");
});

test("Credentials: a credential in use cannot be deleted", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const cred = await w.credUC.create({ organizationId: org.id, userId: "owner", name: "bot", token: "ghp_abcdefgh1234" });
  await w.register.execute({ name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PRIVATE, userId: "owner", organizationId: org.id, credentialId: cred.id });
  await assert.rejects(w.credUC.delete({ organizationId: org.id, userId: "owner", credentialId: cred.id }), rejectsWith(409));
  w.projects.length = 0;
  await w.credUC.delete({ organizationId: org.id, userId: "owner", credentialId: cred.id });
  assert.equal(w.credentials.length, 0);
});

// ── projects in an organization ──────────────────────────────────────────────

test("Register: a private organization project clones with the organization credential, not a personal token", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  const other = await w.orgUC.create({ userId: "other", name: "Else" });
  const cred = await w.credUC.create({ organizationId: org.id, userId: "owner", name: "bot", token: "ghp_abcdefgh1234" });
  const base = { name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PRIVATE };

  const project = await w.register.execute({ ...base, userId: "owner", organizationId: org.id, credentialId: cred.id });
  assert.equal(project.organizationId, org.id);
  assert.equal(project.credentialId, cred.id);
  assert.equal(project.token, undefined);

  await assert.rejects(w.register.execute({ ...base, userId: "owner", credentialId: cred.id }), rejectsWith(400), "credential without organization");
  await assert.rejects(w.register.execute({ ...base, userId: "owner", organizationId: org.id, credentialId: cred.id, token: "x" }), rejectsWith(400), "both token and credential");
  await assert.rejects(w.register.execute({ ...base, userId: "other", organizationId: other.id, credentialId: cred.id }), rejectsWith(400), "another organization's credential");
  await assert.rejects(w.register.execute({ ...base, userId: "other", organizationId: org.id, credentialId: cred.id }), rejectsWith(404), "not a member of the organization");
  await assert.rejects(w.register.execute({ ...base, userId: "owner", organizationId: org.id }), rejectsWith(400), "private without any credential");
});

test("Register: only organization owners create projects in the organization", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  await assert.rejects(
    w.register.execute({ name: "api", repoUrl: "https://git.example/api", visibility: RepoVisibility.PUBLIC, userId: "dev", organizationId: org.id }),
    rejectsWith(403),
  );
});

// ── T16: who may delete a project, and the organization access order ─────────

function personalProject(w, extra = {}) {
  const p = { id: nextId("p"), name: "P", repoUrl: "https://git.example/p", visibility: RepoVisibility.PRIVATE, status: ProjectStatus.COMPLETED, userId: "owner", ...extra };
  w.projects.push(p);
  return p;
}

test("Delete permission: the project owner may delete; maintainers, members and System Administrators may not", async () => {
  const w = world();
  const p = personalProject(w);
  w.projectMembers.push({ id: "m1", projectId: p.id, userId: "dev", role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE });
  const owner = w.checkRole("owner");

  assert.equal((await run(owner, as("owner"), p.id)).error, undefined);
  assert.equal((await run(owner, as("dev"), p.id)).error?.statusCode, 403, "maintainer");
  assert.equal((await run(owner, as("admin", UserRole.SYSTEM_ADMINISTRATOR), p.id)).error?.statusCode, 403, "admin");
  assert.equal((await run(owner, as("other"), p.id)).error?.statusCode, 403, "stranger");

  assert.equal((await run(w.checkRole("admin"), as("dev"), p.id)).error, undefined, "maintainers still manage members");
  assert.equal((await run(w.checkRole("write"), as("admin", UserRole.SYSTEM_ADMINISTRATOR), p.id)).error, undefined, "admins still operate everything else");
});

test("Organization projects: org owners act as maintainer and may delete; non-members see nothing, public or not", async () => {
  const w = world();
  const org = await w.orgUC.create({ userId: "owner", name: "Acme" });
  await w.orgUC.addMember({ organizationId: org.id, userId: "owner", email: "dan@acme.io" });
  const p = personalProject(w, { userId: "dev", organizationId: org.id, visibility: RepoVisibility.PUBLIC });

  const asOrgOwner = await run(w.checkRole("owner"), as("owner"), p.id);
  assert.equal(asOrgOwner.error, undefined);
  assert.equal(asOrgOwner.req.projectMemberRole, ProjectMemberRole.MAINTAINER);
  assert.equal((await run(w.checkRole("owner"), as("dev"), p.id)).error, undefined, "the project owner, still in the organization");
  assert.equal((await run(w.checkRole("read"), as("other"), p.id)).error?.statusCode, 403, "public does not leak outside the organization");

  // The project's creator leaves the organization: they lose the project too.
  const devMembership = w.orgMembers.find((m) => m.userId === "dev");
  await w.orgUC.removeMember({ organizationId: org.id, userId: "dev", memberId: devMembership.id });
  assert.equal((await run(w.checkRole("read"), as("dev"), p.id)).error?.statusCode, 403);
});

test("Personal public projects stay readable by any signed-in viewer", async () => {
  const w = world();
  const p = personalProject(w, { visibility: RepoVisibility.PUBLIC });
  assert.equal((await run(w.checkRole("read"), as("other"), p.id)).error, undefined);
  assert.equal((await run(w.checkRole("write"), as("other"), p.id)).error?.statusCode, 403);
});
