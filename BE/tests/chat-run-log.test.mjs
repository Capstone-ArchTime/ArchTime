import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { LlmRunModel } from "../src/infrastructure/database/models/LlmRunModel.ts";
import { LlmModelModel } from "../src/infrastructure/database/models/LlmModelModel.ts";
import { SystemSettingsModel } from "../src/infrastructure/database/models/SystemSettingsModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { EvidenceModel } from "../src/infrastructure/database/models/EvidenceModel.ts";
import { setLlmRuntime } from "../src/infrastructure/llm/runtime.ts";
import { buildChatRun, LlmRunService } from "../src/infrastructure/services/LlmRunService.ts";
import { ProjectChatUseCase, RUN_LOG_WAIT_MS } from "../src/application/use-cases/llm/ProjectChatUseCase.ts";
import { LlmError } from "../src/domain/architecture/llm/types.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

const PROJECT = "66f000000000000000000001";
const CONVERSATION = "64b7f0c2a1b2c3d4e5f60718";
const client = { info: { provider: "openai-compatible", model: "gpt-test", host: "llm.example", external: true } };
const model = { modelId: "64b7f0c2a1b2c3d4e5f60999", modelKey: "openai-gpt-test", client, pricing: { inputPerMTok: 2, outputPerMTok: 8, currency: "USD" } };
const usage = { inputTokens: 1000, outputTokens: 250, cacheReadTokens: 0, reasoningTokens: 0, estimated: false };
const base = { projectId: PROJECT, userId: "user-1", model, status: "accepted", usage, latencyMs: 4200, wallMs: 4300 };

/** Chainable stand-in for a Mongoose query. */
const query = value => { const q = { sort: () => q, skip: () => q, limit: () => q, populate: () => q, select: () => q, lean: () => Promise.resolve(value) }; return q; };

// ── The record ────────────────────────────────────────────────────────────────────────────────────────────────────

test("a mentor question is recorded as a chat run: who, which workspace, which model, tokens and cost", () => {
  const run = buildChatRun({ ...base, conversationId: CONVERSATION });
  assert.equal(run.mode, "chat");
  assert.equal(run.purpose, "user");
  assert.equal(run.status, "accepted");
  assert.equal(run.projectId, PROJECT);
  assert.equal(run.userId, "user-1");
  assert.equal(run.conversationId, CONVERSATION);
  assert.equal(run.modelId, model.modelId);
  assert.equal(run.modelKey, "openai-gpt-test");
  assert.equal(run.provider, "openai-compatible");
  assert.equal(run.model, "gpt-test");
  assert.equal(run.filesSent, 0);
  assert.deepEqual(run.usage, { inputTokens: 1000, outputTokens: 250, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 1250, estimated: false });
  assert.equal(run.latencyMs, 4200);
  assert.equal(run.wallMs, 4300);
});

test("the cost is worked out from the model's price, and the price is kept with it", () => {
  const run = buildChatRun(base);
  assert.equal(run.cost.amount, (1000 * 2 + 250 * 8) / 1e6);
  assert.equal(run.cost.currency, "USD");
  assert.deepEqual(run.cost.pricing, { inputPerMTok: 2, outputPerMTok: 8 });
});

test("cached input is charged at the cache price when the model has one", () => {
  const run = buildChatRun({ ...base, usage: { ...usage, cacheReadTokens: 600 }, model: { ...model, pricing: { inputPerMTok: 2, outputPerMTok: 8, cacheReadPerMTok: 0.5, currency: "USD" } } });
  assert.equal(run.cost.amount, (400 * 2 + 600 * 0.5 + 250 * 8) / 1e6);
});

test("a model without a price costs nothing and still counts as a run", () => {
  const run = buildChatRun({ ...base, model: { ...model, pricing: null } });
  assert.equal(run.cost.amount, 0);
  assert.equal(run.cost.currency, "USD");
  assert.equal("pricing" in run.cost, false);
  assert.equal(run.usage.totalTokens, 1250);
});

test("a question the provider could not answer is recorded as failed, with why and the time it took", () => {
  const run = buildChatRun({ ...base, status: "failed", errorKind: "billing", usage: null, latencyMs: 900, wallMs: 900 });
  assert.equal(run.status, "failed");
  assert.equal(run.errorKind, "billing");
  assert.deepEqual(run.usage, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 0, estimated: false });
  assert.equal(run.cost.amount, 0);
  assert.deepEqual(run.attempts, [{ n: 1, ok: false, issueCodes: [], inputTokens: 0, outputTokens: 0, latencyMs: 900, errorKind: "billing" }]);
});

