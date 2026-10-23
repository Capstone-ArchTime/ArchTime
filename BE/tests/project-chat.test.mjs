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

test("citedEvidence lists what is behind the numbers, one item per cited commit", () => {
  const cited = citedEvidence("See `a1b2c3d`.", evidences, snapshots);
  assert.equal(cited.items.length, 1);
  assert.deepEqual(cited.items[0], {
    commit: "a1b2c3d", kind: "evidence", title: "Extract billing", type: "MODULE SPLIT", date: "2026-03-01T00:00:00.000Z",
    summary: "Billing moved out of core", files: 12, dependencies: { added: 4, removed: 1 }, sourceFiles: ["core/Billing.java"], moreFiles: 0,
  });
});

test("citedEvidence items add up to the totals and follow the order of the commits", () => {
  const more = [...snapshots, { hash: "ffff000", fullHash: "ffff0000aaaabbbbccccddddeeee111122223333", title: "Other", author: "Binh", date: "2026-02-01T00:00:00Z", files: 5, archChanges: 1, depAdded: 1, depRemoved: 0 }];
  const cited = citedEvidence("`ffff000` then `a1b2c3d`", evidences, more);
  assert.deepEqual(cited.commits, ["a1b2c3d", "ffff000"]);
  assert.deepEqual(cited.items.map(item => item.commit), cited.commits);
  assert.equal(cited.items.reduce((sum, item) => sum + item.files, 0), cited.files);
  assert.equal(cited.items.reduce((sum, item) => sum + item.dependencies.added, 0), cited.dependencies.added);
  assert.equal(cited.items.reduce((sum, item) => sum + item.dependencies.removed, 0), cited.dependencies.removed);
});

test("citedEvidence marks a commit that has a snapshot but no evidence and does not count it", () => {
  const lonely = { hash: "9f8e7d6", fullHash: "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", title: "Add gateway", author: "Binh", date: "2026-02-10T00:00:00Z", files: 20, archChanges: 0, depAdded: 9, depRemoved: 2 };
  const cited = citedEvidence("`9f8e7d6` and `a1b2c3d`", evidences, [...snapshots, lonely]);
  const item = cited.items.find(i => i.commit === "9f8e7d6");
  assert.equal(item.kind, "snapshot");
  assert.equal(item.author, "Binh");
  assert.equal(cited.files, 12);
  assert.deepEqual(cited.dependencies, { added: 4, removed: 1 });
});

test("citedEvidence lists a long file list only in part and says how many were left out", () => {
  const files = Array.from({ length: CHAT_LIMITS.citedFiles + 5 }, (_, i) => `src/f${i}.ts`);
  const cited = citedEvidence("`a1b2c3d`", [{ ...evidences[0], sourceFiles: files }], snapshots);
  assert.equal(cited.items[0].sourceFiles.length, CHAT_LIMITS.citedFiles);
  assert.equal(cited.items[0].moreFiles, 5);
});

test("citedEvidence counts a commit once even when several changes share it", () => {
  const cited = citedEvidence("`a1b2c3d`", [evidences[0], { ...evidences[0], changeTitle: "Second change" }], snapshots);
  assert.equal(cited.items.length, 1);
  assert.equal(cited.files, 12);
  assert.equal(cited.items[0].title, "Extract billing");
});
