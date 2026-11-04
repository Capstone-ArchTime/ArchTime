import test from "node:test";
import assert from "node:assert/strict";
import { citedHashes, enforceClaimLabels, minedCommitMatcher } from "../src/domain/mentor/claimLabels.ts";
import { ProjectChatUseCase } from "../src/application/use-cases/llm/ProjectChatUseCase.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { EvidenceModel } from "../src/infrastructure/database/models/EvidenceModel.ts";
import { LlmModelRegistry } from "../src/infrastructure/llm/registry.ts";

const MINED = [
  { hash: "a1b2c3d", fullHash: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" },
  { hash: "0f9e8d7", fullHash: "0f9e8d7c6b5a49382716051a2b3c4d5e6f708192" },
  { hash: "c0ffee1" }, // an old snapshot that kept only the short hash
];
const isMined = minedCommitMatcher(MINED);

test("Mentor labels: a mined commit is matched by any prefix of 7+ characters, case aside", () => {
  assert.equal(isMined("a1b2c3d"), true);
  assert.equal(isMined("A1B2C3D4E5"), true);
  assert.equal(isMined("a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"), true);
  assert.equal(isMined("a1b2c3e"), false, "one character off");
  assert.equal(isMined("a1b2c3"), false, "too short to identify a commit");
  assert.equal(isMined("c0ffee1"), true, "legacy short snapshot");
  assert.equal(isMined("1234567"), false);
});

test("Mentor labels: citations are hashes in backticks, or bare hex words that mix digits and letters", () => {
  assert.deepEqual(citedHashes("See `A1B2C3D` and 0f9e8d7c, not 1234567, deadbeef or `src/app.ts`."), ["a1b2c3d", "0f9e8d7c"]);
  assert.deepEqual(citedHashes("No commits here."), []);
});

test("Mentor labels: a FACT with a valid citation stays a FACT and the text is untouched", () => {
  const answer = "- [FACT] The auth module was split out in `a1b2c3d`.\n- [INFERENCE] This suggests a layered design.";
  const { text, check } = enforceClaimLabels(answer, isMined);
  assert.equal(text, answer);
  assert.deepEqual(check, { downgraded: 0, removedCitations: [], labels: { FACT: 1, INFERENCE: 1, UNKNOWN: 0 } });
});

test("Mentor labels: a FACT without any citation is downgraded to INFERENCE", () => {
  const { text, check } = enforceClaimLabels("[FACT] The project uses Express.", isMined);
  assert.equal(text, "[INFERENCE] The project uses Express.");
  assert.equal(check.downgraded, 1);
  assert.deepEqual(check.labels, { FACT: 0, INFERENCE: 1, UNKNOWN: 0 });
});

test("Mentor labels: a citation to a commit that was never mined is removed, and its FACT downgraded", () => {
  const { text, check } = enforceClaimLabels("[FACT] Payments were added in `deadbee1` (see `ffff0000`).", isMined);
  assert.equal(text, "[INFERENCE] Payments were added in.", "the made-up hashes and the empty parentheses are gone");
  assert.deepEqual(check.removedCitations, ["deadbee1", "ffff0000"]);
  assert.equal(check.downgraded, 1);
});

test("Mentor labels: one valid citation is enough; invalid ones beside it are still removed", () => {
  const { text, check } = enforceClaimLabels("[FACT] Routing moved in `a1b2c3d`, `bad1234`.", isMined);
  assert.equal(text, "[FACT] Routing moved in `a1b2c3d`.");
  assert.equal(check.downgraded, 0);
  assert.deepEqual(check.removedCitations, ["bad1234"]);
});

test("Mentor labels: each claim on a line is judged on its own citations", () => {
  const line = "[FACT] The API layer appeared in `0f9e8d7`. [FACT] It was later rewritten. [UNKNOWN] Why is not recorded.";
  const { text, check } = enforceClaimLabels(line, isMined);
  assert.equal(text, "[FACT] The API layer appeared in `0f9e8d7`. [INFERENCE] It was later rewritten. [UNKNOWN] Why is not recorded.");
  assert.equal(check.downgraded, 1);
});

test("Mentor labels: a citation written before the label on the same line counts for that claim", () => {
  const { text } = enforceClaimLabels("- `a1b2c3d` [FACT] introduced the cache.", isMined);
  assert.equal(text, "- `a1b2c3d` [FACT] introduced the cache.");
});

test("Mentor labels: a citation on another line does not back a FACT", () => {
  const { text } = enforceClaimLabels("[FACT] The cache was introduced.\nSee `a1b2c3d`.", isMined);
  assert.equal(text, "[INFERENCE] The cache was introduced.\nSee `a1b2c3d`.");
});

test("Mentor labels: INFERENCE and UNKNOWN are never changed, and words are not mistaken for hashes", () => {
  const answer = "[INFERENCE] The team accepted a decoupled design.\n[UNKNOWN] The data does not say who decided.";
  assert.equal(enforceClaimLabels(answer, isMined).text, answer);
});

// ── in the chat use case ─────────────────────────────────────────────────────

const query = (rows) => {
  const q = { sort: () => q, limit: () => q, select: () => q, lean: async () => rows };
  return q;
};

test("Mentor labels: the chat answer, its evidence panel and the saved history all carry the checked text", async (t) => {
  const evidence = [{ commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", type: "ADDED", changeTitle: "Add cache", summary: "", date: new Date(), files: 2, depsAdded: 1, depsRemoved: 0, sourceFiles: [] }];
  t.mock.method(SnapshotModel, "find", () => query([]));
  t.mock.method(SnapshotModel, "countDocuments", async () => 0);
  t.mock.method(SnapshotModel, "findOne", () => query(null));
  t.mock.method(EvidenceModel, "find", () => query(evidence));
  t.mock.method(EvidenceModel, "countDocuments", async () => 1);
  const reply = "[FACT] A cache was added in `a1b2c3d`.\n[FACT] It replaced Redis in `badc0de`.";
  t.mock.method(LlmModelRegistry, "resolve", async () => ({
    modelId: null, modelKey: "test", pricing: null,
    client: { info: { model: "test-model", host: "localhost", external: false }, complete: async () => reply },
  }));

  const saved = [];
  const asked = [];
  const useCase = new ProjectChatUseCase(
    { assertCanAppend: async () => {}, append: async (input) => { saved.push(input); return { id: "c1", title: "t" }; } },
    { record: async () => {} },
    { among: async (projectId, hashes) => { asked.push({ projectId, hashes }); return [MINED[0]]; } },
  );
  const result = await useCase.execute({ project: { id: "p1", name: "api", repoUrl: "https://git.example/api" }, userId: "u-labels", messages: [{ role: "user", content: "What changed?" }] });

  assert.deepEqual(asked, [{ projectId: "p1", hashes: ["a1b2c3d", "badc0de"] }], "the cited hashes are looked up among the project's commits");
  assert.equal(result.answer, "[FACT] A cache was added in `a1b2c3d`.\n[INFERENCE] It replaced Redis in.");
  assert.deepEqual(result.labelCheck, { downgraded: 1, removedCitations: ["badc0de"], labels: { FACT: 1, INFERENCE: 1, UNKNOWN: 0 } });
  assert.deepEqual(result.evidence.commits, ["a1b2c3d"]);
  assert.equal(saved[0].answer.content, result.answer);
  assert.deepEqual(saved[0].answer.labelCheck, result.labelCheck);
});