test("an answer rejected after the provider charged for it still carries its tokens and cost", () => {
  const run = buildChatRun({ ...base, status: "failed", errorKind: "truncated" });
  assert.equal(run.usage.totalTokens, 1250);
  assert.ok(run.cost.amount > 0);
});

test("an accepted run has no error kind even if one is passed", () => {
  const run = buildChatRun({ ...base, errorKind: "network" });
  assert.equal("errorKind" in run, false);
  assert.equal("errorKind" in run.attempts[0], false);
  assert.equal(run.attempts[0].ok, true);
});

test("the run keeps no question or answer text and no quality score", () => {
  const run = buildChatRun({ ...base, conversationId: CONVERSATION });
  assert.deepEqual(Object.keys(run).filter(key => /question|answer|content|message|text|prompt/i.test(key)), []);
  assert.equal("quality" in run, false);
});

test("without a saved conversation the run simply has none", () => {
  assert.equal("conversationId" in buildChatRun(base), false);
  assert.equal("conversationId" in buildChatRun({ ...base, conversationId: null }), false);
});

test("the database schema accepts a chat run, with and without quality, and rejects an unknown mode", () => {
  assert.equal(new LlmRunModel(buildChatRun({ ...base, conversationId: CONVERSATION })).validateSync(), undefined);
  assert.equal(new LlmRunModel(buildChatRun({ ...base, status: "failed", errorKind: "timeout", usage: null })).validateSync(), undefined);
  assert.ok(new LlmRunModel({ ...buildChatRun(base), mode: "gossip" }).validateSync());
});

// ── Recording never breaks what it accounts for ───────────────────────────────────────────────────────────────────

test("recordChat stores the run and returns its id and cost", async t => {
  let stored;
  t.mock.method(LlmRunModel, "create", async run => { stored = run; return { _id: "run-1" }; });
  const saved = await LlmRunService.recordChat({ ...base, conversationId: CONVERSATION });
  assert.deepEqual(saved, { id: "run-1", cost: { amount: 0.004, currency: "USD" } });
  assert.equal(stored.mode, "chat");
});

test("recordChat swallows a database failure and says so with null", async t => {
  t.mock.method(LlmRunModel, "create", async () => { throw new Error("database is down"); });
  t.mock.method(console, "warn", () => {});
  assert.equal(await LlmRunService.recordChat(base), null);
});

// ── Chat runs are accounted for, not scored ───────────────────────────────────────────────────────────────────────

function stubLeaderboard(t) {
  const seen = {};
  t.mock.method(SystemSettingsModel, "findOne", () => query(null));
  t.mock.method(LlmModelModel, "find", () => query([]));
  t.mock.method(LlmRunModel, "find", filter => { seen.filter = filter; return query([]); });
  return seen;
}

test("the model leaderboard never includes chat runs, which have no quality to score", async t => {
  const seen = stubLeaderboard(t);
  await LlmRunService.leaderboard({});
  assert.deepEqual(seen.filter.mode, { $in: ["refine", "name-only"] });
});

test("asking the leaderboard for one mode still gets exactly that mode", async t => {
  const seen = stubLeaderboard(t);
  await LlmRunService.leaderboard({ mode: "name-only" });
  assert.equal(seen.filter.mode, "name-only");
});

test("a user's AI usage lists chat runs with no quality and a link to the conversation, and counts their tokens", async t => {
  const refine = { _id: "r1", projectId: { _id: PROJECT, name: "Shop" }, mode: "refine", purpose: "user", status: "accepted", usage: {}, cost: {}, quality: { score: 0.9 }, attempts: [], createdAt: new Date() };
  const chat = { _id: "r2", projectId: { _id: PROJECT, name: "Shop" }, mode: "chat", purpose: "user", status: "accepted", conversationId: CONVERSATION, usage: {}, cost: {}, quality: {}, attempts: [], createdAt: new Date() };
  let filter;
  t.mock.method(LlmRunModel, "find", f => { filter = f; return query([chat, refine]); });
  t.mock.method(LlmRunModel, "countDocuments", async () => 2);
  t.mock.method(LlmRunModel, "aggregate", async () => [{ runs: 2, inputTokens: 3000, outputTokens: 500, totalTokens: 3500, cost: 0.01 }]);
  const page = await LlmRunService.listForUser("user-1", {});
  assert.deepEqual(filter, { userId: "user-1", purpose: "user" });
  assert.equal(page.runs[0].mode, "chat");
  assert.equal(page.runs[0].quality, null);
  assert.equal(page.runs[0].conversationId, CONVERSATION);
  assert.deepEqual(page.runs[1].quality, { score: 0.9 });
  assert.equal(page.totals.runs, 2);
  assert.equal(page.totals.totalTokens, 3500);
});

