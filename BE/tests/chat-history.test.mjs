import test from "node:test";
import assert from "node:assert/strict";
import { ChatConversationModel } from "../src/infrastructure/database/models/ChatConversationModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { EvidenceModel } from "../src/infrastructure/database/models/EvidenceModel.ts";
import { setLlmRuntime } from "../src/infrastructure/llm/runtime.ts";
import {
  ChatHistoryUseCases, MAX_STORED_MESSAGES, conversationTitle, parseConversationId,
} from "../src/application/use-cases/llm/ChatHistoryUseCases.ts";
import { ProjectChatUseCase } from "../src/application/use-cases/llm/ProjectChatUseCase.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

const ID = "64b7f0c2a1b2c3d4e5f60718";
const OTHER_ID = "64b7f0c2a1b2c3d4e5f60719";
const PROJECT = "66f000000000000000000001";
const USER = "user-1";

/** Chainable stand-in for a Mongoose query: .sort().limit().select().lean() all end in `value`. */
const query = value => { const q = { sort: () => q, limit: () => q, select: () => q, lean: () => Promise.resolve(value) }; return q; };
const rejects = (promise, status) => assert.rejects(promise, e => e instanceof AppError && (status === undefined || e.statusCode === status));

const answer = { content: "[FACT] `a1b2c3d` split billing.", evidence: { commits: ["a1b2c3d"], files: 12, dependencies: { added: 4, removed: 1 }, items: [] }, model: { name: "m", host: "h", external: true }, usage: { inputTokens: 10, outputTokens: 5 } };

test("a title is the first question on one line, cut at 80 characters", () => {
  assert.equal(conversationTitle("  Why\n did   billing split?  "), "Why did billing split?");
  const long = conversationTitle("x".repeat(200));
  assert.equal(long.length, 80);
  assert.ok(long.endsWith("…"));
  assert.equal(conversationTitle("   "), "Untitled chat");
});

test("parseConversationId accepts nothing or a real id and rejects anything else", () => {
  for (const none of [undefined, null, ""]) assert.equal(parseConversationId(none), null);
  assert.equal(parseConversationId(ID), ID);
  for (const bad of [5, {}, "short", `${ID}0`, "../etc/passwd", { $ne: null }]) assert.throws(() => parseConversationId(bad), e => e.statusCode === 400);
});

test("a new conversation is created with the question and the answer, titled by the question", async t => {
  let created;
  t.mock.method(ChatConversationModel, "create", async doc => { created = doc; return { _id: ID, title: doc.title }; });
  const askedAt = new Date("2026-10-20T08:00:00Z");
  const saved = await new ChatHistoryUseCases().append({ conversationId: null, projectId: PROJECT, userId: USER, question: "Why did billing split?", askedAt, answer });
  assert.deepEqual(saved, { id: ID, title: "Why did billing split?" });
  assert.equal(created.projectId, PROJECT);
  assert.equal(created.userId, USER);
  assert.equal(created.messageCount, 2);
  assert.deepEqual(created.messages.map(m => m.role), ["user", "assistant"]);
  assert.equal(created.messages[0].createdAt, askedAt);
  assert.deepEqual(created.messages[1].evidence, answer.evidence);
  assert.deepEqual(created.messages[1].model, answer.model);
  assert.deepEqual(created.messages[1].usage, answer.usage);
});

test("continuing a conversation appends two messages, only to this user's conversation in this project, with room left", async t => {
  let seen;
  t.mock.method(ChatConversationModel, "findOneAndUpdate", (filter, update) => { seen = { filter, update }; return query({ _id: ID, title: "First question" }); });
  const saved = await new ChatHistoryUseCases().append({ conversationId: ID, projectId: PROJECT, userId: USER, question: "And then?", askedAt: new Date(), answer });
  assert.deepEqual(saved, { id: ID, title: "First question" });
  assert.deepEqual(seen.filter, { _id: ID, projectId: PROJECT, userId: USER, messageCount: { $lte: MAX_STORED_MESSAGES - 2 } });
  assert.equal(seen.update.$push.messages.$each.length, 2);
  assert.deepEqual(seen.update.$inc, { messageCount: 2 });
});

