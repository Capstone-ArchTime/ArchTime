import test from "node:test";
import assert from "node:assert/strict";
import {
  CreateProjectDecisionUseCase,
  GetProjectDecisionsUseCase,
  GetProjectDecisionDetailUseCase,
  UpdateProjectDecisionUseCase,
  withProvenance,
} from "../src/application/use-cases/pm/ProjectDecisionUseCases.ts";
import { SaveProjectWorkspaceUseCase } from "../src/application/use-cases/workspace/SaveProjectWorkspaceUseCase.ts";
import { assessStepRevision } from "../src/domain/onboarding/stepRevision.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

const rejectsWith = (status) => (err) => err instanceof AppError && err.statusCode === status;

function workspaceRepo() {
  let ws = null;
  return {
    get current() { return ws; },
    async findByProjectId() { return ws; },
    async create(data) { ws = { id: "ws1", ...data }; return ws; },
    async save(data, expected) {
      if (ws && expected !== undefined && ws.revision !== expected) throw Object.assign(new Error("conflict"), { isConflict: true });
      ws = { id: "ws1", ...data, revision: (ws?.revision ?? 0) + 1 };
      return ws;
    },
  };
}
const projectRepo = { async findById(id) { return id === "p1" ? { id: "p1" } : null; } };

// The project has one mined commit, one evidence record and one approval request.
const verifier = {
  calls: 0,
  async resolve(projectId, kind, ref) {
    this.calls++;
    if (projectId !== "p1") return null;
    if (kind === "commit" && "a1b2c3d4e5f6".startsWith(ref)) return { kind, ref: "a1b2c3d4e5f6", title: "split auth module", date: new Date("2024-02-05") };
    if (kind === "evidence" && ref === "ev1") return { kind, ref, title: "a1b2c3d split auth module" };
    if (kind === "approval" && ref === "ap1") return { kind, ref, title: "Adopt auth service" };
    return null;
  },
};

const base = { projectId: "p1", title: "Extract auth", context: "Auth logic grew", decision: "Split it out", userId: "mentor" };

// ── T15: ADR provenance ──────────────────────────────────────────────────────

test("ADR: recorded by default, with author and a first status entry", async () => {
  const ws = workspaceRepo();
  const adr = await new CreateProjectDecisionUseCase(ws, projectRepo, verifier).execute(base);
  assert.equal(adr.origin, "recorded");
  assert.deepEqual(adr.sources, []);
  assert.equal(adr.createdBy, "mentor");
  assert.deepEqual(adr.statusHistory.map((h) => [h.status, h.by]), [["Proposed", "mentor"]]);
});

test("ADR: sources are checked against the project and stored with their canonical ref and title", async () => {
  const ws = workspaceRepo();
  const adr = await new CreateProjectDecisionUseCase(ws, projectRepo, verifier).execute({
    ...base,
    origin: "reconstructed",
    sources: [
      { kind: "commit", ref: "a1b2c3d", note: "  the split  " },
      { kind: "commit", ref: "a1b2c3d4e5" }, // the same commit again: kept once
      { kind: "evidence", ref: "ev1" },
    ],
  });
  assert.equal(adr.origin, "reconstructed");
  assert.deepEqual(adr.sources.map((s) => [s.kind, s.ref]), [["commit", "a1b2c3d4e5f6"], ["evidence", "ev1"]]);
  assert.equal(adr.sources[0].title, "split auth module");
  assert.equal(adr.sources[0].note, "the split");
});

test("ADR: an invented or foreign source is rejected and nothing is saved", async () => {
  const ws = workspaceRepo();
  const uc = new CreateProjectDecisionUseCase(ws, projectRepo, verifier);
  await assert.rejects(uc.execute({ ...base, sources: [{ kind: "commit", ref: "deadbee" }] }), (err) => rejectsWith(400)(err) && /commit deadbee/.test(err.message));
  await assert.rejects(uc.execute({ ...base, sources: [{ kind: "file", ref: "x" }] }), rejectsWith(400));
  await assert.rejects(uc.execute({ ...base, sources: "a1b2c3d" }), rejectsWith(400));
  await assert.rejects(uc.execute({ ...base, origin: "guessed" }), rejectsWith(400));
  await assert.rejects(uc.execute({ ...base, sources: Array.from({ length: 21 }, () => ({ kind: "evidence", ref: "ev1" })) }), rejectsWith(400));
  assert.equal(ws.current, null);
});

test("ADR: updating status appends to the history; sources are replaced only when sent", async () => {
  const ws = workspaceRepo();
  const created = await new CreateProjectDecisionUseCase(ws, projectRepo, verifier).execute({ ...base, sources: [{ kind: "evidence", ref: "ev1" }] });
  const update = new UpdateProjectDecisionUseCase(ws, projectRepo, verifier);

  const accepted = await update.execute({ projectId: "p1", decisionId: created.id, status: "Accepted", userId: "lead" });
  assert.deepEqual(accepted.statusHistory.map((h) => h.status), ["Proposed", "Accepted"]);
  assert.equal(accepted.updatedBy, "lead");
  assert.equal(accepted.sources.length, 1, "sources untouched");

  const resourced = await update.execute({ projectId: "p1", decisionId: created.id, sources: [{ kind: "approval", ref: "ap1" }], userId: "lead" });
  assert.deepEqual(resourced.sources.map((s) => s.kind), ["approval"]);
  assert.equal(resourced.statusHistory.length, 2, "no status change, no new history entry");
});

