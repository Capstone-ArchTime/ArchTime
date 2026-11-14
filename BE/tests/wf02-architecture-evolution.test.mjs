// WF-02 "Analyse architecture evolution" (T10, F-04 Comparison & evidence, N-02 Performance ≤ 1 s), on a real MongoDB
// through the real application (routers, authentication, ProjectAccessPolicy, controllers, use cases). The workspace is
// seeded with 1,000 mined snapshots, each with a dependency graph of realistic size. Skipped when no MongoDB is reachable
// (CI provides one and fails on skips). Each test is one row of docs/report-5-test-plan-and-results.md.
import "./setup-env.mjs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { app } from "../src/app.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { EvidenceModel } from "../src/infrastructure/database/models/EvidenceModel.ts";
import { UserModel } from "../src/infrastructure/database/models/UserModel.ts";
import { LlmModelRegistry } from "../src/infrastructure/llm/registry.ts";

const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_wf02_${randomUUID().slice(0, 8)}`;
export const SNAPSHOTS = 1000;
const FILES = 120, EDGES = 200;
/** N-02: listing must answer within 1 s at the 95th percentile. */
const N02_LIMIT_MS = 1000;
const RUNS = 30;

let ctx = null;
let unavailable = "MongoDB is not reachable";

const day = i => new Date(Date.UTC(2024, 0, 1) + i * 3_600_000);
/** A graph that grows slowly: snapshot i has files 0..FILES-1 of module (i % 7) plus one file per 50 commits. */
function graphOf(i) {
  const files = Array.from({ length: FILES + Math.floor(i / 50) }, (_, j) => `src/mod${j % 12}/file${j}.ts`);
  const edges = Array.from({ length: EDGES + Math.floor(i / 50) }, (_, k) => ({ source: files[k % files.length], target: files[(k * 7 + 3) % files.length], type: "import" }))
    .filter(e => e.source !== e.target);
  return { nodes: files.map(id => ({ id, name: id.split("/").pop(), type: "file" })), edges };
}

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
  } catch (err) { unavailable = `MongoDB is not usable: ${err.message}`; return; }
  await SnapshotModel.syncIndexes();
  const owner = await UserModel.create({ name: "Ana Analyst", email: `ana-${randomUUID().slice(0, 6)}@x.test`, passwordHash: "$2b$10$abcdefghijklmnopqrstuv", isVerified: true, role: "developer-analyst", status: "active" });
  const stranger = await UserModel.create({ name: "Sid Stranger", email: `sid-${randomUUID().slice(0, 6)}@x.test`, passwordHash: "$2b$10$abcdefghijklmnopqrstuv", isVerified: true, role: "developer-analyst", status: "active" });
  const project = await ProjectModel.create({ name: "Evolving", repoUrl: "https://github.com/acme/evolving", visibility: "private", userId: String(owner._id), status: "COMPLETED" });
  const other = await ProjectModel.create({ name: "Other", repoUrl: "https://github.com/acme/other", visibility: "private", userId: String(owner._id), status: "COMPLETED" });
  const projectId = String(project._id);

  const seedStart = performance.now();
  for (let start = 0; start < SNAPSHOTS; start += 100) {
    // Straight to the driver: the documents are already in their stored shape, and Mongoose casting 1,000 graphs is slow.
    await SnapshotModel.collection.insertMany(Array.from({ length: 100 }, (_, k) => {
      const i = start + k;
      const hash = i.toString(16).padStart(7, "0");
      return {
        projectId, hash, fullHash: hash.padEnd(40, "a"), version: i % 100 === 0 ? `v1.${i / 100}.0` : hash, tags: i % 100 === 0 ? [`v1.${i / 100}.0`] : [],
        title: `feat(mod${i % 12}): change ${i}`, author: "dev@acme.io", date: day(i), branches: ["main"], files: FILES, archChanges: i % 3 === 0 ? 1 : 0,
        depAdded: i % 3 === 0 ? 1 : 0, depRemoved: 0, baseHash: i ? (i - 1).toString(16).padStart(7, "0").padEnd(40, "a") : "", missingSince: null, createdAt: day(i), updatedAt: day(i), ...graphOf(i),
      };
    }), { ordered: false });
  }
  const [foreign] = await SnapshotModel.insertMany([{ projectId: String(other._id), hash: "fffffff", title: "elsewhere", author: "x", date: day(0), nodes: [], edges: [] }]);
  await EvidenceModel.insertMany(Array.from({ length: 30 }, (_, i) => ({
    projectId, changeTitle: `Dependency change ${i}`, type: "DEPENDENCY CHANGE", repository: "acme/evolving", commit: i.toString(16).padStart(7, "0"),
    files: 2, date: day(i * 3), summary: `${i} summary`, depsAdded: 1, depsRemoved: 0, sourceFiles: [`src/mod${i % 12}/file${i}.ts`],
  })));
  const seedMs = performance.now() - seedStart;

  const jwt = new JwtTokenService("test-jwt-secret", "1h", "7d");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/projects`;
  const ownerToken = jwt.generateTokens(String(owner._id), "developer-analyst", 0).accessToken;
  const strangerToken = jwt.generateTokens(String(stranger._id), "developer-analyst", 0).accessToken;
  const post = async (path, body, token = ownerToken) => {
    const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const get = async (path, token = ownerToken) => {
    const t0 = performance.now();
    const res = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const text = await res.text();
    return { status: res.status, ms: performance.now() - t0, bytes: Buffer.byteLength(text), json: text ? JSON.parse(text) : null };
  };
  const ids = (await SnapshotModel.find({ projectId }).sort({ date: 1 }).select("_id").lean()).map(d => String(d._id));
  ctx = { server, get, post, projectId, ids, foreignId: String(foreign._id), strangerToken, seedMs };
});