test("appending to a conversation that is gone, someone else's, or full is refused", async t => {
  t.mock.method(ChatConversationModel, "findOneAndUpdate", () => query(null));
  await rejects(new ChatHistoryUseCases().append({ conversationId: ID, projectId: PROJECT, userId: USER, question: "q", askedAt: new Date(), answer }), 404);
});

test("assertCanAppend: unknown conversation is 404, a full one is 400, one with room passes", async t => {
  const use = new ChatHistoryUseCases();
  let row = null;
  let filter;
  t.mock.method(ChatConversationModel, "findOne", f => { filter = f; return query(row); });
  await rejects(use.assertCanAppend(ID, PROJECT, USER), 404);
  assert.deepEqual(filter, { _id: ID, projectId: PROJECT, userId: USER });
  row = { messageCount: MAX_STORED_MESSAGES - 1 };
  await rejects(use.assertCanAppend(ID, PROJECT, USER), 400);
  row = { messageCount: MAX_STORED_MESSAGES - 2 };
  await use.assertCanAppend(ID, PROJECT, USER);
});

test("the list only asks for this user's conversations in this project and maps what it finds", async t => {
  let seen;
  const rows = [{ _id: ID, title: "A", messageCount: 4, createdAt: new Date(1), updatedAt: new Date(2) }];
  t.mock.method(ChatConversationModel, "find", f => { seen = f; return query(rows); });
  const list = await new ChatHistoryUseCases().list(PROJECT, USER);
  assert.deepEqual(seen, { projectId: PROJECT, userId: USER });
  assert.deepEqual(list, [{ id: ID, title: "A", messageCount: 4, createdAt: new Date(1), updatedAt: new Date(2) }]);
});

test("reading one conversation is scoped to its owner; a malformed id never reaches the database", async t => {
  let seen;
  const row = { _id: ID, title: "A", createdAt: new Date(1), updatedAt: new Date(2), messageCount: 2, messages: [
    { role: "user", content: "q", createdAt: new Date(1) },
    { role: "assistant", content: "a", evidence: answer.evidence, model: answer.model, createdAt: new Date(2) },
  ] };
  const find = t.mock.method(ChatConversationModel, "findOne", f => { seen = f; return query(seen._id === ID ? row : null); });
  const use = new ChatHistoryUseCases();
  const got = await use.get(PROJECT, USER, ID);
  assert.deepEqual(seen, { _id: ID, projectId: PROJECT, userId: USER });
  assert.equal(got.messages[0].evidence, null);
  assert.equal(got.messages[0].model, null);
  assert.deepEqual(got.messages[1].evidence, answer.evidence);
  await rejects(use.get(PROJECT, USER, OTHER_ID), 404);
  const before = find.mock.callCount();
  await rejects(use.get(PROJECT, USER, "not-an-id"), 404);
  assert.equal(find.mock.callCount(), before);
});

test("deleting is scoped to the owner and reports a missing conversation", async t => {
  let seen;
  let deletedCount = 1;
  t.mock.method(ChatConversationModel, "deleteOne", async f => { seen = f; return { deletedCount }; });
  const use = new ChatHistoryUseCases();
  await use.remove(PROJECT, USER, ID);
  assert.deepEqual(seen, { _id: ID, projectId: PROJECT, userId: USER });
  deletedCount = 0;
  await rejects(use.remove(PROJECT, USER, ID), 404);
  await rejects(use.remove(PROJECT, USER, "nope"), 404);
});

// ── The chat use case saves what it answers ────────────────────────────────────────────────────────────────────────

