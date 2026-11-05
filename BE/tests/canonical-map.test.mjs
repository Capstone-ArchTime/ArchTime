import test from "node:test";
import assert from "node:assert/strict";
import {
  UNCONFIRMED, diagramContentKey, requestedConfirmation, settleConfirmation,
} from "../src/domain/architecture/canonical.ts";
import { SaveProjectWorkspaceUseCase } from "../src/application/use-cases/workspace/SaveProjectWorkspaceUseCase.ts";
import { ConfirmProjectDiagramUseCase, SaveProjectDiagramUseCase } from "../src/application/use-cases/pm/SaveProjectDiagramUseCase.ts";
import { GetProjectWorkspaceUseCase } from "../src/application/use-cases/workspace/GetProjectWorkspaceUseCase.ts";
import { createProjectRoleMiddleware } from "../src/presentation/middlewares/projectRole.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { RepoVisibility } from "../src/domain/entities/Project.ts";
import { UserRole } from "../src/domain/entities/User.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

const component = (id, name = id) => ({ id, name, kind: "Service", description: "" });
const diagram = (components, dependencies = [], extra = {}) => ({ components, dependencies, revision: 1, ...extra });

/** An in-memory workspace store with the same revision rule as MongoWorkspaceRepository: every save adds one. */
function store() {
  let ws = null;
  return {
    get current() { return ws; },
    async findByProjectId() { return ws; },
    async create(w) { ws = { ...w, id: "ws1", createdAt: new Date(), updatedAt: new Date() }; return ws; },
    async save(w, expectedRevision) {
      const current = ws?.revision ?? 1;
      if (expectedRevision !== undefined && expectedRevision !== current) {
        throw Object.assign(new Error("conflict"), { isConflict: true, expectedRevision, currentRevision: current });
      }
      const next = current + 1;
      ws = { ...w, id: "ws1", revision: next, diagram: { ...w.diagram, revision: next }, createdAt: new Date(), updatedAt: new Date() };
      return ws;
    },
  };
}
const projects = { async findById(id) { return { id, name: "api", userId: "owner", visibility: RepoVisibility.PRIVATE }; } };

// ── domain rules ─────────────────────────────────────────────────────────────

test("Canonical map: the content key ignores order but not content", () => {
  const a = diagram([component("a"), component("b")], [{ id: "d1", source: "a", target: "b", label: "uses" }]);
  const b = diagram([component("b"), component("a")], [{ id: "x", source: "a", target: "b", label: "uses" }]);
  assert.equal(diagramContentKey(a), diagramContentKey(b));
  assert.notEqual(diagramContentKey(a), diagramContentKey(diagram([component("a", "Renamed"), component("b")], a.dependencies)));
  assert.notEqual(diagramContentKey(a), diagramContentKey(diagram(a.components, [])));
});

test("Canonical map: what a save asks for is read from confirmedAt", () => {
  const stored = { confirmedAt: new Date("2026-01-01T00:00:00Z") };
  assert.equal(requestedConfirmation(stored, { confirmedAt: "2026-01-01T00:00:00.000Z" }), "keep");
  assert.equal(requestedConfirmation(stored, { confirmedAt: "2026-02-01T00:00:00.000Z" }), "confirm");
  assert.equal(requestedConfirmation(stored, { confirmedAt: null }), "clear");
  assert.equal(requestedConfirmation(null, { confirmedAt: "2026-02-01T00:00:00.000Z" }), "confirm");
  assert.equal(requestedConfirmation(stored, { confirmedAt: "not a date" }), "clear");
});

test("Canonical map: a kept confirmation survives only while the content is the confirmed content", () => {
  const confirmed = diagram([component("a")], [], { confirmedAt: new Date("2026-01-01"), confirmedBy: "mentor", confirmedRevision: 4 });
  const now = new Date("2026-03-01");
  const same = settleConfirmation({ stored: confirmed, incoming: diagram([component("a")]), request: "keep", now, nextRevision: 9 });
  assert.deepEqual(same, { confirmedAt: new Date("2026-01-01"), confirmedBy: "mentor", confirmedRevision: 4 });
  const changed = settleConfirmation({ stored: confirmed, incoming: diagram([component("a"), component("b")]), request: "keep", now, nextRevision: 9 });
  assert.deepEqual(changed, UNCONFIRMED);
  const confirm = settleConfirmation({ stored: confirmed, incoming: confirmed, request: "confirm", userId: "lead", now, nextRevision: 9 });
  assert.deepEqual(confirm, { confirmedAt: now, confirmedBy: "lead", confirmedRevision: 9 });
});

// ── use cases ────────────────────────────────────────────────────────────────

test("Canonical map: the server records who confirmed and at which revision; the client cannot name someone else", async () => {
  const ws = store();
  const save = new SaveProjectWorkspaceUseCase(ws, projects);
  await save.execute({ projectId: "p1", expectedRevision: 1, diagram: diagram([component("api")]), userId: "mentor" });
  assert.equal(ws.current.diagram.confirmedAt, null, "a plain save is a draft");

  const forged = { ...ws.current.diagram, confirmedAt: "2020-01-01T00:00:00.000Z", confirmedBy: "someone-else", confirmedRevision: 99 };
  const saved = await save.execute({ projectId: "p1", expectedRevision: 2, diagram: forged, userId: "mentor" });
  assert.equal(saved.diagram.confirmedBy, "mentor", "the confirmer is the caller");
  assert.equal(saved.diagram.confirmedRevision, 3, "the revision this save wrote");
  assert.ok(Date.now() - new Date(saved.diagram.confirmedAt).getTime() < 60_000, "the time is the server's");
});