after(async () => {
  if (ctx) await new Promise(resolve => { ctx.server.closeAllConnections(); ctx.server.close(resolve); });
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/** Nearest-rank percentile of a list of durations. */
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function measure(path, runs) {
  for (let i = 0; i < 3; i++) await ctx.get(path); // warm-up: connection pool, JIT, Mongo cache
  const times = [];
  let bytes = 0;
  for (let i = 0; i < runs; i++) {
    const r = await ctx.get(path);
    assert.equal(r.status, 200);
    times.push(r.ms);
    bytes = r.bytes;
  }
  return { p50: percentile(times, 50), p95: percentile(times, 95), max: Math.max(...times), bytes };
}

test("WF02-01 the history of a workspace lists newest first, paginated, without dependency graphs (summary)", async t => {
  if (!ctx) return t.skip(unavailable);
  const r = await ctx.get(`/${ctx.projectId}/snapshots?summary=1&page=1&limit=50`);
  assert.equal(r.status, 200);
  assert.equal(r.json.meta.total, SNAPSHOTS);
  assert.equal(r.json.data.snapshots.length, 50);
  const dates = r.json.data.snapshots.map(s => s.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "newest first");
  assert.ok(r.json.data.snapshots.every(s => !("nodes" in s) && !("edges" in s)), "no graph in a summary");
  const page20 = await ctx.get(`/${ctx.projectId}/snapshots?summary=1&page=20&limit=50`);
  assert.equal(page20.json.data.snapshots.at(-1).hash, "0000000", "the last page ends with the first commit");
});

test("WF02-02 the revision picker gets all 1,000 snapshots with their release names, and no graph", async t => {
  if (!ctx) return t.skip(unavailable);
  const r = await ctx.get(`/${ctx.projectId}/snapshots?summary=1`);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.snapshots.length, SNAPSHOTS);
  assert.deepEqual(r.json.data.snapshots.filter(s => s.tags.length).map(s => s.version).slice(0, 2), ["v1.9.0", "v1.8.0"]);
  assert.ok(r.json.data.snapshots.every(s => !("nodes" in s)));
});

test("WF02-03 F-04: comparing two revisions lists the files and dependencies added and removed", async t => {
  if (!ctx) return t.skip(unavailable);
  const [first, last] = [ctx.ids[0], ctx.ids[SNAPSHOTS - 1]];
  const r = await ctx.get(`/${ctx.projectId}/snapshots/compare?baseId=${first}&targetId=${last}`);
  assert.equal(r.status, 200);
  const { diff } = r.json.data;
  // Snapshot 999 has 120 + 19 files: the 19 later ones are new; nothing was removed.
  assert.equal(diff.nodesAdded.length, 19);
  assert.equal(diff.nodesRemoved.length, 0);
  assert.equal(diff.nodesUnchanged.length, FILES);
  assert.ok(diff.edgesAdded.length > 0);
  // The same revision against itself: nothing changed.
  const same = await ctx.get(`/${ctx.projectId}/snapshots/compare?baseId=${last}&targetId=${last}`);
  assert.deepEqual([same.json.data.diff.nodesAdded.length, same.json.data.diff.edgesAdded.length, same.json.data.diff.edgesRemoved.length], [0, 0, 0]);
});

test("WF02-04 F-04: a revision of another workspace, or a malformed id, cannot be compared", async t => {
  if (!ctx) return t.skip(unavailable);
  assert.equal((await ctx.get(`/${ctx.projectId}/snapshots/compare?baseId=${ctx.ids[0]}&targetId=${ctx.foreignId}`)).status, 404);
  assert.equal((await ctx.get(`/${ctx.projectId}/snapshots/compare?baseId=nope&targetId=${ctx.ids[0]}`)).status, 400);
  assert.equal((await ctx.get(`/${ctx.projectId}/snapshots/compare?baseId=${ctx.ids[0]}`)).status, 400);
});

test("WF02-05 F-04: the evidence of architecture changes lists newest first, with the commit and the files behind it", async t => {
  if (!ctx) return t.skip(unavailable);
  const r = await ctx.get(`/${ctx.projectId}/evidences?page=1&limit=10`);
  assert.equal(r.status, 200);
  assert.equal(r.json.meta.total, 30);
  const rows = r.json.data.evidences;
  assert.equal(rows.length, 10);
  assert.equal(rows[0].changeTitle, "Dependency change 29");
  assert.ok(rows.every(e => typeof e.commit === "string" && Array.isArray(e.sourceFiles) && e.sourceFiles.length === 1));
});

test("WF02-06 nobody outside the workspace reads its history, comparison or evidence", async t => {
  if (!ctx) return t.skip(unavailable);
  for (const path of [`/${ctx.projectId}/snapshots?summary=1`, `/${ctx.projectId}/snapshots/compare?baseId=${ctx.ids[0]}&targetId=${ctx.ids[1]}`, `/${ctx.projectId}/evidences`]) {
    assert.equal((await ctx.get(path, ctx.strangerToken)).status, 404, `${path} (N-05: as if it did not exist)`);
    assert.equal((await ctx.get(path, null)).status, 401, path);
  }
});

test("WF02-07 N-02: listing the 1,000 snapshots answers within 1 s at the 95th percentile", async t => {
  if (!ctx) return t.skip(unavailable);
  const picker = await measure(`/${ctx.projectId}/snapshots?summary=1`, RUNS);
  const page = await measure(`/${ctx.projectId}/snapshots?summary=1&page=1&limit=50`, RUNS);
  t.diagnostic(`N-02 seed: ${SNAPSHOTS} snapshots x ~${FILES} files / ~${EDGES} edges in ${Math.round(ctx.seedMs)} ms`);
  t.diagnostic(`N-02 list all (summary=1), ${RUNS} runs: p50 ${picker.p50.toFixed(1)} ms, p95 ${picker.p95.toFixed(1)} ms, max ${picker.max.toFixed(1)} ms, ${picker.bytes} bytes`);
  t.diagnostic(`N-02 one page of 50 (summary=1), ${RUNS} runs: p50 ${page.p50.toFixed(1)} ms, p95 ${page.p95.toFixed(1)} ms, max ${page.max.toFixed(1)} ms, ${page.bytes} bytes`);
  assert.ok(picker.p95 <= N02_LIMIT_MS, `p95 ${picker.p95.toFixed(1)} ms > ${N02_LIMIT_MS} ms`);
  assert.ok(page.p95 <= N02_LIMIT_MS, `p95 ${page.p95.toFixed(1)} ms > ${N02_LIMIT_MS} ms`);
});

test("WF02-08 N-02 (for the record): the same list with every dependency graph, as Compare loaded it before T10", async t => {
  if (!ctx) return t.skip(unavailable);
  // Not a requirement on its own: it shows why the revision picker must ask for summaries. Measured, not asserted
  // against N-02, so a slow CI machine cannot fail the build on a request the application no longer makes.
  const full = await measure(`/${ctx.projectId}/snapshots`, 5);
  t.diagnostic(`N-02 list all WITH graphs, 5 runs: p50 ${full.p50.toFixed(1)} ms, p95 ${full.p95.toFixed(1)} ms, max ${full.max.toFixed(1)} ms, ${full.bytes} bytes`);
  assert.ok(full.bytes > 20 * (await measure(`/${ctx.projectId}/snapshots?summary=1`, 1)).bytes, "the graphs are most of the payload");
});

test("WF02-E2E DS-02a: compare two revisions, open the evidence, ask the mentor: the answer is labelled and cites only mined commits", async t => {
  if (!ctx) return t.skip(unavailable);
  // 1. Compare the first and the last revision.
  const compare = await ctx.get(`/${ctx.projectId}/snapshots/compare?baseId=${ctx.ids[0]}&targetId=${ctx.ids[SNAPSHOTS - 1]}`);
  assert.equal(compare.status, 200);
  assert.ok(compare.json.data.diff.nodesAdded.length > 0);
  // 2. Open the newest evidence: commit 000001d ("Dependency change 29").
  const evidence = (await ctx.get(`/${ctx.projectId}/evidences?page=1&limit=1`)).json.data.evidences[0];
  assert.equal(evidence.commit, "000001d");
  // 3. Ask the mentor (the default model is replaced by a scripted one: no AI provider is called in tests). It cites the
  //    evidence's commit, which is mined, and a hash that was never mined.
  t.mock.method(LlmModelRegistry, "resolve", async () => ({
    modelId: null, modelKey: "test", pricing: null,
    client: { info: { model: "scripted", host: "localhost", external: false }, complete: async () => "[FACT] A dependency was added in `000001d`.\n[FACT] It was reverted in `badc0de`.\n[INFERENCE] The module is growing." },
  }));
  const chat = await ctx.post(`/${ctx.projectId}/chat`, { messages: [{ role: "user", content: `Why did ${evidence.commit} change dependencies?` }] });
  assert.equal(chat.status, 200, JSON.stringify(chat.json));
  const { answer, labelCheck, evidence: cited } = chat.json.data;
  assert.equal(answer, "[FACT] A dependency was added in `000001d`.\n[INFERENCE] It was reverted in.\n[INFERENCE] The module is growing.");
  assert.ok(answer.split("\n").every(line => /^\[(FACT|INFERENCE|UNKNOWN)\]/.test(line)), "every claim labelled");
  assert.deepEqual(labelCheck.removedCitations, ["badc0de"], "the never-mined commit is not cited");
  assert.deepEqual(cited.commits, ["000001d"]);
});
