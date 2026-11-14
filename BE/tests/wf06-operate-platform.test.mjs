import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startWorkflowApp } from "./workflow-harness.mjs";
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { RepoVisibility } from "../src/domain/entities/Project.ts";
import { OtpCodeService } from "../src/infrastructure/services/OtpCodeService.ts";
import { OtpModel } from "../src/infrastructure/database/models/OtpModel.ts";
import { UserModel } from "../src/infrastructure/database/models/UserModel.ts";
import { MiningJobModel, JobKind, JobStatus } from "../src/infrastructure/database/models/MiningJobModel.ts";
import { AuditLogModel } from "../src/infrastructure/database/models/AuditLogModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { ArchitectureMappingModel } from "../src/infrastructure/database/models/ArchitectureMappingModel.ts";
import { ALGORITHM_VERSION, graphHash } from "../src/domain/architecture/buildView.ts";
import { runArchitectureJob } from "../src/infrastructure/services/ArchitectureJob.ts";
import { env } from "../src/config/env.ts";

// WF-06 Operate the platform (BM04 §6.6), the committed tests by their IDs, against the whole back end:
//   FE-09-TC01..03 (F-08 AI models & metrics), FE-10-TC01..03 (F-09 Administration), FE-01-TC01..03 (F-01 Account & access),
//   SM-02 running -> cancelled, SM-08 (3 transitions), the end-to-end test of DS-06a, DS-06b, and the NFRs N-04 and N-05.

let h, unavailable = null, admin, adminToken;

before(async () => {
  h = await startWorkflowApp("wf06");
  if (h.unavailable) { unavailable = h.unavailable; return; }
  admin = await h.user("admin", { role: UserRole.SYSTEM_ADMINISTRATOR });
  adminToken = await h.tokenOf(admin);
});
after(async () => { if (!unavailable) await h.stop(); });

const SECRET_KEY = "sk-test-0123456789-very-secret";
const addModel = (name, extra = {}) => h.call(adminToken, "POST", "/admin/llm-models", {
  displayName: name, provider: "openai-compatible", model: name, baseUrl: "http://127.0.0.1:9/v1", apiKey: SECRET_KEY, ...extra,
});
const models = async () => (await h.call(adminToken, "GET", "/admin/llm-models")).body.data.models;
const runningJob = async (projectId, requestedBy) => String((await MiningJobModel.create({ projectId, requestedBy, kind: JobKind.MINE, status: JobStatus.RUNNING, stage: "Mining", progress: 40 }))._id);

// ── F-08 AI models & metrics ─────────────────────────────────────────────────

test("FE-09-TC01 (F-08): exactly one model is the default, whichever is set last", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const a = (await addModel("model-a")).body.data.model ?? (await models()).find((m) => m.model === "model-a");
  const b = (await addModel("model-b")).body.data.model ?? (await models()).find((m) => m.model === "model-b");
  for (const id of [b.id, a.id, b.id]) {
    assert.equal((await h.call(adminToken, "POST", `/admin/llm-models/${id}/default`)).status, 200);
    const defaults = (await models()).filter((m) => m.isDefault);
    assert.deepEqual(defaults.map((m) => m.id), [id]);
  }
});

test("FE-09-TC02 (F-08): a model's API key is never returned, only that one is set", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const created = await addModel("model-key");
  assert.equal(created.status, 201, created.text);
  assert.doesNotMatch(created.text, /very-secret/);
  const list = await h.call(adminToken, "GET", "/admin/llm-models");
  assert.doesNotMatch(list.text, /very-secret/);
  assert.doesNotMatch(list.text, /ciphertext/);
  const row = list.body.data.models.find((m) => m.model === "model-key");
  assert.ok(row.hasApiKey ?? row.apiKeyLast4 ?? row.apiKey?.last4, `the list says a key is set: ${JSON.stringify(row)}`);
});

