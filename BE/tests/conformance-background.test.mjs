import "./setup-env.mjs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { CheckConformanceUseCase } from "../src/application/use-cases/conformance/ConformanceUseCases.ts";

// "Run check" runs in the background: the request answers at once with a job, the job reports progress per commit and
// can be stopped between two commits; the page follows it through the overview.

test("the check reports progress per commit and stops between two commits when asked", async () => {
  const day = n => new Date(Date.UTC(2026, 10, n));
  const workspace = {
    diagram: { components: [{ id: "a", name: "A", pathPrefixes: ["src/a"] }], dependencies: [], confirmedAt: day(1), baselineCommit: null },
    rules: [], decisions: [],
  };
  const snaps = [1, 2, 3].map(n => ({ id: `s${n}`, hash: `${n}${n}${n}${n}${n}${n}${n}`, date: day(n + 1) }));
  const recorded = [];
  const store = {
    checkOf: async () => null, carriedDecisions: async () => new Map(),
    recordCheck: async ({ check }) => { recorded.push(check.snapshotId); },
  };
  const uc = new CheckConformanceUseCase({ findByProjectId: async () => workspace }, {
    dateOf: async () => null, after: async () => snaps, graph: async () => ({ nodes: [{ id: "src/a/x.ts" }], edges: [] }),
  }, store, () => day(9));
  const progress = [];
  await uc.execute("p", { onProgress: (done, total) => { progress.push(`${done}/${total}`); } });
  assert.deepEqual(progress, ["0/3", "1/3", "2/3", "3/3"]);

  recorded.length = 0;
  let calls = 0;
  const summary = await uc.execute("p", { shouldStop: () => calls++ >= 1 });
  assert.deepEqual(recorded, ["s1"], "stopped after the first commit; what was checked is kept");
  assert.equal(summary.checked.length, 1);
});

// ── Through the real application and job queue, on a real MongoDB (skipped when none is reachable) ──

const { app } = await import("../src/app.ts");
const { MiningService } = await import("../src/infrastructure/services/MiningService.ts");
const { MiningJobModel } = await import("../src/infrastructure/database/models/MiningJobModel.ts");
const { ProjectModel } = await import("../src/infrastructure/database/models/ProjectModel.ts");
const { WorkspaceModel } = await import("../src/infrastructure/database/models/WorkspaceModel.ts");
const { SnapshotModel } = await import("../src/infrastructure/database/models/SnapshotModel.ts");
const { UserModel } = await import("../src/infrastructure/database/models/UserModel.ts");
const { JwtTokenService } = await import("../src/infrastructure/services/JwtTokenService.ts");

const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_bgcheck_${randomUUID().slice(0, 8)}`;
let connected = false;
before(async () => {
  try { await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 }); await UserModel.syncIndexes(); connected = true; } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test("POST starts a background job and answers at once; the overview follows it; ?wait=1 answers with the summary", async t => {
  if (!connected) return t.skip("MongoDB is not reachable");
  const eve = await UserModel.create({ name: "Eve", email: "eve@bg.test", passwordHash: "$2b$10$abcdefghijklmnopqrstuv", isVerified: true, role: "developer-analyst", status: "active" });
  const draft = await ProjectModel.create({ name: "Draft", repoUrl: "https://github.com/acme/draft", visibility: "private", userId: String(eve._id), status: "COMPLETED" });
  const shop = await ProjectModel.create({ name: "Shop", repoUrl: "https://github.com/acme/shop", visibility: "private", userId: String(eve._id), status: "COMPLETED" });
  const shopId = String(shop._id);
  await WorkspaceModel.create({ projectId: shopId, revision: 2, diagram: { components: [{ id: "a", name: "A", kind: "Service", description: "", pathPrefixes: ["src/a"] }, { id: "b", name: "B", kind: "Service", description: "", pathPrefixes: ["src/b"] }], dependencies: [], revision: 2, confirmedAt: new Date("2026-11-01T00:00:00Z"), baselineCommit: null }, rules: [], decisions: [] });
  await SnapshotModel.create({ projectId: shopId, hash: "a1a1a1a", title: "t", author: "x", date: new Date("2026-11-02T00:00:00Z"), nodes: [{ id: "src/a/x.ts" }, { id: "src/b/y.ts" }], edges: [{ source: "src/a/x.ts", target: "src/b/y.ts" }] });

  const jwt = new JwtTokenService("test-jwt-secret", "1h", "7d");
  const headers = { Authorization: `Bearer ${jwt.generateTokens(String(eve._id), "developer-analyst", 0).accessToken}`, "Content-Type": "application/json" };
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/projects`;

  // No confirmed diagram: refused at once, no job made.
  const refused = await fetch(`${base}/${draft._id}/conformance`, { method: "POST", headers, body: "{}" });
  assert.equal(refused.status, 409);
  assert.equal(await MiningJobModel.countDocuments({ projectId: String(draft._id) }), 0);

  const started = await fetch(`${base}/${shopId}/conformance`, { method: "POST", headers, body: "{}" });
  assert.equal(started.status, 202);
  const { jobId } = (await started.json()).data;
  assert.match(jobId, /^[0-9a-f]{24}$/);

  let job;
  for (let i = 0; i < 40; i++) {
    job = (await (await fetch(`${base}/${shopId}/conformance`, { headers })).json()).data.job;
    if (job && ["completed", "failed"].includes(job.status)) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.deepEqual([job.id, job.status, job.progress], [jobId, "completed", 100]);
  assert.match(job.stage, /^Checked 1 commit: [0-9]+ findings?$/);

  // While a job is queued or running, a second one is refused (the queue allows one job per workspace).
  const blocker = await MiningJobModel.create({ projectId: shopId, requestedBy: String(eve._id), kind: "scan", status: "running", progress: 5 });
  assert.equal((await fetch(`${base}/${shopId}/conformance`, { method: "POST", headers, body: "{}" })).status, 409);
  await MiningJobModel.deleteOne({ _id: blocker._id });

  const waited = await fetch(`${base}/${shopId}/conformance?wait=1`, { method: "POST", headers, body: JSON.stringify({ force: true }) });
  assert.equal(waited.status, 200);
  assert.equal((await waited.json()).data.checked.length, 1);
  assert.ok(MiningService.conformanceRunner, "the container sets the runner");
});
