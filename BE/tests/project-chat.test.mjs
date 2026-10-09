import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectContext, citedEvidence, parseChatMessages, CHAT_LIMITS,
} from "../src/application/use-cases/llm/ProjectChatContext.ts";

const project = { name: "Shop", description: "Demo shop", repoUrl: "https://user:secret-pass@github.com/org/shop.git" };
const snapshots = [
  { hash: "a1b2c3d", fullHash: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", title: "Split billing", author: "An", date: "2026-03-01T00:00:00Z", files: 12, archChanges: 3, depAdded: 4, depRemoved: 1 },
];
const evidences = [
  { commit: "a1b2c3d4e5f6", changeTitle: "Extract billing", type: "MODULE SPLIT", date: "2026-03-01T00:00:00Z", files: 12, summary: "Billing moved out of core", depsAdded: 4, depsRemoved: 1, sourceFiles: ["core/Billing.java"] },
  { commit: "ffff0000aaaa", changeTitle: "Other", type: "DEPENDENCY CHANGE", date: "2026-02-01T00:00:00Z", files: 5, summary: "x", depsAdded: 1, depsRemoved: 0, sourceFiles: [] },
];
const base = { project, snapshots, snapshotTotal: 1, evidences, evidenceTotal: 2, structure: null };

test("parseChatMessages keeps recent turns that start and end with the user", () => {
  const out = parseChatMessages([
    { role: "assistant", content: "welcome" },
    { role: "user", content: " hi " },
    { role: "assistant", content: "hello" },
    { role: "user", content: "why?" },
  ]);
  assert.deepEqual(out.map(m => m.role), ["user", "assistant", "user"]);
  assert.equal(out[0].content, "hi");
});

test("parseChatMessages caps history at maxMessages", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` }));
  many.push({ role: "user", content: "last" });
  const out = parseChatMessages(many);
  assert.ok(out.length <= CHAT_LIMITS.maxMessages);
  assert.equal(out.at(-1).content, "last");
});

test("parseChatMessages rejects bad input", () => {
  assert.throws(() => parseChatMessages(undefined));
  assert.throws(() => parseChatMessages([]));
  assert.throws(() => parseChatMessages([{ role: "system", content: "x" }]));
  assert.throws(() => parseChatMessages([{ role: "user", content: 5 }]));
  assert.throws(() => parseChatMessages([{ role: "assistant", content: "only me" }]));
  assert.throws(() => parseChatMessages([{ role: "user", content: "a".repeat(CHAT_LIMITS.maxMessageChars + 1) }]));
});

test("buildProjectContext strips repo credentials and lists known commits", () => {
  const { text, knownCommits } = buildProjectContext(base);
  assert.ok(!text.includes("secret-pass"));
  assert.ok(!text.includes("user:"));
  assert.ok(text.includes("a1b2c3d"));
  assert.ok(text.includes("Extract billing"));
  assert.deepEqual(new Set(knownCommits), new Set(["a1b2c3d", "ffff000"]));
});

test("buildProjectContext stays within the size limit even with huge data", () => {
  const big = Array.from({ length: 25 }, (_, i) => ({ ...evidences[0], commit: `c${i}`.padEnd(7, "0"), summary: "s".repeat(5000), sourceFiles: Array.from({ length: 50 }, () => "p".repeat(500)) }));
  const nodes = Array.from({ length: 500 }, (_, i) => ({ name: "n".repeat(300) + i, type: "module" }));
  const { text } = buildProjectContext({ ...base, evidences: big, evidenceTotal: 25, structure: { hash: "a1b2c3d", title: "t", nodeCount: 500, edgeCount: 9, nodes } });
  assert.ok(text.length <= CHAT_LIMITS.maxContextChars + 40);
});

test("buildProjectContext says so when there is no data", () => {
  const { text } = buildProjectContext({ ...base, snapshots: [], snapshotTotal: 0, evidences: [], evidenceTotal: 0 });
  assert.ok(text.includes("none recorded yet"));
});

test("citedEvidence only returns commits that exist in the data and sums their changes", () => {
  const cited = citedEvidence("The split happened in `a1b2c3d` and also `deadbeef`.", evidences, snapshots);
  assert.deepEqual(cited.commits, ["a1b2c3d"]);
  assert.equal(cited.files, 12);
  assert.deepEqual(cited.dependencies, { added: 4, removed: 1 });
});

test("citedEvidence returns null when nothing real is cited", () => {
  assert.equal(citedEvidence("No commit hashes here.", evidences, snapshots), null);
  assert.equal(citedEvidence("Invented `deadbeef` commit", evidences, snapshots), null);
});
