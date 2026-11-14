import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { startWorkflowApp } from "./workflow-harness.mjs";
import { ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { RepoVisibility } from "../src/domain/entities/Project.ts";

// WF-04 Govern the architecture (BM04 §6.4), the committed tests by their IDs, against the whole back end:
//   FE-08-TC01..03 and the path prefix criterion of F-07, SM-05 (2 transitions), SM-07 (3 transitions),
//   the end-to-end test of DS-04a, and DS-04b.
// Actors: a maintainer (lead), a member (newcomer) and a viewer of the public workspace (visitor).

let h, unavailable = null, lead, newcomer, visitor, leadToken, newcomerToken, visitorToken, projectId;

before(async () => {
  h = await startWorkflowApp("wf04");
  if (h.unavailable) { unavailable = h.unavailable; return; }
  const owner = await h.user("owner");
  [lead, newcomer, visitor] = await Promise.all([h.user("lead"), h.user("newcomer"), h.user("visitor")]);
  projectId = await h.project(owner, { visibility: RepoVisibility.PUBLIC, members: [[lead, ProjectMemberRole.MAINTAINER], [newcomer, ProjectMemberRole.MEMBER]] });
  [leadToken, newcomerToken, visitorToken] = await Promise.all([h.tokenOf(lead), h.tokenOf(newcomer), h.tokenOf(visitor)]);
});
after(async () => { if (!unavailable) await h.stop(); });

const component = (id, pathPrefix = "") => ({ id, name: id, kind: "Service", description: `${id} component`, pathPrefix });
const P = () => `/projects/${projectId}`;
const workspace = async () => (await h.call(leadToken, "GET", `${P()}/workspace`)).body.data.workspace;
const saveWorkspace = (token, expectedRevision, diagram, extra = {}) => {
  return h.call(token, "PUT", `${P()}/workspace`, { expectedRevision, diagram, rules: extra.rules ?? [], decisions: extra.decisions ?? [] });
};
/** A fresh start: an unconfirmed diagram with web -> api -> db, no rules, decisions or approvals. */
async function reset() {
  const ws = await workspace();
  if (ws.diagram.confirmedAt) await h.call(leadToken, "POST", `${P()}/diagram/unconfirm`);
  const now = await workspace();
  const diagram = { components: [component("web", "src/web/"), component("api", "src/api/"), component("db")], dependencies: [{ id: "e1", source: "web", target: "api", label: "HTTPS" }, { id: "e2", source: "api", target: "db", label: "SQL" }], revision: now.revision, confirmedAt: null };
  const saved = await saveWorkspace(leadToken, now.revision, diagram);
  assert.equal(saved.status, 200, saved.text);
  return saved.body.data.workspace;
}
const propose = (token, components) => h.call(token, "POST", `${P()}/approvals`, {
  title: "Split the API", description: "api grows too big", type: "architecture_change",
  data: { diagram: { components, dependencies: [] } },
});

test("FE-08-TC01 (F-07): a save from an older revision is refused with 409 (MSG11) and nothing is overwritten", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await reset();
  const fresh = await saveWorkspace(leadToken, ws.revision, { ...ws.diagram, components: [...ws.diagram.components, component("cache")] });
  assert.equal(fresh.status, 200);
  const stale = await saveWorkspace(leadToken, ws.revision, { ...ws.diagram, components: [component("other")] });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "CONFLICT");
  assert.deepEqual((await workspace()).diagram.components.map((c) => c.id), ["web", "api", "db", "cache"], "the newer save is kept");
});

test("FE-08-TC02 (F-07): a forbidden dependency in the diagram is reported by the rule check", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await reset();
  const rule = await h.call(leadToken, "POST", `${P()}/rules`, { name: "UI never talks to the database", source: "web", target: "db", constraint: "forbidden", severity: "error", rationale: "go through the API" });
  assert.equal(rule.status, 201, rule.text);
  const evaluate = async () => (await h.call(leadToken, "GET", `${P()}/rules/evaluate`)).body.data.evaluation;
  assert.equal((await evaluate()).violationCount, 0, "web does not reach db yet");

  const ws = await workspace();
  await saveWorkspace(leadToken, ws.revision, { ...ws.diagram, dependencies: [...ws.diagram.dependencies, { id: "e3", source: "web", target: "db", label: "SQL" }] }, { rules: ws.rules });
  const evaluation = await evaluate();
  assert.equal(evaluation.violationCount, 1);
  assert.equal(evaluation.results[0].status, "violation");
  assert.match(evaluation.results[0].message, /Forbidden dependency detected from "web" to "db"/);
});

