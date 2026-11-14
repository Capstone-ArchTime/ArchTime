import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { ProjectChatUseCase } from "../src/application/use-cases/llm/ProjectChatUseCase.ts";
import { ViewerAccessUseCase } from "../src/application/use-cases/projects/ViewerAccessUseCase.ts";
import { ProjectAccessPolicy } from "../src/application/services/ProjectAccessPolicy.ts";
import { DEFAULT_VIEWER_ACCESS, RepoVisibility, viewerAccessOf } from "../src/domain/entities/Project.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

// UC-16, BR-17: the owner of a public personal workspace decides whether viewers see it, may ask the mentor, and how often.

const personal = (viewerAccess) => ({ id: "p1", name: "Shop", repoUrl: "https://github.com/o/shop.git", visibility: RepoVisibility.PUBLIC, userId: "owner", status: "COMPLETED", ...(viewerAccess ? { viewerAccess } : {}) });
const status = (code) => (err) => err instanceof AppError && err.statusCode === code;

test("defaults: viewing on, mentor off, 10 questions a day", () => {
  assert.deepEqual(viewerAccessOf(personal()), DEFAULT_VIEWER_ACCESS);
  assert.deepEqual(viewerAccessOf(personal({ allowChat: true })), { publicRead: true, allowChat: true, dailyLimit: 10 });
});

test("a viewer reads a public personal workspace only while the owner keeps viewing on", async () => {
  const policy = new ProjectAccessPolicy(
    { async findById() { return null; } },
    { async findByProjectAndUserId() { return null; } },
  );
  const reader = { userId: "gina", role: "developer-analyst" };
  assert.equal((await policy.evaluate(personal(), reader)).role, "viewer");
  assert.equal((await policy.evaluate(personal({ publicRead: false }), reader)).role, null);
  assert.equal((await policy.evaluate(personal({ publicRead: false }), { userId: "owner", role: "developer-analyst" })).role, "owner", "the owner always sees it");
});

test("the owner changes the settings; organization and private workspaces have no viewers", async () => {
  let stored = personal();
  const repo = {
    async findById(id) { return id === "p1" ? stored : id === "org" ? { ...personal(), id: "org", organizationId: "o1" } : id === "priv" ? { ...personal(), id: "priv", visibility: RepoVisibility.PRIVATE } : null; },
    async updateViewerAccess(id, access) { stored = { ...stored, viewerAccess: access }; return stored; },
  };
  const uc = new ViewerAccessUseCase(repo);
  assert.deepEqual(await uc.update("p1", { allowChat: true, dailyLimit: 3 }), { publicRead: true, allowChat: true, dailyLimit: 3 });
  assert.deepEqual(await uc.get("p1"), { publicRead: true, allowChat: true, dailyLimit: 3 });
  await assert.rejects(uc.update("p1", { dailyLimit: 0 }), status(400));
  await assert.rejects(uc.update("p1", { allowChat: "yes" }), status(400));
  await assert.rejects(uc.update("org", { allowChat: true }), status(400));
  await assert.rejects(uc.update("priv", { allowChat: true }), status(400));
  await assert.rejects(uc.update("nope", {}), status(404));
});

test("a viewer may ask the mentor only when allowed, and only up to the daily limit", async () => {
  const messages = [{ role: "user", content: "What are the main components?" }];
  const neverCalled = { assertCanAppend: async () => { throw new Error("must not get this far"); }, append: async () => { throw new Error("must not get this far"); } };
  const counted = (n) => ({ async today() { return n; } });

  const closed = new ProjectChatUseCase(neverCalled, { record: async () => {} }, undefined, counted(0));
  await assert.rejects(closed.execute({ project: personal(), userId: "gina", messages, viewer: true }), status(403));

  const full = new ProjectChatUseCase(neverCalled, { record: async () => {} }, undefined, counted(3));
  await assert.rejects(full.execute({ project: personal({ allowChat: true, dailyLimit: 3 }), userId: "gina", messages, viewer: true }),
    (err) => status(429)(err) && /limit of 3 questions/.test(err.message));
});
