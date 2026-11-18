import test from "node:test";
import assert from "node:assert/strict";
import { editsLockedDiagram } from "../src/domain/architecture/canonical.ts";
import { SaveProjectDiagramUseCase } from "../src/application/use-cases/pm/SaveProjectDiagramUseCase.ts";
import { CreateApprovalRequestUseCase } from "../src/application/use-cases/pm/ApprovalQueueUseCases.ts";
import { RepoVisibility } from "../src/domain/entities/Project.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

const component = (id, extra = {}) => ({ id, name: id, kind: "Service", description: "", ...extra });
const diagram = (components, extra = {}) => ({ components, dependencies: [], revision: 1, ...extra });
const projects = { async findById(id) { return { id, name: "api", userId: "owner", visibility: RepoVisibility.PRIVATE }; } };

test("Diagram lock: only a change of the confirmed content is locked; path prefixes and a draft are not", () => {
  const confirmed = diagram([component("api")], { confirmedAt: new Date("2026-11-01") });
  assert.equal(editsLockedDiagram(confirmed, diagram([component("api"), component("db")])), true, "a new component");
  assert.equal(editsLockedDiagram(confirmed, diagram([component("api", { description: "changed" })])), true, "a new description");
  assert.equal(editsLockedDiagram(confirmed, diagram([component("api")])), false, "the same content");
  assert.equal(editsLockedDiagram(confirmed, diagram([component("api", { pathPrefixes: ["src/api/"] })])), false, "path prefixes are set on a confirmed diagram");
  assert.equal(editsLockedDiagram(diagram([component("api")]), diagram([component("db")])), false, "a draft is never locked");
  assert.equal(editsLockedDiagram(null, diagram([component("db")])), false, "nothing saved yet");
});

test("PUT /diagram: a stale expectedRevision is a 409 conflict, not a server error", async () => {
  let ws = { projectId: "p1", revision: 3, diagram: diagram([component("a")]), rules: [], decisions: [] };
  const store = {
    async findByProjectId() { return ws; },
    async save(w, expectedRevision) {
      if (expectedRevision !== undefined && expectedRevision !== ws.revision) {
        throw Object.assign(new Error("conflict"), { isConflict: true, expectedRevision, currentRevision: ws.revision });
      }
      ws = { ...w, revision: ws.revision + 1 };
      return ws;
    },
  };
  await assert.rejects(
    new SaveProjectDiagramUseCase(store, projects).execute({ projectId: "p1", expectedRevision: 1, diagram: diagram([component("b")]), userId: "m" }),
    (e) => e instanceof AppError && e.statusCode === 409 && e.code === "CONFLICT",
  );
  assert.equal(ws.diagram.components[0].id, "a", "nothing written");
});

test("A proposed change is the way to change a locked diagram, so its path prefixes are checked like a direct save", async () => {
  const propose = (components) => new CreateApprovalRequestUseCase(projects).execute({
    projectId: "p1", title: "Split billing", requestedBy: "dev", data: { diagram: { components, dependencies: [] } },
  });
  await assert.rejects(propose([component("a", { pathPrefixes: ["src/x/"] }), component("b", { pathPrefixes: ["./src/x"] })]),
    (e) => e instanceof AppError && e.statusCode === 400 && /already mapped/.test(e.message), "the same folder written two ways");
  await assert.rejects(propose([component("a", { pathPrefixes: ["../outside"] })]), (e) => e instanceof AppError && e.statusCode === 400);
});