test("FE-08-TC03 (F-07): deciding an approval that is already decided is refused with 400 (MSG12)", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await reset();
  const created = await propose(newcomerToken, [component("api"), component("billing")]);
  const id = created.body.data.approval.id;
  assert.equal((await h.call(leadToken, "POST", `${P()}/approvals/${id}/approve`, {})).status, 200);
  const again = await h.call(leadToken, "POST", `${P()}/approvals/${id}/approve`, {});
  assert.equal(again.status, 400);
  assert.match(again.body.error.message, /already approved/);
  assert.equal((await h.call(leadToken, "POST", `${P()}/approvals/${id}/reject`, { reviewNote: "too late" })).status, 400);
});

test("F-07: path prefixes are saved with each confirmed component; overlapping prefixes are refused", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await reset();
  const confirmed = await saveWorkspace(leadToken, ws.revision, { ...ws.diagram, confirmedAt: new Date().toISOString() });
  assert.equal(confirmed.status, 200);
  assert.deepEqual(confirmed.body.data.workspace.diagram.components.map((c) => c.pathPrefix), ["src/web/", "src/api/", ""]);
  assert.ok(confirmed.body.data.workspace.diagram.confirmedAt);

  await h.call(leadToken, "POST", `${P()}/diagram/unconfirm`);
  const now = await workspace();
  const overlap = await saveWorkspace(leadToken, now.revision, { ...now.diagram, components: [component("web", "src/web"), component("site", "./src/web/")] });
  assert.equal(overlap.status, 400);
  assert.match(overlap.body.error.message, /same path prefix/);
});

test("F-07: a confirmed diagram is locked: a direct edit gets 409 DIAGRAM_LOCKED until it is unconfirmed", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await reset();
  await saveWorkspace(leadToken, ws.revision, { ...ws.diagram, confirmedAt: new Date().toISOString() });
  const locked = await workspace();
  const edit = await saveWorkspace(leadToken, locked.revision, { ...locked.diagram, components: [component("web")] });
  assert.equal(edit.status, 409);
  assert.equal(edit.body.error.code, "DIAGRAM_LOCKED");
  assert.equal((await h.call(leadToken, "POST", `${P()}/diagram/unconfirm`)).status, 200);
  const draft = await workspace();
  assert.equal((await saveWorkspace(leadToken, draft.revision, { ...draft.diagram, components: [component("web")] })).status, 200);
});

test("SM-05 pending -> approved: approving applies the proposed diagram and confirms it", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await reset();
  const created = await propose(newcomerToken, [component("api"), component("billing", "src/billing/")]);
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.data.approval.status, "pending");
  const approved = await h.call(leadToken, "POST", `${P()}/approvals/${created.body.data.approval.id}/approve`, { reviewNote: "ok" });
  assert.equal(approved.body.data.approval.status, "approved");
  const ws = await workspace();
  assert.deepEqual(ws.diagram.components.map((c) => c.id), ["api", "billing"]);
  assert.ok(ws.diagram.confirmedAt, "the approved diagram is the canonical map");
});

test("SM-05 pending -> rejected: a rejection needs a reason, and leaves the diagram alone", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await reset();
  const id = (await propose(newcomerToken, [component("monolith")])).body.data.approval.id;
  assert.equal((await h.call(leadToken, "POST", `${P()}/approvals/${id}/reject`, {})).status, 400, "no reason, no rejection");
  const rejected = await h.call(leadToken, "POST", `${P()}/approvals/${id}/reject`, { reviewNote: "we keep the services" });
  assert.equal(rejected.body.data.approval.status, "rejected");
  assert.deepEqual((await workspace()).diagram.components.map((c) => c.id), ["web", "api", "db"]);
});

