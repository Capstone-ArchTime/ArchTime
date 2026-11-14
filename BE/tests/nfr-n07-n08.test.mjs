import "./setup-env.mjs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { app } from "../src/app.ts";
import { CheckConformanceUseCase } from "../src/application/use-cases/conformance/ConformanceUseCases.ts";
import { MongoConformanceRepository, mongoConformanceSnapshots } from "../src/infrastructure/repositories/MongoConformanceRepository.ts";
import { MongoWorkspaceRepository } from "../src/infrastructure/repositories/MongoWorkspaceRepository.ts";
import { ConformanceFindingModel, ConformanceCheckModel } from "../src/infrastructure/database/models/ConformanceModels.ts";
import { AgentTokenModel } from "../src/infrastructure/repositories/MongoAgentTokenRepository.ts";
import { newAgentToken } from "../src/domain/agent/context.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { WorkspaceModel } from "../src/infrastructure/database/models/WorkspaceModel.ts";
import { UserModel } from "../src/infrastructure/database/models/UserModel.ts";

// Non-functional requirements of WF-08 and WF-09 (D11), on a real MongoDB and, for N-08, the real application:
//   N-07  checking the same snapshots again gives exactly the same result;
//   N-08  a project token never reveals anything of another project, nor opens any other API.
// Skipped when no MongoDB is reachable (CI provides one: MONGODB_TEST_URI).

const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_nfr_${randomUUID().slice(0, 8)}`;
let connected = false;
before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await Promise.all([ConformanceFindingModel.syncIndexes(), ConformanceCheckModel.syncIndexes(), AgentTokenModel.syncIndexes(), UserModel.syncIndexes()]);
    connected = true;
  } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

const day = n => new Date(Date.UTC(2026, 10, n));
const files = ["src/orders/a.ts", "src/orders/b.ts", "src/billing/c.ts", "src/db/d.ts", "README.md"];
const graph = edges => ({ nodes: files.map(id => ({ id, name: id, type: "file" })), edges: edges.map(([source, target]) => ({ source, target, type: "import" })) });

async function seedProject(name, prefix, extra = {}) {
  const owner = new mongoose.Types.ObjectId().toString();
  const project = await ProjectModel.create({ name, repoUrl: `https://github.com/acme/${prefix}`, visibility: "private", userId: owner, status: "COMPLETED" });
  const projectId = String(project._id);
  await WorkspaceModel.create({
    projectId, revision: 3,
    diagram: {
      components: [
        { id: `${prefix}-core`, name: `${name} Core`, kind: "Service", description: `${name} secret responsibility`, pathPrefixes: [`src/${prefix}`] },
        { id: `${prefix}-db`, name: `${name} Database`, kind: "Database", description: "", pathPrefixes: ["src/db"] },
      ],
      dependencies: [], revision: 3, confirmedAt: day(1), confirmedBy: owner, confirmedRevision: 3, baselineCommit: null,
    },
    rules: [{ id: "r1", name: `${name} rule`, source: `${prefix}-core`, target: `${prefix}-db`, constraint: "forbidden", severity: "error", rationale: `${name} rationale`, enabled: true }],
    decisions: [{ id: "a1", number: 1, title: `${name} ADR`, status: "Accepted", context: "", decision: `${name} decision text`, alternatives: "", consequences: "", componentIds: [`${prefix}-core`], origin: "recorded", sources: [], statusHistory: [], createdAt: day(1), updatedAt: day(1) }],
    ...extra,
  });
  return { projectId, owner };
}

// ── N-07 ─────────────────────────────────────────────────────────────────────

test("N-07: checking the same snapshots again, any number of times, gives exactly the same findings", async t => {
  if (!connected) return t.skip("MongoDB is not reachable");
  const { projectId } = await seedProject("Shop", "orders");
  await SnapshotModel.create([
    { projectId, hash: "aaaaaaa", title: "one", author: "a", date: day(2), ...graph([["src/orders/a.ts", "src/db/d.ts"]]) },
    { projectId, hash: "bbbbbbb", title: "two", author: "a", date: day(3), ...graph([["src/orders/b.ts", "src/db/d.ts"], ["src/orders/a.ts", "src/db/d.ts"], ["src/billing/c.ts", "src/orders/a.ts"]]) },
  ]);
  const store = new MongoConformanceRepository();
  const check = new CheckConformanceUseCase(new MongoWorkspaceRepository(), mongoConformanceSnapshots, store, () => day(9));
  const snapshotOf = async () => (await ConformanceFindingModel.find({ projectId }).sort({ snapshotHash: 1, key: 1 }).lean())
    .map(({ createdAt, updatedAt, __v, ...rest }) => ({ ...rest, _id: String(rest._id) }));
  const countsOf = async () => (await ConformanceCheckModel.find({ projectId }).sort({ snapshotHash: 1 }).lean()).map(c => [c.snapshotHash, c.fingerprint, c.counts]);

  const first = await check.execute(projectId);
  assert.deepEqual(first.checked.map(c => [c.hash, c.findings]), [["aaaaaaa", 1], ["bbbbbbb", 1]]);
  const findings = await snapshotOf(), counts = await countsOf();
  assert.ok(findings.length === 2 && findings[1].importCount === 2);
  for (let run = 0; run < 2; run++) {
    const again = await check.execute(projectId, { force: true });
    assert.deepEqual(again.checked, first.checked);
    assert.deepEqual(await snapshotOf(), findings, "same findings, same documents, same evidence");
    assert.deepEqual(await countsOf(), counts);
  }
  // Without force nothing is re-checked, and nothing changes either.
  assert.deepEqual(await check.execute(projectId), { baselineCommit: null, checked: [], skipped: 2 });
  assert.deepEqual(await snapshotOf(), findings);
});