// ── The chat use case logs every question that reaches a model ────────────────────────────────────────────────────

const snapshots = [{ hash: "a1b2c3d", fullHash: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", title: "Split billing", author: "An", date: "2026-03-01T00:00:00Z", files: 12, archChanges: 3, depAdded: 4, depRemoved: 1 }];
const evidences = [{ commit: "a1b2c3d", changeTitle: "Extract billing", type: "MODULE SPLIT", date: "2026-03-01T00:00:00Z", files: 12, summary: "Billing moved out", depsAdded: 4, depsRemoved: 1, sourceFiles: ["core/Billing.java"] }];
const project = { id: PROJECT, name: "Shop", description: "d", repoUrl: "https://github.com/org/shop.git" };
let askers = 0;
const ask = (useCase, extra = {}) => useCase.execute({ project, userId: `chat-user-${++askers}`, messages: [{ role: "user", content: "Why?" }], ...extra });

function chatSetup(t, { complete, historyAppend } = {}) {
  t.mock.method(SnapshotModel, "find", () => query(snapshots));
  t.mock.method(SnapshotModel, "countDocuments", async () => 1);
  t.mock.method(SnapshotModel, "findOne", () => query(null));
  t.mock.method(EvidenceModel, "find", () => query(evidences));
  t.mock.method(EvidenceModel, "countDocuments", async () => 1);
  const fake = {
    info: client.info,
    complete: complete ?? (async (_messages, options) => { options.onUsage?.({ inputTokens: 100, outputTokens: 20, estimated: false }, 42); return "[FACT] `a1b2c3d` split billing."; }),
  };
  setLlmRuntime({ client: fake, options: {}, capability: { enabled: true, provider: "openai-compatible", model: "gpt-test", host: "llm.example", external: true } });
  t.after(() => setLlmRuntime(null));
  const logged = [];
  const history = {
    assertCanAppend: async () => {},
    append: historyAppend ?? (async () => ({ id: CONVERSATION, title: "Why?" })),
  };
  const useCase = new ProjectChatUseCase(history, { record: async input => { logged.push(input); } });
  return { useCase, logged };
}

test("an answered question is logged once, with the model's tokens, its time and the conversation it went into", async t => {
  const { useCase, logged } = chatSetup(t);
  const result = await ask(useCase);
  assert.equal(result.conversation.id, CONVERSATION);
  assert.equal(logged.length, 1);
  const run = logged[0];
  assert.equal(run.status, "accepted");
  assert.equal(run.projectId, PROJECT);
  assert.ok(run.userId.startsWith("chat-user-"));
  assert.equal(run.conversationId, CONVERSATION);
  assert.deepEqual(run.usage, { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 120, estimated: false });
  assert.equal(run.latencyMs, 42);
  assert.ok(run.wallMs >= 0);
  assert.equal(run.model.client.info.model, "gpt-test");
  assert.equal("errorKind" in run, false);
});

test("a question that is answered but could not be saved is still logged, against the conversation it asked to continue", async t => {
  const { useCase, logged } = chatSetup(t, { historyAppend: async () => { throw new Error("disk full"); } });
  t.mock.method(console, "error", () => {});
  const result = await ask(useCase, { conversationId: CONVERSATION });
  assert.equal(result.conversation, null);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].status, "accepted");
  assert.equal(logged[0].conversationId, CONVERSATION);
});

test("a question that fails at the provider is logged as failed with the reason, and the user still gets the error", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async () => { throw new LlmError("billing", "no credit left"); } });
  await assert.rejects(ask(useCase, { conversationId: CONVERSATION }), e => e instanceof AppError && e.statusCode === 503);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].status, "failed");
  assert.equal(logged[0].errorKind, "billing");
  assert.equal(logged[0].conversationId, CONVERSATION);
  assert.equal(logged[0].usage, null);
});

test("an error that is not the provider's is logged as kind other", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async () => { throw new Error("socket exploded"); } });
  await assert.rejects(ask(useCase));
  assert.equal(logged[0].status, "failed");
  assert.equal(logged[0].errorKind, "other");
  assert.equal(logged[0].conversationId, null);
});