function chatSetup(t, { historyOverrides = {}, reply = "[FACT] `a1b2c3d` split billing." } = {}) {
  const snapshots = [{ hash: "a1b2c3d", fullHash: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", title: "Split billing", author: "An", date: "2026-03-01T00:00:00Z", files: 12, archChanges: 3, depAdded: 4, depRemoved: 1 }];
  const evidences = [{ commit: "a1b2c3d", changeTitle: "Extract billing", type: "MODULE SPLIT", date: "2026-03-01T00:00:00Z", files: 12, summary: "Billing moved out", depsAdded: 4, depsRemoved: 1, sourceFiles: ["core/Billing.java"] }];
  t.mock.method(SnapshotModel, "find", () => query(snapshots));
  t.mock.method(SnapshotModel, "countDocuments", async () => 1);
  t.mock.method(SnapshotModel, "findOne", () => query(null));
  t.mock.method(EvidenceModel, "find", () => query(evidences));
  t.mock.method(EvidenceModel, "countDocuments", async () => 1);
  const asked = [];
  const client = { info: { provider: "fake", model: "fake-1", host: "llm.example", external: true }, complete: async messages => { asked.push(messages); return reply; } };
  setLlmRuntime({ client, options: {}, capability: { enabled: true, provider: "fake", model: "fake-1", host: "llm.example", external: true } });
  t.after(() => setLlmRuntime(null));
  const appended = [];
  const checked = [];
  const history = {
    assertCanAppend: async (...args) => { checked.push(args); },
    append: async input => { appended.push(input); return { id: ID, title: "Why?" }; },
    ...historyOverrides,
  };
  return { useCase: new ProjectChatUseCase(history), asked, appended, checked };
}
const project = { id: PROJECT, name: "Shop", description: "d", repoUrl: "https://github.com/org/shop.git" };
const ask = (useCase, extra = {}) => useCase.execute({ project, userId: `u-${Math.random()}`, messages: [{ role: "user", content: "Why?" }], ...extra });

test("the chat saves the question and the answer and tells the page where", async t => {
  const { useCase, appended, checked } = chatSetup(t);
  const result = await ask(useCase);
  assert.deepEqual(result.conversation, { id: ID, title: "Why?" });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].conversationId, null);
  assert.equal(appended[0].question, "Why?");
  assert.equal(appended[0].projectId, PROJECT);
  assert.equal(appended[0].answer.content, result.answer);
  assert.deepEqual(appended[0].answer.evidence.commits, ["a1b2c3d"]);
  assert.equal(checked.length, 0);
});

test("the chat continues a given conversation after checking it is the user's", async t => {
  const { useCase, appended, checked } = chatSetup(t);
  await ask(useCase, { conversationId: ID });
  assert.equal(checked.length, 1);
  assert.deepEqual(checked[0].slice(0, 2), [ID, PROJECT]);
  assert.equal(appended[0].conversationId, ID);
});

test("only the newest question is saved, not the history the page resends", async t => {
  const { useCase, appended } = chatSetup(t);
  await ask(useCase, { messages: [{ role: "user", content: "first" }, { role: "assistant", content: "reply" }, { role: "user", content: "second" }] });
  assert.equal(appended[0].question, "second");
});

test("a conversation that is not the user's is refused before the model is asked", async t => {
  const { useCase, asked } = chatSetup(t, { historyOverrides: { assertCanAppend: async () => { throw new AppError(404, "NOT_FOUND", "Conversation not found."); } } });
  await rejects(ask(useCase, { conversationId: ID }), 404);
  assert.equal(asked.length, 0);
});

test("a malformed conversation id is refused before the model is asked", async t => {
  const { useCase, asked } = chatSetup(t);
  await rejects(ask(useCase, { conversationId: "../../x" }), 400);
  assert.equal(asked.length, 0);
});

test("a history that cannot be written does not take the answer away", async t => {
  const { useCase } = chatSetup(t, { historyOverrides: { append: async () => { throw new Error("disk full"); } } });
  t.mock.method(console, "error", () => {});
  const result = await ask(useCase);
  assert.ok(result.answer.includes("split billing"));
  assert.equal(result.conversation, null);
});