// ── N-08 ─────────────────────────────────────────────────────────────────────

test("N-08: a project token reads only its own project, opens no other API, and stops when revoked or expired", async t => {
  if (!connected) return t.skip("MongoDB is not reachable");
  const a = await seedProject("Alpha", "orders");
  const b = await seedProject("Bravo", "billing");
  const token = async (projectId, extra = {}) => {
    const { token, hash, prefix } = newAgentToken();
    await AgentTokenModel.create({ projectId, name: "agent", tokenHash: hash, prefix, createdBy: "u", createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null, revokedBy: null, lastUsedAt: null, ...extra });
    return token;
  };
  const tokenA = await token(a.projectId), tokenB = await token(b.projectId);
  const revokedB = await token(b.projectId, { revokedAt: new Date() });
  const expiredB = await token(b.projectId, { expiresAt: new Date(Date.now() - 1000) });
  const userB = await UserModel.create({ name: "Bo", email: `bo-${randomUUID().slice(0, 6)}@x.test`, passwordHash: "$2b$10$abcdefghijklmnopqrstuv", isVerified: true, role: "developer-analyst", status: "active" });
  const session = new JwtTokenService("test-jwt-secret", "1h", "7d").generateTokens(String(userB._id), "developer-analyst", 0).accessToken;

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const get = async (path, bearer, headers = {}) => {
    const res = await fetch(base + path, { headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers } });
    return { status: res.status, text: await res.text() };
  };
  // Every name, description, rule and ADR of Bravo carries "Bravo"; its id must not appear either.
  const leaksBravo = text => /Bravo/.test(text) || text.includes(b.projectId);

  // Its own project: answered, and nothing of Bravo in it.
  const own = await get("/agent/context?file=src/orders/a.ts", tokenA);
  assert.equal(own.status, 200);
  assert.match(own.text, /Alpha Core/);
  assert.ok(!leaksBravo(own.text), own.text);
  // Asking for Bravo's project or files changes nothing: the token decides the project.
  for (const attempt of [
    get(`/agent/context?file=src/billing/c.ts&projectId=${b.projectId}`, tokenA),
    get("/agent/context?file=src/billing/c.ts", tokenA, { "X-Project-Id": b.projectId }),
    get(`/agent/context?file=src/billing/c.ts&project=${b.projectId}&id=${b.projectId}`, tokenA),
  ]) {
    const r = await attempt;
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.text).data.component, null, "Bravo's paths mean nothing in Alpha");
    assert.ok(!leaksBravo(r.text), r.text);
  }
  const md = await get("/agent/agents-md", tokenA);
  assert.equal(md.status, 200);
  assert.ok(md.text.includes("# AGENTS.md — Alpha") && !leaksBravo(md.text));

  // The token is not a session: no other API of either project opens with it.
  for (const path of [`/projects/${a.projectId}`, `/projects/${a.projectId}/workspace`, `/projects/${a.projectId}/snapshots`, `/projects/${a.projectId}/agents-md`,
    `/projects/${a.projectId}/agent-tokens`, `/projects/${b.projectId}/workspace`, `/projects/${b.projectId}/agents-md`, "/projects", "/conformance/unread"]) {
    assert.equal((await get(path, tokenA)).status, 401, path);
  }
  // And a person's session is not a project token.
  assert.equal((await get("/agent/context?file=src/billing/c.ts", session)).status, 401);
  // Revoked, expired, unknown or missing tokens are refused; Bravo's own token still works for Bravo only.
  for (const bad of [revokedB, expiredB, newAgentToken().token, "", `${tokenA}x`]) {
    assert.equal((await get("/agent/context?file=src/billing/c.ts", bad)).status, 401, bad.slice(0, 12));
  }
  const bravo = await get("/agent/context?file=src/billing/c.ts", tokenB);
  assert.match(bravo.text, /Bravo Core/);
  assert.ok(!/Alpha/.test(bravo.text));
  // A token whose project is gone stops at once.
  await ProjectModel.deleteOne({ _id: b.projectId });
  assert.equal((await get("/agent/context?file=src/billing/c.ts", tokenB)).status, 401);
});