test("FE-09-TC03 (F-08): a benchmark records model runs and leaves the stored architecture map unchanged", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const owner = await h.user("bench-owner");
  const projectId = await h.project(owner, { name: "bench" });
  const files = ["src/a/A.ts", "src/a/B.ts", "src/b/C.ts", "src/b/D.ts"];
  const nodes = files.map((id) => ({ id, name: id.split("/").pop(), type: "file" }));
  const edges = [{ source: "src/a/A.ts", target: "src/b/C.ts", type: "import" }];
  const snap = await SnapshotModel.create({ projectId, hash: "b1", title: "bench", author: "dev", date: new Date(), nodes, edges });
  const mapping = await ArchitectureMappingModel.create({
    projectId, snapshotId: String(snap._id), generator: "cluster-only", algorithmVersion: ALGORITHM_VERSION, graphHash: graphHash({ nodes, edges }),
    options: { minComponents: 2, maxComponents: 10 },
    components: [{ id: "a", name: "A", role: "service", label: "INFERENCE", memberIds: files.slice(0, 2) }, { id: "b", name: "B", role: "service", label: "INFERENCE", memberIds: files.slice(2) }],
  });
  const ids = [(await addModel("bench-1")).body.data.model?.id, (await addModel("bench-2")).body.data.model?.id];
  const started = await h.call(adminToken, "POST", "/admin/llm-benchmarks", { projectId, snapshotId: String(snap._id), modelIds: ids });
  assert.equal(started.status, 202, started.text);

  // Run the queued job the way the worker does (the models are unreachable, so each one fails or falls back).
  const job = await MiningJobModel.findById(started.body.data.jobId).lean();
  await runArchitectureJob({ id: String(job._id), projectId, target: job.target, requestedBy: admin.id, purpose: "benchmark", benchmarkId: job.benchmarkId, benchmarkModels: job.benchmarkModels }, () => false);
  assert.equal((await MiningJobModel.findById(job._id).lean()).status, JobStatus.COMPLETED);
  const stored = await ArchitectureMappingModel.findById(mapping._id).lean();
  assert.equal(stored.generator, "cluster-only");
  assert.deepEqual(stored.components.map((c) => [c.id, c.memberIds]), [["a", files.slice(0, 2)], ["b", files.slice(2)]]);
  assert.equal(await ArchitectureMappingModel.countDocuments({ projectId }), 1);
});

// ── F-09 Administration ─────────────────────────────────────────────────────

test("FE-10-TC01 (F-09) / DS-06b: the last administrator cannot be demoted; the role stays", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await UserModel.updateMany({ role: UserRole.SYSTEM_ADMINISTRATOR, _id: { $ne: admin.id } }, { role: UserRole.USER });
  const res = await h.call(adminToken, "PATCH", `/admin/users/${admin.id}/role`, { role: UserRole.USER });
  assert.equal(res.status, 400, res.text);
  assert.equal((await UserModel.findById(admin.id).lean()).role, UserRole.SYSTEM_ADMINISTRATOR);
});

test("FE-10-TC02 (F-09): a suspended user is rejected on their next request, with the token they already had", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const carl = await h.user("carl-suspend");
  const token = await h.tokenOf(carl);
  assert.equal((await h.call(token, "GET", "/projects")).status, 200);
  assert.equal((await h.call(adminToken, "PATCH", `/admin/users/${carl.id}/suspend`, { reason: "test" })).status, 200);
  assert.equal((await h.call(token, "GET", "/projects")).status, 401);
  assert.equal((await h.signIn(carl)).status, 403, "and cannot sign in again");
});

test("FE-10-TC03 (F-09): an admin API key is shown once, when it is created", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const created = await h.call(adminToken, "POST", "/admin/settings/api-keys", { name: "ci" });
  assert.equal(created.status, 201, created.text);
  const raw = created.body.data.apiKey;
  assert.match(raw, /^arch_live_/);
  const settings = await h.call(adminToken, "GET", "/admin/settings");
  assert.equal(settings.status, 200);
  assert.ok(!settings.text.includes(raw), "the full key is not listed again");
  assert.ok(settings.text.includes(created.body.data.keyPrefix), "only its prefix, to recognise it");
});

// ── F-01 Account & access ───────────────────────────────────────────────────