async function adr(status) {
  const res = await h.call(leadToken, "POST", `${P()}/decisions`, { title: "Use PostgreSQL", context: "We need transactions", decision: "PostgreSQL", status });
  assert.equal(res.status, 201, res.text);
  return res.body.data.decision ?? res.body.data;
}
const setStatus = (id, status) => h.call(leadToken, "PUT", `${P()}/decisions/${id}`, { status });

test("SM-07 Proposed -> Accepted: the change is recorded with who made it", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const d = await adr();
  assert.equal(d.status, "Proposed");
  const res = await setStatus(d.id, "Accepted");
  const after = res.body.data.decision ?? res.body.data;
  assert.equal(after.status, "Accepted");
  assert.deepEqual(after.statusHistory.map((s) => s.status), ["Proposed", "Accepted"]);
  assert.equal(after.statusHistory[1].by, lead.id);
});

test("SM-07 Accepted -> Deprecated: a superseded decision is deprecated, its history kept", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const d = await adr("Accepted");
  const after = (await setStatus(d.id, "Deprecated")).body.data;
  const decision = after.decision ?? after;
  assert.deepEqual(decision.statusHistory.map((s) => s.status), ["Accepted", "Deprecated"]);
});

test("SM-07 Proposed -> Deprecated: a proposal that is dropped; an unknown status is refused with 400", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const d = await adr();
  assert.equal((await setStatus(d.id, "accepted")).status, 400, "statuses are spelled exactly");
  const decision = (await setStatus(d.id, "Deprecated")).body.data;
  assert.deepEqual((decision.decision ?? decision).statusHistory.map((s) => s.status), ["Proposed", "Deprecated"]);
});

test("WF-04 end to end (DS-04a): edit and confirm the diagram, add a rule, a member proposes, the maintainer approves, the ADR is accepted", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await reset();
  const confirmed = await saveWorkspace(leadToken, ws.revision, { ...ws.diagram, confirmedAt: new Date().toISOString() });
  assert.ok(confirmed.body.data.workspace.diagram.confirmedAt, "diagram confirmed");
  assert.equal(confirmed.body.data.workspace.diagram.confirmedBy, lead.id);
  assert.equal((await h.call(leadToken, "POST", `${P()}/rules`, { name: "No UI to DB", source: "web", target: "db", constraint: "forbidden", severity: "error", rationale: "" })).status, 201);

  assert.equal((await saveWorkspace(newcomerToken, confirmed.body.data.workspace.revision + 1, ws.diagram)).status, 403, "a member does not edit the diagram");
  assert.equal((await propose(visitorToken, [component("x")])).status, 403, "a viewer does not propose");
  const proposal = await propose(newcomerToken, [component("web", "src/web/"), component("api", "src/api/"), component("billing", "src/billing/"), component("db")]);
  assert.equal(proposal.status, 201, proposal.text);
  assert.equal((await h.call(newcomerToken, "POST", `${P()}/approvals/${proposal.body.data.approval.id}/approve`, {})).status, 403, "a member does not decide");
  const approved = await h.call(leadToken, "POST", `${P()}/approvals/${proposal.body.data.approval.id}/approve`, { reviewNote: "billing gets its own component" });
  assert.equal(approved.body.data.approval.status, "approved");
  const after = await workspace();
  assert.ok(after.diagram.components.some((c) => c.id === "billing" && c.pathPrefix === "src/billing/"));
  assert.ok(after.diagram.confirmedAt, "still the canonical map");

  const decision = await adr();
  const accepted = (await setStatus(decision.id, "Accepted")).body.data;
  assert.equal((accepted.decision ?? accepted).status, "Accepted");
});

test("DS-04b: the diagram open in two tabs; tab B's save after tab A's gets 409 and tab A's save is kept", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const loaded = await reset(); // both tabs load this revision
  const tabA = await saveWorkspace(leadToken, loaded.revision, { ...loaded.diagram, components: [...loaded.diagram.components, component("queue")] });
  assert.equal(tabA.status, 200);
  const tabB = await saveWorkspace(leadToken, loaded.revision, { ...loaded.diagram, components: [...loaded.diagram.components, component("search")] });
  assert.equal(tabB.status, 409);
  assert.match(tabB.body.error.message, /revision conflict/i);
  assert.ok((await workspace()).diagram.components.some((c) => c.id === "queue"));
});
