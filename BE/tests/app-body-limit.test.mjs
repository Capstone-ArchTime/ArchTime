import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { app } from "../src/app.ts";

// The real application, without a database: the body is read before any route runs, so an unknown route is enough to
// see what the body parser lets through. A learning path may hold 50 steps of 4000 characters, far over express's 100 KB default.
async function serve(t) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

const post = (base, body) => fetch(`${base}/api/not-a-route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("a JSON body of a few hundred KB (a long learning path) is read, not refused", async t => {
  const base = await serve(t);
  const body = { steps: Array.from({ length: 50 }, () => ({ body: "Đ".repeat(4000) })) };
  assert.ok(JSON.stringify(body).length > 100 * 1024);
  assert.equal((await post(base, body)).status, 404);
});

test("a body over the limit is refused with 413, not as a server error", async t => {
  const base = await serve(t);
  const response = await post(base, { text: "x".repeat(3 * 1024 * 1024) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
});

// F-13: a large project's Jira export is several MB; only its import route reads bodies up to 25 MB.
const postTo = (base, path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("the Jira import route reads a body of several MB; other routes still refuse over 2 MB", async t => {
  const base = await serve(t);
  const big = { file: "x".repeat(8 * 1024 * 1024) };
  // Read, then refused for want of a token (401), never for its size (413).
  assert.equal((await postTo(base, "/api/projects/abc/tasks/import", big)).status, 401);
  assert.equal((await postTo(base, "/api/projects/abc/tasks/link", big)).status, 413, "the larger limit is only for the import");
  assert.equal((await postTo(base, "/api/projects/abc/snapshots", big)).status, 413);
});

test("over 25 MB, even the Jira import route refuses the body with 413", async t => {
  const base = await serve(t);
  const response = await postTo(base, "/api/projects/abc/tasks/import", { file: "x".repeat(26 * 1024 * 1024) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
});