test("Canonical map: editing the diagram drops the confirmation; saving rules alone keeps it", async () => {
  const ws = store();
  const save = new SaveProjectWorkspaceUseCase(ws, projects);
  await save.execute({ projectId: "p1", expectedRevision: 1, diagram: diagram([component("api")], [], { confirmedAt: new Date().toISOString() }), userId: "mentor" });
  const confirmedAt = ws.current.diagram.confirmedAt;
  assert.ok(confirmedAt);

  // Another page saves rules: it sends the diagram back as loaded.
  await save.execute({ projectId: "p1", expectedRevision: 2, diagram: { ...ws.current.diagram }, rules: [], userId: "mentor" });
  assert.equal(new Date(ws.current.diagram.confirmedAt).getTime(), new Date(confirmedAt).getTime());
  assert.equal(ws.current.diagram.confirmedRevision, 2, "still the revision it was confirmed at");

  // Someone edits the diagram but sends the old confirmation back: it does not carry over.
  await save.execute({ projectId: "p1", expectedRevision: 3, diagram: { ...ws.current.diagram, components: [component("api"), component("db")] }, userId: "dev" });
  assert.equal(ws.current.diagram.confirmedAt, null);
  assert.equal(ws.current.diagram.confirmedBy, null);
});

test("Canonical map: an empty diagram cannot be confirmed", async () => {
  const ws = store();
  const save = new SaveProjectWorkspaceUseCase(ws, projects);
  await assert.rejects(
    save.execute({ projectId: "p1", expectedRevision: 1, diagram: diagram([], [], { confirmedAt: new Date().toISOString() }), userId: "mentor" }),
    (e) => e instanceof AppError && e.statusCode === 400,
  );
  await ws.create({ projectId: "p1", revision: 1, diagram: diagram([]), rules: [], decisions: [] });
  await assert.rejects(new ConfirmProjectDiagramUseCase(ws, projects).execute("p1", "mentor"), (e) => e instanceof AppError && e.statusCode === 400);
});

test("Canonical map: the diagram routes confirm with the caller and drop a stale confirmation", async () => {
  const ws = store();
  await ws.create({ projectId: "p1", revision: 1, diagram: diagram([component("api")]), rules: [], decisions: [] });
  const confirmed = await new ConfirmProjectDiagramUseCase(ws, projects).execute("p1", "mentor");
  assert.equal(confirmed.diagram.confirmedBy, "mentor");
  assert.equal(confirmed.diagram.confirmedRevision, 2);

  const put = new SaveProjectDiagramUseCase(ws, projects);
  await put.execute({ projectId: "p1", diagram: diagram([component("api")], [], { confirmedBy: "forged" }), userId: "mentor" });
  assert.equal(ws.current.diagram.confirmedBy, "mentor", "same content: kept, and the request cannot rename the confirmer");
  await put.execute({ projectId: "p1", diagram: diagram([component("web")]), userId: "mentor" });
  assert.equal(ws.current.diagram.confirmedAt, null, "new content: no longer canonical");
});

test("Canonical map: readers see who confirmed it", async () => {
  const ws = store();
  await ws.create({ projectId: "p1", revision: 1, diagram: diagram([component("api")]), rules: [], decisions: [] });
  await new ConfirmProjectDiagramUseCase(ws, projects).execute("p1", "mentor");
  const users = { async findById(id) { return id === "mentor" ? { id, name: "Mia Mentor" } : null; } };
  const read = await new GetProjectWorkspaceUseCase(ws, projects, users).execute("p1");
  assert.equal(read.diagram.confirmedByName, "Mia Mentor");
});

test("Canonical map: only maintainers may confirm; members and viewers may not", async () => {
  const project = { id: "p1", userId: "owner", visibility: RepoVisibility.PUBLIC };
  const members = [
    { projectId: "p1", userId: "mentor", role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE },
    { projectId: "p1", userId: "newcomer", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
  ];
  const checkRole = createProjectRoleMiddleware(
    { async findById() { return project; } },
    { async findByProjectAndUserId(pid, uid) { return members.find((m) => m.projectId === pid && m.userId === uid) ?? null; } },
  );
  const status = async (userId) => {
    let error;
    await checkRole("write")({ params: { id: "p1" }, user: { userId, role: UserRole.USER } }, {}, (e) => { error = e; });
    return error?.statusCode ?? 200;
  };
  assert.equal(await status("owner"), 200);
  assert.equal(await status("mentor"), 200);
  assert.equal(await status("newcomer"), 403);
  assert.equal(await status("passer-by"), 403, "a viewer of a public project");
});

test("Canonical map: the answer to a confirming save already names the confirmer", async () => {
  const ws = store();
  const users = { async findById(id) { return id === "mentor" ? { id, name: "Mia Mentor" } : null; } };
  const saved = await new SaveProjectWorkspaceUseCase(ws, projects, users).execute({
    projectId: "p1", expectedRevision: 1, diagram: diagram([component("api")], [], { confirmedAt: new Date().toISOString() }), userId: "mentor",
  });
  assert.equal(saved.diagram.confirmedByName, "Mia Mentor");
  assert.equal("confirmedByName" in ws.current.diagram, false, "the name is added to the answer, never stored");
});