test("an answer cut off after the provider reported usage keeps those tokens in the failed run", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async (_m, options) => { options.onUsage?.({ inputTokens: 300, outputTokens: 2000, estimated: false }, 9000); throw new LlmError("truncated", "cut off"); } });
  await assert.rejects(ask(useCase));
  assert.equal(logged[0].errorKind, "truncated");
  assert.equal(logged[0].usage.outputTokens, 2000);
  assert.equal(logged[0].latencyMs, 9000);
});

test("a failure with no timing from the provider is logged with the time the call itself took", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async () => { await new Promise(resolve => setTimeout(resolve, 25)); throw new LlmError("timeout", "too slow"); } });
  await assert.rejects(ask(useCase));
  assert.ok(logged[0].latencyMs >= 20, `latency ${logged[0].latencyMs}`);
  assert.equal(logged[0].latencyMs, logged[0].wallMs);
});

test("a run log that fails does not take the answer away", async t => {
  chatSetup(t);
  const useCase = new ProjectChatUseCase({ assertCanAppend: async () => {}, append: async () => ({ id: CONVERSATION, title: "Why?" }) }, { record: async () => { throw new Error("log is down"); } });
  t.mock.method(console, "error", () => {});
  const result = await ask(useCase);
  assert.ok(result.answer.includes("split billing"));
});

test("a run log that fails does not hide the provider's error either", async t => {
  chatSetup(t, { complete: async () => { throw new LlmError("rate_limit", "slow down"); } });
  const useCase = new ProjectChatUseCase({ assertCanAppend: async () => {}, append: async () => ({ id: CONVERSATION, title: "Why?" }) }, { record: async () => { throw new Error("log is down"); } });
  t.mock.method(console, "error", () => {});
  await assert.rejects(ask(useCase), e => e instanceof AppError && e.statusCode === 429);
});

test("no run is logged when no model could be asked", async t => {
  t.mock.method(SnapshotModel, "find", () => query(snapshots));
  t.mock.method(SnapshotModel, "countDocuments", async () => 1);
  t.mock.method(SnapshotModel, "findOne", () => query(null));
  t.mock.method(EvidenceModel, "find", () => query(evidences));
  t.mock.method(EvidenceModel, "countDocuments", async () => 1);
  setLlmRuntime({ client: null, options: {}, capability: { enabled: false, provider: null, model: null, host: null, external: false, reason: "AI is not configured" } });
  t.after(() => setLlmRuntime(null));
  const logged = [];
  const useCase = new ProjectChatUseCase({ assertCanAppend: async () => {}, append: async () => null }, { record: async input => { logged.push(input); } });
  await assert.rejects(ask(useCase));
  assert.equal(logged.length, 0);
});

test("a request refused before the model is asked is not logged", async t => {
  const { logged } = chatSetup(t);
  const useCase = new ProjectChatUseCase({ assertCanAppend: async () => { throw new AppError(404, "NOT_FOUND", "Conversation not found."); }, append: async () => null }, { record: async input => { logged.push(input); } });
  await assert.rejects(ask(useCase, { conversationId: CONVERSATION }), e => e.statusCode === 404);
  await assert.rejects(ask(useCase, { conversationId: "../x" }), e => e.statusCode === 400);
  assert.equal(logged.length, 0);
});

// ── Fixes made after the independent review ───────────────────────────────────────────────────────────────────────

const quiet = t => { t.mock.method(console, "warn", () => {}); t.mock.method(console, "error", () => {}); };
const idle = async () => { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); };
const neverLogs = { record: () => new Promise(() => {}) };
const savesTo = { assertCanAppend: async () => {}, append: async () => ({ id: CONVERSATION, title: "Why?" }) };

test("every provider request inside one answer is counted, not only the last", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async (_messages, options) => {
    options.onUsage?.({ inputTokens: 100, outputTokens: 0, estimated: false }, 30); // a request whose answer was thrown away
    options.onUsage?.({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, estimated: true }, 42);
    return "[FACT] `a1b2c3d` split billing.";
  } });
  const result = await ask(useCase);
  assert.deepEqual(result.usage, { inputTokens: 200, outputTokens: 20 });
  assert.equal(logged[0].usage.inputTokens, 200);
  assert.equal(logged[0].usage.outputTokens, 20);
  assert.equal(logged[0].usage.totalTokens, 220);
  assert.equal(logged[0].usage.cacheReadTokens, 50);
  assert.equal(logged[0].usage.estimated, true);
  assert.equal(logged[0].latencyMs, 72);
});

