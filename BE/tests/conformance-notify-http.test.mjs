import "./setup-env.mjs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { NodemailerEmailService } from "../src/infrastructure/services/NodemailerEmailService.ts";

// The "E-mail new findings" button: POST /api/projects/:id/conformance/notify sends the same e-mail as the automatic
// check (RF-29, BR-34), at once, to the people who answer for the project; each finding is e-mailed once.

const sent = [];
NodemailerEmailService.prototype.sendNotification = async (to, mail) => { sent.push({ to, subject: mail.subject }); };
const { app } = await import("../src/app.ts");
const { MongoConformanceRepository } = await import("../src/infrastructure/repositories/MongoConformanceRepository.ts");
const { ConformanceFindingModel, ConformanceCheckModel } = await import("../src/infrastructure/database/models/ConformanceModels.ts");
const { ProjectModel } = await import("../src/infrastructure/database/models/ProjectModel.ts");
const { ProjectMemberModel } = await import("../src/infrastructure/database/models/ProjectMemberModel.ts");
const { UserModel } = await import("../src/infrastructure/database/models/UserModel.ts");
const { JwtTokenService } = await import("../src/infrastructure/services/JwtTokenService.ts");

const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_notify_${randomUUID().slice(0, 8)}`;
let connected = false;
before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await Promise.all([ConformanceFindingModel.syncIndexes(), ConformanceCheckModel.syncIndexes(), UserModel.syncIndexes()]);
    connected = true;
  } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test("a maintainer e-mails the new findings at once; a second press sends nothing; a member cannot", async t => {
  if (!connected) return t.skip("MongoDB is not reachable");
  const person = async (name, email) => UserModel.create({ name, email, passwordHash: "$2b$10$abcdefghijklmnopqrstuv", isVerified: true, role: "developer-analyst", status: "active" });
  const [eve, carl] = [await person("Eve", "eve@notify.test"), await person("Carl", "carl@notify.test")];
  const project = await ProjectModel.create({ name: "Shop", repoUrl: "https://github.com/acme/shop", visibility: "private", userId: String(eve._id), status: "COMPLETED" });
  const projectId = String(project._id);
  await ProjectMemberModel.create({ projectId, userId: String(carl._id), name: "Carl", email: "carl@notify.test", role: "developer-analyst", status: "active" });
  const day = new Date(Date.UTC(2026, 10, 2));
  await new MongoConformanceRepository().recordCheck({
    check: { projectId, snapshotId: "s1", snapshotHash: "bbbbbbb", commitDate: day, fingerprint: "fp", checkedAt: day, counts: { findings: 1, errors: 1, warnings: 0, unmappedFiles: 0, files: 2 }, unresolvedRules: [] },
    findings: [{ key: "forbidden-dependency|r1|billing|orders", type: "forbidden-dependency", ruleId: "r1", ruleName: "No callbacks", severity: "error", source: "billing", target: "orders", sourceName: "Billing", targetName: "Orders", imports: [{ from: "a.ts", to: "b.ts" }], importCount: 1, files: ["a.ts"] }],
    inherited: new Map(),
  });

  const jwt = new JwtTokenService("test-jwt-secret", "1h", "7d");
  const bearer = user => ({ Authorization: `Bearer ${jwt.generateTokens(String(user._id), "developer-analyst", 0).accessToken}` });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const notify = headers => fetch(`http://127.0.0.1:${server.address().port}/api/projects/${projectId}/conformance/notify`, { method: "POST", headers });

  assert.equal((await notify({})).status, 401);
  assert.ok([403, 404].includes((await notify(bearer(carl))).status), "a plain member cannot send it");
  assert.equal(sent.length, 0);

  const first = await notify(bearer(eve));
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).data, { findings: 1, problems: 1, sent: 1, recipients: 1 });
  assert.deepEqual(sent, [{ to: "eve@notify.test", subject: "ArchTime — 1 new conformance finding in Shop" }]);
  assert.ok((await ConformanceFindingModel.findOne({ projectId }).lean()).notifiedAt, "marked as told");

  const second = await notify(bearer(eve));
  assert.deepEqual((await second.json()).data, { findings: 0, problems: 0, sent: 0, recipients: 0 }, "nothing new: nothing sent");
  assert.equal(sent.length, 1);
});
