import test from "node:test";
import assert from "node:assert/strict";
import { checkPathPrefixes, normalizePathPrefix } from "../src/domain/architecture/pathPrefix.ts";
import { diagramContentKey } from "../src/domain/architecture/canonical.ts";
import { SaveProjectWorkspaceUseCase } from "../src/application/use-cases/workspace/SaveProjectWorkspaceUseCase.ts";
import { SaveProjectDiagramUseCase } from "../src/application/use-cases/pm/SaveProjectDiagramUseCase.ts";
import { CreateApprovalRequestUseCase } from "../src/application/use-cases/pm/ApprovalQueueUseCases.ts";
import { RepoVisibility } from "../src/domain/entities/Project.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

// F-07 (SRS §3.9.1): a component of the canonical map may own a repository folder; two components may not own the same one.

const component = (id, pathPrefix) => ({ id, name: id, kind: "Service", description: "", ...(pathPrefix === undefined ? {} : { pathPrefix }) });
const diagram = (components, extra = {}) => ({ components, dependencies: [], revision: 1, ...extra });
const projects = { async findById(id) { return { id, name: "api", userId: "owner", visibility: RepoVisibility.PRIVATE }; } };
const status = (code) => (e) => e instanceof AppError && e.statusCode === code;

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
      ws = { ...w, id: "ws1", revision: current + 1, diagram: { ...w.diagram, revision: current + 1 } };
      return ws;
    },
  };
}

test("Path prefix: stored with forward slashes, no leading ./ or /, and one trailing /", () => {
  assert.equal(normalizePathPrefix(" ./src\\auth "), "src/auth/");
  assert.equal(normalizePathPrefix("/src//auth/"), "src/auth/");
  assert.equal(normalizePathPrefix("Src/Auth"), "Src/Auth/", "repository paths are case-sensitive");
  assert.equal(normalizePathPrefix(""), "");
  assert.equal(normalizePathPrefix("  /  "), "");
  assert.equal(normalizePathPrefix(undefined), "");
  assert.equal(normalizePathPrefix(42), "");
});

test("Path prefix: the same folder written two ways is a duplicate; nested folders and empty prefixes are fine", () => {
  const dup = checkPathPrefixes([component("auth", "src/auth"), component("login", "./src/auth/")]);
  assert.match(dup.problem, /"login" and "auth" have the same path prefix "src\/auth\/"/);

  const ok = checkPathPrefixes([component("app", "src"), component("auth", "src/auth"), component("docs"), component("misc", "")]);
  assert.equal(ok.problem, null);
  assert.deepEqual(ok.components.map((c) => c.pathPrefix), ["src/", "src/auth/", "", ""]);

  assert.match(checkPathPrefixes([component("up", "../other")]).problem, /inside the repository/);
  assert.match(checkPathPrefixes([component("long", "a/".repeat(150))]).problem, /longer than 200/);
});

test("Path prefix: a workspace save with a duplicate prefix is refused with 400 and writes nothing", async () => {
  const ws = store();
  const save = new SaveProjectWorkspaceUseCase(ws, projects);
  await assert.rejects(
    save.execute({ projectId: "p1", expectedRevision: 1, diagram: diagram([component("a", "src/x/"), component("b", "src/x")]), userId: "m" }),
    status(400),
  );
  assert.equal(ws.current, null);

  const saved = await save.execute({ projectId: "p1", expectedRevision: 1, diagram: diagram([component("a", "\\src\\x"), component("b", "src/y/")]), userId: "m" });
  assert.deepEqual(saved.diagram.components.map((c) => c.pathPrefix), ["src/x/", "src/y/"], "stored normalized");
});

test("Path prefix: PUT /diagram and a proposed architecture change check prefixes too", async () => {
  const ws = store();
  await assert.rejects(
    new SaveProjectDiagramUseCase(ws, projects).execute({ projectId: "p1", diagram: diagram([component("a", "lib/"), component("b", "lib")]), userId: "m" }),
    status(400),
  );
  await assert.rejects(
    new CreateApprovalRequestUseCase(projects).execute({
      projectId: "p1", title: "Split auth", requestedBy: "dev",
      data: { diagram: { components: [component("a", "lib/"), component("b", "/lib/")], dependencies: [] } },
    }),
    status(400),
  );
});

test("Path prefix: it is part of the diagram content, so changing it drops a confirmation", () => {
  assert.notEqual(diagramContentKey(diagram([component("a", "src/a/")])), diagramContentKey(diagram([component("a", "src/b/")])));
  assert.equal(diagramContentKey(diagram([component("a", "src/a")])), diagramContentKey(diagram([component("a", "./src/a/")])));
  assert.equal(diagramContentKey(diagram([component("a")])), diagramContentKey(diagram([component("a", "")])), "absent and empty are the same");
});