test("FE-01-TC01 (F-01): a wrong password is refused with 401 and the generic message (MSG03)", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const dana = await h.user("dana-login");
  const res = await h.signIn(dana, "Wrong@12345");
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(res.body.error.message, "Invalid credentials.");
  const unknown = await h.call(null, "POST", "/auth/login", { email: "nobody@archtime.test", password: "Wrong@12345" });
  assert.deepEqual([unknown.status, unknown.body.error.message], [401, "Invalid credentials."], "the same answer for an unknown address");
});

test("FE-01-TC02 (F-01) / N-04: the 11th failed sign-in within 15 minutes gets 429, even with the right password", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const erin = await h.user("erin-guess");
  for (let i = 1; i <= 10; i++) assert.equal((await h.signIn(erin, `Wrong@${i}0000`)).status, 401, `attempt ${i}`);
  assert.equal((await h.signIn(erin, "Wrong@99999")).status, 429);
  assert.equal((await h.signIn(erin)).status, 429, "the lock holds for the right password too");
});

test("FE-01-TC03 (F-01): an e-mail code expires after 10 minutes", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const fred = await h.user("fred-unverified", { status: UserStatus.UNVERIFIED, isVerified: false });
  const codes = new OtpCodeService(env.otpPepper);
  const issued = new Date();
  const otp = await OtpModel.create({ email: fred.email, codeHash: codes.hash(fred.email, "123456"), attempts: 0, expiresAt: new Date(issued.getTime() + 10 * 60_000) });
  // Ten minutes and a second later:
  await OtpModel.updateOne({ _id: otp._id }, { expiresAt: new Date(Date.now() - 1000) });
  const late = await h.call(null, "POST", "/auth/verify-email", { email: fred.email, otp: "123456" });
  assert.equal(late.status, 400, late.text);
  assert.equal(late.body.error.code, "OTP_EXPIRED");
  assert.equal((await UserModel.findById(fred.id).lean()).isVerified, false);
});

// ── State transitions ───────────────────────────────────────────────────────

test("SM-02 running -> cancelled: an administrator cancels a running job and the cancel is audited", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const owner = await h.user("job-owner");
  const jobId = await runningJob(await h.project(owner, { name: "jobs" }), owner.id);
  const res = await h.call(adminToken, "POST", `/admin/jobs/${jobId}/cancel`);
  assert.equal(res.status, 200, res.text);
  assert.equal((await MiningJobModel.findById(jobId).lean()).status, JobStatus.CANCELLED);
  assert.ok(await AuditLogModel.exists({ action: "JOB_CANCEL", targetId: jobId, userId: admin.id }));
  // Cancelled is final: asking again changes nothing and is not audited twice.
  assert.equal((await h.call(adminToken, "POST", `/admin/jobs/${jobId}/cancel`)).status, 200);
  assert.equal(await AuditLogModel.countDocuments({ action: "JOB_CANCEL", targetId: jobId }), 1);
  assert.equal((await MiningJobModel.findById(jobId).lean()).status, JobStatus.CANCELLED);
});

test("SM-08 Unverified -> Active: the right code within 10 minutes verifies the account", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const gil = await h.user("gil-unverified", { status: UserStatus.UNVERIFIED, isVerified: false });
  await OtpModel.create({ email: gil.email, codeHash: new OtpCodeService(env.otpPepper).hash(gil.email, "654321"), attempts: 0, expiresAt: new Date(Date.now() + 10 * 60_000) });
  assert.equal((await h.signIn(gil)).status, 403, "not before verifying");
  const res = await h.call(null, "POST", "/auth/verify-email", { email: gil.email, otp: "654321" });
  assert.equal(res.status, 200, res.text);
  const stored = await UserModel.findById(gil.id).lean();
  assert.deepEqual([stored.isVerified, stored.status], [true, UserStatus.ACTIVE]);
  assert.equal((await h.signIn(gil)).status, 200);
});

test("SM-08 Active -> Suspended: suspending is audited and ends every session", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const hal = await h.user("hal-active");
  const token = await h.tokenOf(hal);
  assert.equal((await h.call(adminToken, "PATCH", `/admin/users/${hal.id}/suspend`, { reason: "abuse" })).status, 200);
  assert.equal((await UserModel.findById(hal.id).lean()).status, UserStatus.SUSPENDED);
  assert.ok(await AuditLogModel.exists({ action: "USER_SUSPEND", targetId: hal.id }));
  assert.equal((await h.call(token, "GET", "/auth/me")).status, 401);
  assert.equal((await h.call(adminToken, "PATCH", `/admin/users/${admin.id}/suspend`, {})).status, 400, "an administrator cannot suspend themselves");
});