test("ADR: list filters by origin; ADRs saved before provenance existed read with defaults", async () => {
  const ws = workspaceRepo();
  const create = new CreateProjectDecisionUseCase(ws, projectRepo, verifier);
  await create.execute(base);
  await create.execute({ ...base, title: "Why REST", origin: "reconstructed" });
  // A legacy ADR, as stored before this change.
  ws.current.decisions.push({ id: "adr-old", number: 99, title: "Old", status: "Accepted", context: "c", decision: "d", alternatives: "", consequences: "", componentIds: [], createdAt: new Date("2023-01-01"), updatedAt: new Date("2023-01-01") });

  const list = new GetProjectDecisionsUseCase(ws, projectRepo);
  assert.deepEqual((await list.execute({ projectId: "p1", origin: "reconstructed" })).decisions.map((d) => d.title), ["Why REST"]);
  assert.equal((await list.execute({ projectId: "p1", origin: "recorded" })).decisions.length, 2);
  await assert.rejects(list.execute({ projectId: "p1", origin: "nope" }), rejectsWith(400));

  const old = await new GetProjectDecisionDetailUseCase(ws, projectRepo).execute("p1", "adr-old");
  assert.equal(old.origin, "recorded");
  assert.deepEqual(old.sources, []);
  assert.deepEqual(old.statusHistory.map((h) => h.status), ["Accepted"]);
});

test("Workspace save keeps ADR provenance the client did not send, and logs status changes", async () => {
  const ws = workspaceRepo();
  const adr = await new CreateProjectDecisionUseCase(ws, projectRepo, verifier).execute({ ...base, origin: "reconstructed", sources: [{ kind: "evidence", ref: "ev1" }] });
  const { origin: _o, sources: _s, statusHistory: _h, createdBy: _c, ...asClientSendsIt } = adr;

  const saved = await new SaveProjectWorkspaceUseCase(ws, projectRepo).execute({
    projectId: "p1",
    expectedRevision: ws.current.revision,
    diagram: { components: [], dependencies: [], revision: 1 },
    decisions: [
      { ...asClientSendsIt, status: "Deprecated", sources: [{ kind: "commit", ref: "forged", title: "x" }] },
      { id: "adr-new", number: 2, title: "New", status: "Proposed", context: "c", decision: "d", alternatives: "", consequences: "", componentIds: [] },
    ],
    userId: "lead",
  });
  const [kept, added] = saved.decisions;
  assert.equal(kept.origin, "reconstructed");
  assert.deepEqual(kept.sources.map((s) => s.ref), ["ev1"], "sources only change through the verified ADR endpoints");
  assert.equal(kept.createdBy, "mentor");
  assert.deepEqual(kept.statusHistory.map((h) => h.status), ["Proposed", "Deprecated"]);
  assert.equal(added.origin, "recorded");
  assert.deepEqual(added.sources, []);
  assert.equal(added.createdBy, "lead");
});

test("withProvenance leaves complete ADRs as they are", () => {
  const d = { id: "a", status: "Accepted", origin: "reconstructed", sources: [{ kind: "evidence", ref: "e", title: "t" }], statusHistory: [{ status: "Accepted", at: new Date() }], createdAt: new Date() };
  assert.deepEqual(withProvenance(d), d);
});

// ── T25: steps bound to a revision ───────────────────────────────────────────

const pinned = { commit: "a1b2c3d4e5f6", snapshotId: "s1", workspaceRevision: 4, pinnedAt: new Date("2024-03-01") };

test("Step revision: current while the commit exists and the canonical map is unchanged", () => {
  const r = assessStepRevision(pinned, { snapshotExists: true, commitGone: false, currentWorkspaceRevision: 4 });
  assert.deepEqual(r, { status: "current", issues: [] });
});

test("Step revision: outdated when the canonical map was edited since", () => {
  const r = assessStepRevision(pinned, { snapshotExists: true, commitGone: false, currentWorkspaceRevision: 6 });
  assert.equal(r.status, "outdated");
  assert.deepEqual(r.issues.map((i) => i.code), ["MAP_CHANGED"]);
  assert.match(r.issues[0].message, /revision 4 to 6/);
});

test("Step revision: missing when the commit vanished from history, even if the map also changed", () => {
  const r = assessStepRevision(pinned, { snapshotExists: true, commitGone: true, goneSince: new Date("2024-04-02"), currentWorkspaceRevision: 6 });
  assert.equal(r.status, "missing");
  assert.deepEqual(r.issues.map((i) => i.code), ["COMMIT_GONE", "MAP_CHANGED"]);
  assert.match(r.issues[0].message, /a1b2c3d .*2024-04-02/);
});

test("Step revision: missing when the snapshot was deleted", () => {
  const r = assessStepRevision(pinned, { snapshotExists: false, commitGone: false, currentWorkspaceRevision: 4 });
  assert.equal(r.status, "missing");
  assert.deepEqual(r.issues.map((i) => i.code), ["SNAPSHOT_GONE"]);
});

test("Step revision: a step without a map revision is never outdated by map edits", () => {
  const r = assessStepRevision({ ...pinned, workspaceRevision: null }, { snapshotExists: true, commitGone: false, currentWorkspaceRevision: 9 });
  assert.equal(r.status, "current");
});