test("a failed answer keeps the tokens and the time of every request that got through", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async (_messages, options) => {
    options.onUsage?.({ inputTokens: 100, outputTokens: 0, estimated: false }, 10);
    options.onUsage?.({ inputTokens: 100, outputTokens: 2000, estimated: false }, 8000);
    throw new LlmError("truncated", "cut off");
  } });
  await assert.rejects(ask(useCase));
  assert.equal(logged[0].usage.inputTokens, 200);
  assert.equal(logged[0].usage.outputTokens, 2000);
  assert.equal(logged[0].latencyMs, 8010);
});

test("a paid answer is logged even if shaping the reply fails afterwards", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async (_messages, options) => { options.onUsage?.({ inputTokens: 100, outputTokens: 20, estimated: false }, 42); return null; } });
  await assert.rejects(ask(useCase), TypeError);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].status, "accepted");
  assert.equal(logged[0].usage.totalTokens, 120);
});

test("the user is not kept waiting for the accounting record beyond a few seconds", { timeout: 5000 }, async t => {
  chatSetup(t);
  quiet(t);
  const useCase = new ProjectChatUseCase(savesTo, neverLogs);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let settled = false;
  const pending = ask(useCase).then(result => { settled = true; return result; });
  await idle();
  assert.equal(settled, false, "it waits for the log at first");
  t.mock.timers.tick(RUN_LOG_WAIT_MS - 1);
  await idle();
  assert.equal(settled, false, "and not yet when one millisecond is left");
  t.mock.timers.tick(1);
  const result = await pending;
  assert.ok(result.answer.includes("split billing"));
});

test("a provider error is not held back by a log that never finishes either", { timeout: 5000 }, async t => {
  chatSetup(t, { complete: async () => { throw new LlmError("rate_limit", "slow down"); } });
  quiet(t);
  const useCase = new ProjectChatUseCase(savesTo, neverLogs);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let outcome = "waiting";
  const pending = ask(useCase).then(() => { outcome = "answered"; }, error => { outcome = error instanceof AppError ? `error ${error.statusCode}` : "other error"; });
  await idle();
  assert.equal(outcome, "waiting");
  t.mock.timers.tick(RUN_LOG_WAIT_MS);
  await pending;
  assert.equal(outcome, "error 429");
});

test("a conversation id typed in capitals is logged in the one spelling the database uses", async t => {
  const { useCase, logged } = chatSetup(t, { complete: async () => { throw new LlmError("timeout", "too slow"); } });
  await assert.rejects(ask(useCase, { conversationId: CONVERSATION.toUpperCase() }));
  assert.equal(logged[0].conversationId, CONVERSATION);
});

test("the admin usage totals keep every run in the ledger and can take chat out of the reliability and speed figures", async t => {
  const pipelines = [];
  t.mock.method(LlmRunModel, "aggregate", async pipeline => { pipelines.push(pipeline); return []; });
  const report = await LlmRunService.usage({ groupBy: "model" });
  assert.equal(pipelines.length, 2, "the totals and the rows");
  for (const pipeline of pipelines) assert.deepEqual(pipeline[0], { $match: {} }, "nothing is filtered out: chat stays in runs, tokens and cost");
  const group = pipelines[0].find(stage => stage.$group).$group;
  assert.deepEqual(group.runs, { $sum: 1 });
  assert.deepEqual(group.chatRuns, { $sum: { $cond: [{ $eq: ["$mode", "chat"] }, 1, 0] } });
  assert.deepEqual(group.chatAccepted, { $sum: { $cond: [{ $and: [{ $eq: ["$mode", "chat"] }, { $eq: ["$status", "accepted"] }] }, 1, 0] } });
  assert.deepEqual(group.drawAvgLatencyMs, { $avg: { $cond: [{ $ne: ["$mode", "chat"] }, "$latencyMs", null] } });
  assert.deepEqual(group.avgLatencyMs, { $avg: "$latencyMs" });
  assert.equal(report.totals.chatRuns, 0);
  assert.equal(report.totals.chatAccepted, 0);
  assert.equal(report.totals.drawAvgLatencyMs, null);
});

test("a question to AI Insights cannot be rated: there is no drawing to judge", async t => {
  let filter;
  t.mock.method(LlmRunModel, "findOneAndUpdate", f => { filter = f; return query(null); });
  const RUN = "64b7f0c2a1b2c3d4e5f60718";
  await assert.rejects(LlmRunService.setFeedback(RUN, "user-1", 1), error => error instanceof AppError && error.statusCode === 404);
  assert.deepEqual(filter, { _id: RUN, userId: "user-1", mode: { $ne: "chat" } });
});