test("SM-08 Suspended -> Active: a reactivated user signs in again; the old token stays revoked", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ivy = await h.user("ivy-back");
  const old = await h.tokenOf(ivy);
  await h.call(adminToken, "PATCH", `/admin/users/${ivy.id}/suspend`, {});
  assert.equal((await h.call(adminToken, "PATCH", `/admin/users/${ivy.id}/reactivate`)).status, 200);
  assert.equal((await UserModel.findById(ivy.id).lean()).status, UserStatus.ACTIVE);
  assert.equal((await h.call(old, "GET", "/auth/me")).status, 401, "a token from before the suspension is not revived");
  assert.equal((await h.call(await h.tokenOf(ivy), "GET", "/auth/me")).status, 200);
});

// ── End to end and NFRs ─────────────────────────────────────────────────────

test("WF-06 end to end (DS-06a): add a model, set it default, cancel a running job, suspend a user who is then signed out", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const model = (await addModel("demo-model")).body.data.model;
  assert.equal((await h.call(adminToken, "POST", `/admin/llm-models/${model.id}/default`)).status, 200);
  assert.equal((await models()).find((m) => m.isDefault).id, model.id);

  const user = await h.user("jo-demo");
  const userToken = await h.tokenOf(user);
  const jobId = await runningJob(await h.project(user, { name: "demo" }), user.id);
  assert.equal((await h.call(adminToken, "POST", `/admin/jobs/${jobId}/cancel`)).status, 200);
  assert.ok(await AuditLogModel.exists({ action: "JOB_CANCEL", targetId: jobId }), "job cancelled and audited");

  assert.equal((await h.call(adminToken, "PATCH", `/admin/users/${user.id}/suspend`, { reason: "demo" })).status, 200);
  assert.equal((await h.call(userToken, "GET", "/projects")).status, 401, "suspended user signed out");
});

test("N-04: an access token lasts 60 minutes", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const token = await h.tokenOf(await h.user("kim-token"));
  const { iat, exp } = jwt.decode(token);
  assert.equal(exp - iat, 60 * 60);
});

test("N-05: with two organizations, nothing of one is reachable from the other; a foreign project answers 404", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const [acmeOwner, acmeDev, betaOwner] = await Promise.all([h.user("acme-owner"), h.user("acme-dev"), h.user("beta-owner")]);
  const acme = await h.organization(acmeOwner, "Acme", [acmeDev]);
  const beta = await h.organization(betaOwner, "Beta");
  const acmeProject = await h.project(acmeOwner, { name: "acme-core", organizationId: acme, visibility: RepoVisibility.PUBLIC, members: [[acmeDev, ProjectMemberRole.MEMBER]] });
  const betaProject = await h.project(betaOwner, { name: "beta-core", organizationId: beta, visibility: RepoVisibility.PUBLIC });
  const [acmeDevToken, betaToken] = await Promise.all([h.tokenOf(acmeDev), h.tokenOf(betaOwner)]);

  assert.equal((await h.call(acmeDevToken, "GET", `/projects/${acmeProject}`)).status, 200, "inside their organization");
  for (const path of ["", "/workspace", "/snapshots", "/diagram", "/rules", "/decisions", "/approvals", "/members", "/architecture/lineage"]) {
    assert.equal((await h.call(betaToken, "GET", `/projects/${acmeProject}${path}`)).status, 404, `Beta -> Acme ${path || "project"}`);
    assert.equal((await h.call(acmeDevToken, "GET", `/projects/${betaProject}${path}`)).status, 404, `Acme -> Beta ${path || "project"}`);
  }
  assert.equal((await h.call(betaToken, "GET", `/organizations/${acme}`)).status, 404);
  const listed = (await h.call(betaToken, "GET", "/projects")).body.data;
  assert.ok(!JSON.stringify(listed).includes(acmeProject), "Acme's project is not in Beta's list");
});
