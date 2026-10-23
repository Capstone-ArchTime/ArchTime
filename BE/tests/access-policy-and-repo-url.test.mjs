import test from "node:test";
import assert from "node:assert/strict";
import { ProjectAccessPolicy } from "../src/application/services/ProjectAccessPolicy.ts";
import { GetMiningJobsUseCase } from "../src/application/use-cases/projects/GetMiningJobsUseCase.ts";
import { CompareSnapshotsUseCase } from "../src/application/use-cases/projects/CompareSnapshotsUseCase.ts";
import { RegisterProjectUseCase } from "../src/application/use-cases/projects/RegisterProjectUseCase.ts";
import { MiningJobModel } from "../src/infrastructure/database/models/MiningJobModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { validateRepoUrl, RepoUrlError } from "../src/domain/mining/repoUrl.ts";
import { UserRole } from "../src/domain/entities/User.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

const rejectsWith = (status) => (err) => err instanceof AppError && err.statusCode === status;

const projects = [
  { id: "p-personal", userId: "alice", visibility: "private" },
  { id: "p-public", userId: "alice", visibility: "public" },
  { id: "p-org", userId: "carol", visibility: "public", organizationId: "org1" },
];
const members = [
  { projectId: "p-personal", userId: "bob", role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE },
  { projectId: "p-personal", userId: "dan", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
  { projectId: "p-personal", userId: "eve", role: ProjectMemberRole.MEMBER, status: MemberStatus.INVITED },
  { projectId: "p-org", userId: "dan", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
];
let orgMembers = [
  { organizationId: "org1", userId: "alice", role: "owner" },
  { organizationId: "org1", userId: "carol", role: "member" },
  { organizationId: "org1", userId: "dan", role: "member" },
];
const policy = new ProjectAccessPolicy(
  {
    async findById(id) { return projects.find((p) => p.id === id) ?? null; },
    async findByUserId(userId) { return projects.filter((p) => p.userId === userId); },
    async findByOrganizationId(orgId) { return projects.filter((p) => p.organizationId === orgId); },
    async findByIds(ids) { return projects.filter((p) => ids.includes(p.id)); },
  },
  {
    async findByProjectAndUserId(projectId, userId) { return members.find((m) => m.projectId === projectId && m.userId === userId) ?? null; },
    async findByUserId(userId) { return members.filter((m) => m.userId === userId); },
  },
  {
    async findMember(organizationId, userId) { return orgMembers.find((m) => m.organizationId === organizationId && m.userId === userId) ?? null; },
    async listMembershipsOfUser(userId) { return orgMembers.filter((m) => m.userId === userId); },
  },
);
const user = (userId, role = UserRole.USER) => ({ userId, role });
const actionsOf = async (projectId, u) => [...(await policy.evaluate(projects.find((p) => p.id === projectId), u)).actions].sort().join(",");

// ── the permission table (system overview §4.2) ──────────────────────────────

test("Policy: personal project roles", async () => {
  assert.equal(await actionsOf("p-personal", user("alice")), "admin,metadata,owner,read,write", "owner");
  assert.equal(await actionsOf("p-personal", user("bob")), "admin,metadata,read,write", "maintainer: scan, mine, refine, but not delete");
  assert.equal(await actionsOf("p-personal", user("dan")), "metadata,read", "member (newcomer) reads history, snapshots and maps");
  assert.equal(await actionsOf("p-personal", user("eve")), "", "an invitation not yet accepted gives nothing");
  assert.equal(await actionsOf("p-personal", user("zed")), "", "stranger");
  assert.equal(await actionsOf("p-public", user("zed")), "metadata,read", "viewer of a public personal project");
  assert.equal(await actionsOf("p-personal", user("root", UserRole.SYSTEM_ADMINISTRATOR)), "admin,metadata,read,write", "admin on a personal project: everything but delete");
});

test("Policy: organization projects", async () => {
  assert.equal(await actionsOf("p-org", user("alice")), "admin,metadata,owner,read,write", "organization owner acts as maintainer and may delete");
  assert.equal(await actionsOf("p-org", user("carol")), "admin,metadata,owner,read,write", "project owner, still in the organization");
  assert.equal(await actionsOf("p-org", user("dan")), "metadata,read", "project member who is in the organization");
  assert.equal(await actionsOf("p-org", user("zed")), "", "public does not leak outside the organization");
  assert.equal(await actionsOf("p-org", user("root", UserRole.SYSTEM_ADMINISTRATOR)), "metadata", "admin sees metadata, never content");

  const saved = orgMembers;
  orgMembers = orgMembers.filter((m) => m.userId !== "carol");
  assert.equal(await actionsOf("p-org", user("carol")), "", "leaving the organization ends access, ownership included");
  orgMembers = saved;
});

test("Policy: require() gives 404 for unknown projects and 403 with a reason otherwise", async () => {
  await assert.rejects(policy.require("nope", user("alice"), "read"), rejectsWith(404));
  await assert.rejects(policy.require("p-personal", user("bob"), "owner"), (e) => rejectsWith(403)(e) && /owner/.test(e.message));
  await assert.rejects(policy.require("p-org", user("root", UserRole.SYSTEM_ADMINISTRATOR), "read"), (e) => rejectsWith(403)(e) && /content/.test(e.message));
  const { access } = await policy.require("p-personal", user("dan"), "read");
  assert.equal(access.role, "developer-analyst");
});

test("Policy: readableProjects lists owned, joined and organization-owned projects only", async () => {
  const ids = async (u) => (await policy.readableProjects(u)).map((r) => r.project.id).sort();
  assert.deepEqual(await ids(user("alice")), ["p-org", "p-personal", "p-public"]);
  assert.deepEqual(await ids(user("dan")), ["p-org", "p-personal"]);
  assert.deepEqual(await ids(user("eve")), [], "pending invitations are not listed");
  assert.deepEqual(await ids(user("zed")), [], "other people's public projects are opened by link, not listed");
});

// ── jobs list and snapshot comparison stay inside what the caller may read ───

test("Jobs list: only jobs of readable projects; administrators see all", async () => {
  const seen = [];
  const original = { find: MiningJobModel.find, countDocuments: MiningJobModel.countDocuments };
  MiningJobModel.find = (filter) => { seen.push(filter); const q = { populate: () => q, sort: () => q, skip: () => q, limit: () => q, lean: async () => [] }; return q; };
  MiningJobModel.countDocuments = async () => 0;
  try {
    const uc = new GetMiningJobsUseCase(policy);
    await uc.execute(0, 10, user("dan"));
    assert.deepEqual(seen.at(-1), { projectId: { $in: ["p-personal", "p-org"] } });
    const none = await uc.execute(0, 10, user("zed"));
    assert.deepEqual(none, { items: [], total: 0 });
    await uc.execute(0, 10, user("root", UserRole.SYSTEM_ADMINISTRATOR));
    assert.deepEqual(seen.at(-1), {});
  } finally {
    Object.assign(MiningJobModel, original);
  }
});

test("Compare: snapshots of another project cannot be compared through this one", async () => {
  const original = SnapshotModel.findOne;
  const rows = [
    { _id: "64b000000000000000000001", projectId: "mine", nodes: [], edges: [] },
    { _id: "64b000000000000000000002", projectId: "theirs", nodes: [{ id: "secret.ts" }], edges: [] },
  ];
  SnapshotModel.findOne = async (q) => rows.find((r) => r._id === q._id && r.projectId === q.projectId) ?? null;
  try {
    const uc = new CompareSnapshotsUseCase();
    await assert.rejects(uc.execute("64b000000000000000000001", "64b000000000000000000002", "mine"), rejectsWith(404));
    await assert.rejects(uc.execute("bad", "64b000000000000000000002", "mine"), rejectsWith(400));
  } finally {
    SnapshotModel.findOne = original;
  }
});

// ── repository URLs ──────────────────────────────────────────────────────────

test("Repo URL: public HTTPS remotes are accepted", () => {
  for (const ok of ["https://github.com/owner/repo.git", "https://gitlab.com/group/sub/repo", "https://bitbucket.org/a/b.git"]) {
    assert.equal(validateRepoUrl(ok, false), ok);
  }
});

test("Repo URL: local paths, other transports, credentials and internal hosts are refused", () => {
  for (const bad of [
    "file:///C:/Users/someone/mining-cache/abc", "/srv/repos/private", "C:\\repos\\x", "ext::sh -c touch% /tmp/pwned",
    "ssh://git@github.com/a/b.git", "git://github.com/a/b.git", "http://github.com/a/b.git",
    "https://user:ghp_token@github.com/a/b.git", "https://localhost/a.git", "https://127.0.0.1/a.git",
    "https://10.0.0.5/a.git", "https://192.168.1.2/a.git", "https://169.254.169.254/latest", "https://[::1]/a.git",
    "https://gitlab/a.git", "https://git.internal/a.git", "", 42,
  ]) {
    assert.throws(() => validateRepoUrl(bad, false), RepoUrlError, String(bad));
  }
});

test("Repo URL: ARCHTIME_ALLOW_LOCAL_REPOS relaxes the rule for tests and local development", () => {
  assert.equal(validateRepoUrl("file:///tmp/repo", true), "file:///tmp/repo");
  assert.equal(validateRepoUrl("http://localhost:3000/a.git", true), "http://localhost:3000/a.git");
  assert.throws(() => validateRepoUrl("ext::sh -c id", true), RepoUrlError, "ext:: is never allowed");
});

test("Register: a file:// repository is refused with 400", async () => {
  const saved = process.env.ARCHTIME_ALLOW_LOCAL_REPOS;
  delete process.env.ARCHTIME_ALLOW_LOCAL_REPOS;
  try {
    const uc = new RegisterProjectUseCase({ async create() { throw new Error("must not be stored"); } });
    await assert.rejects(uc.execute({ name: "x", repoUrl: "file:///etc", visibility: "public", userId: "alice" }), rejectsWith(400));
  } finally {
    if (saved !== undefined) process.env.ARCHTIME_ALLOW_LOCAL_REPOS = saved;
  }
});
