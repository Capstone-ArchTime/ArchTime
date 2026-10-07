import mongoose from "mongoose";
import { LlmModelModel, LLM_PROVIDERS, WITH_SECRET } from "../../../infrastructure/database/models/LlmModelModel.js";
import type { ILlmModel, LlmProvider } from "../../../infrastructure/database/models/LlmModelModel.js";
import { LlmRunModel } from "../../../infrastructure/database/models/LlmRunModel.js";
import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";
import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { ProjectModel } from "../../../infrastructure/database/models/ProjectModel.js";
import { LlmModelRegistry } from "../../../infrastructure/llm/registry.js";
import { getLlmRuntime, refineOptionsFromEnv } from "../../../infrastructure/llm/runtime.js";
import { seal, unseal } from "../../../infrastructure/llm/secrets.js";
import { discoverModels, DiscoveryError } from "../../../infrastructure/llm/discover.js";
import { probeModel } from "../../../infrastructure/services/LlmHealthService.js";
import { LlmRunService } from "../../../infrastructure/services/LlmRunService.js";
import type { LeaderboardQuery } from "../../../infrastructure/services/LlmRunService.js";
import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { AuditService } from "../../../infrastructure/services/AuditService.js";
import { AuditAction } from "../../../domain/entities/AuditLog.js";
import { fileDependencies } from "../../../domain/architecture/buildView.js";
import type { SnapshotGraph } from "../../../domain/architecture/buildView.js";
import { DEFAULT_REFINE_OPTIONS } from "../../../domain/architecture/llm/types.js";
import { modeFor, runCost } from "../../../domain/architecture/llm/metrics.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors/AppError.js";
import { loadOwnedProject } from "../projects/loadOwnedProject.js";

type Body = Record<string, unknown>;
const asBody = (body: unknown): Body => (body && typeof body === "object" && !Array.isArray(body) ? body as Body : {});
const objectId = (value: unknown, what: string) => {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) throw new BadRequestError(`Invalid ${what}`);
  return value;
};

/** Typical size of an architecture request per 100 files, used to estimate the price of a run before it starts. */
const TYPICAL_TOKENS_PER_100_FILES = { input: 6_000, output: 2_500 };

// ────────────────────────────────────────────────────────────
// Users
// ────────────────────────────────────────────────────────────

export class UserLlmUseCases {
  /**
   * The models a user may pick for drawing an architecture, with the recommended one for the snapshot's size.
   * Without registered models, the server's configured model is offered as the only (default) choice.
   */
  async listModels(userId: string, query: { projectId?: unknown; snapshotId?: unknown }) {
    const settings = await SystemSettingsModel.findOne().lean();
    let files: number | null = null;
    if (query.projectId) {
      const projectId = objectId(query.projectId, "project ID");
      await loadOwnedProject(projectId, userId);
      const filter = query.snapshotId ? { _id: objectId(query.snapshotId, "snapshot ID"), projectId } : { projectId };
      const snapshot = await SnapshotModel.findOne(filter).sort({ date: -1 }).select({ nodes: 1, edges: 1 }).lean();
      if (snapshot) files = fileDependencies({ nodes: (snapshot.nodes ?? []) as SnapshotGraph["nodes"], edges: (snapshot.edges ?? []) as SnapshotGraph["edges"] }).files.length;
    }
    const maxRefineFiles = refineOptionsFromEnv().maxRefineFiles ?? DEFAULT_REFINE_OPTIONS.maxRefineFiles;
    const mode = files === null ? undefined : modeFor(files, maxRefineFiles);
    const [rows, defaultRow, board] = await Promise.all([
      LlmModelModel.find({ enabled: true, visibleToUsers: true }).sort({ displayName: 1 }).lean(),
      LlmModelRegistry.defaultRow(),
      LlmRunService.leaderboard({ mode, purpose: "all" }),
    ]);
    const scores = new Map(board.rows.filter(r => r.modelId).map(r => [r.modelId as string, r]));
    const estimate = (row: ILlmModel) => {
      if (files === null) return null;
      const factor = Math.max(1, mode === "refine" ? files : Math.min(files, 25 * 15)) / 100;
      const usage = { inputTokens: Math.round(TYPICAL_TOKENS_PER_100_FILES.input * factor), outputTokens: Math.round(TYPICAL_TOKENS_PER_100_FILES.output * factor), cacheReadTokens: 0 };
      const measured = scores.get(String((row as any)._id))?.stats;
      const tokens = measured && measured.n > 0 && measured.tokensPer100 > 0 ? Math.round(measured.tokensPer100 * factor) : usage.inputTokens + usage.outputTokens;
      return { tokens, cost: runCost(usage, row.pricing), basedOnRuns: measured?.n ?? 0 };
    };
    const models = rows.map(row => {
      const id = String((row as any)._id);
      const score = scores.get(id);
      return {
        id, key: row.key, displayName: row.displayName, provider: row.provider, model: row.model,
        ...LlmModelRegistry.describe(row), pricing: row.pricing, health: row.health?.status ?? "unknown",
        isDefault: defaultRow ? String((defaultRow as any)._id) === id : false,
        recommended: score?.recommended ?? false,
        score: score && score.stats.n > 0 ? { value: score.score, confident: score.confident, runs: score.stats.n, successRate: score.stats.successRate, quality: score.components.quality } : null,
        estimate: estimate(row),
      };
    });
    const env = getLlmRuntime().capability;
    return {
      models,
      defaultModelId: defaultRow ? String((defaultRow as any)._id) : null,
      recommendedModelId: models.some(m => m.recommended) ? board.recommendedModelId : null,
      allowUserModelChoice: settings?.allowUserModelChoice !== false,
      mode: mode ?? null,
      files,
      // Shown when no model is registered: what "default" means on this server.
      serverDefault: models.length === 0 && !defaultRow ? env : null,
    };
  }

  async myRuns(userId: string, query: { projectId?: unknown; page?: unknown; limit?: unknown }) {
    const projectId = query.projectId ? objectId(query.projectId, "project ID") : undefined;
    return LlmRunService.listForUser(userId, { projectId, page: Number(query.page) || 1, limit: Number(query.limit) || 20 });
  }

  async feedback(userId: string, runId: string, body: unknown) {
    const rating = asBody(body).rating;
    if (rating !== 0 && rating !== 1) throw new BadRequestError("rating must be 1 (useful) or 0 (not useful)");
    return LlmRunService.setFeedback(runId, userId, rating);
  }
}

// ────────────────────────────────────────────────────────────
// Administrators
// ────────────────────────────────────────────────────────────

const slug = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");

function number(value: unknown, field: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new BadRequestError(`${field} must be a number from ${min} to ${max}.`);
  return n;
}

/** Validates the editable fields of a model; `partial` for updates. Returns a $set patch. */
function modelPatch(input: Body, partial: boolean): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  const has = (k: string) => input[k] !== undefined;
  const text = (k: string, max: number) => {
    const v = input[k];
    if (typeof v !== "string" || !v.trim() || v.trim().length > max) throw new BadRequestError(`${k} is required (at most ${max} characters).`);
    return v.trim();
  };
  if (!partial || has("displayName")) set.displayName = text("displayName", 80);
  if (!partial || has("provider")) {
    if (!LLM_PROVIDERS.includes(input.provider as LlmProvider)) throw new BadRequestError(`provider must be one of: ${LLM_PROVIDERS.join(", ")}.`);
    set.provider = input.provider;
  }
  if (!partial || has("model")) set.model = text("model", 120);
  if (has("key")) {
    const key = slug(String(input.key));
    if (!key) throw new BadRequestError("key must contain letters or digits.");
    set.key = key;
  }
  if (has("baseUrl")) {
    const url = input.baseUrl;
    if (url === null || url === "") set.baseUrl = undefined;
    else {
      try { const u = new URL(String(url)); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { throw new BadRequestError("baseUrl must be an http(s) URL."); }
      set.baseUrl = String(url).trim();
    }
  }
  if (has("apiKey")) {
    const key = input.apiKey;
    if (key === null || key === "") set.apiKey = null;
    else if (typeof key === "string" && key.trim().length >= 8 && key.length <= 500) set.apiKey = seal(key.trim());
    else throw new BadRequestError("apiKey must be a string of at least 8 characters, or null to remove it.");
  }
  if (has("pricing")) {
    const p = asBody(input.pricing);
    set.pricing = {
      inputPerMTok: number(p.inputPerMTok ?? 0, "pricing.inputPerMTok", { max: 10_000 }),
      outputPerMTok: number(p.outputPerMTok ?? 0, "pricing.outputPerMTok", { max: 10_000 }),
      ...(p.cacheReadPerMTok !== undefined && p.cacheReadPerMTok !== null && p.cacheReadPerMTok !== "" ? { cacheReadPerMTok: number(p.cacheReadPerMTok, "pricing.cacheReadPerMTok", { max: 10_000 }) } : {}),
      currency: "USD",
    };
  }
  if (has("options")) {
    const o = asBody(input.options);
    const options: Record<string, unknown> = {};
    if (o.effort !== undefined && o.effort !== null && o.effort !== "") {
      if (!["low", "medium", "high"].includes(String(o.effort))) throw new BadRequestError("options.effort must be low, medium or high.");
      options.effort = o.effort;
    }
    if (o.maxTokens !== undefined && o.maxTokens !== null && o.maxTokens !== "") options.maxTokens = Math.round(number(o.maxTokens, "options.maxTokens", { min: 256, max: 64_000 }));
    if (o.timeoutMs !== undefined && o.timeoutMs !== null && o.timeoutMs !== "") options.timeoutMs = Math.round(number(o.timeoutMs, "options.timeoutMs", { min: 5_000, max: 900_000 }));
    if (o.temperature !== undefined && o.temperature !== "") options.temperature = o.temperature === null ? null : number(o.temperature, "options.temperature", { max: 2 });
    if (o.jsonMode !== undefined) options.jsonMode = Boolean(o.jsonMode);
    set.options = options;
  }
  for (const flag of ["enabled", "visibleToUsers"] as const) {
    if (has(flag)) {
      if (typeof input[flag] !== "boolean") throw new BadRequestError(`${flag} must be true or false.`);
      set[flag] = input[flag];
    }
  }
  return set;
}

const present = (doc: { toJSON?: () => unknown } | Record<string, unknown>) =>
  (typeof (doc as { toJSON?: unknown }).toJSON === "function" ? (doc as { toJSON: () => unknown }).toJSON() : doc) as Record<string, unknown>;

export class AdminLlmUseCases {
  async list() {
    const [rows, settings, usage] = await Promise.all([
      LlmModelModel.find().sort({ createdAt: 1 }),
      SystemSettingsModel.findOne().lean(),
      LlmRunModel.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } } },
        { $group: { _id: "$modelId", runs: { $sum: 1 }, totalTokens: { $sum: "$usage.totalTokens" }, cost: { $sum: "$cost.amount" }, lastRunAt: { $max: "$createdAt" } } },
      ]),
    ]);
    const byModel = new Map(usage.map(u => [String(u._id), u]));
    return {
      models: rows.map(r => {
        const u = byModel.get(String(r._id));
        return { ...present(r), ...LlmModelRegistry.describe(r), usage30d: { runs: u?.runs ?? 0, totalTokens: u?.totalTokens ?? 0, cost: u?.cost ?? 0, lastRunAt: u?.lastRunAt ?? null } };
      }),
      defaultModelId: settings?.defaultModelId ?? rows.find(r => r.isDefault)?.id ?? null,
      allowUserModelChoice: settings?.allowUserModelChoice !== false,
      scoring: settings?.scoring ?? { preset: "balanced", windowDays: 30 },
      serverConfig: getLlmRuntime().capability,
    };
  }

  async create(body: unknown, adminId: string) {
    const input = asBody(body);
    const set = modelPatch(input, false);
    // Adding several models from one provider: reuse the key already stored for another model instead of sending it again.
    if (set.apiKey === undefined && typeof input.apiKeyFrom === "string" && input.apiKeyFrom) {
      const source = await LlmModelModel.findById(objectId(input.apiKeyFrom, "model ID to copy the key from")).select(WITH_SECRET).lean();
      if (!source?.apiKey?.ciphertext) throw new BadRequestError("The model to copy the API key from has no key.");
      set.apiKey = source.apiKey;
    }
    set.key = (set.key as string | undefined) ?? slug(`${set.provider}-${set.model}`);
    if (await LlmModelModel.exists({ key: set.key })) throw new ConflictError(`A model with key "${set.key}" already exists.`);
    const first = (await LlmModelModel.estimatedDocumentCount()) === 0;
    const doc = await LlmModelModel.create({ ...set, createdBy: adminId, updatedBy: adminId, isDefault: false });
    if (first || input.isDefault === true) await this.setDefault(doc.id, adminId, { audit: false });
    await AuditService.log({ action: AuditAction.LLM_MODEL_CREATE, userId: adminId, targetType: "llm_model", targetId: doc.id, details: { key: set.key, provider: set.provider, model: set.model } });
    return present(await LlmModelModel.findById(doc.id) ?? doc);
  }

  async update(id: string, body: unknown, adminId: string) {
    objectId(id, "model ID");
    const set = modelPatch(asBody(body), true);
    if (set.key && await LlmModelModel.exists({ key: set.key, _id: { $ne: id } })) throw new ConflictError(`A model with key "${set.key}" already exists.`);
    const unset: Record<string, 1> = {};
    if ("baseUrl" in set && set.baseUrl === undefined) { delete set.baseUrl; unset.baseUrl = 1; }
    const doc = await LlmModelModel.findByIdAndUpdate(id, { $set: { ...set, updatedBy: adminId }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true, runValidators: true });
    if (!doc) throw new NotFoundError("Model not found");
    // The default must stay usable: turning it off clears the choice (the server's configured model takes over).
    if (doc.isDefault && doc.enabled === false) await this.clearDefault();
    LlmModelRegistry.invalidate(id);
    const changed = Object.keys(set).map(k => (k === "apiKey" ? "apiKey(replaced)" : k));
    await AuditService.log({ action: AuditAction.LLM_MODEL_UPDATE, userId: adminId, targetType: "llm_model", targetId: id, details: { changed } });
    return present(doc);
  }

  /** Models with recorded runs are turned off and hidden instead of deleted, so their history keeps its name. */
  async remove(id: string, adminId: string) {
    objectId(id, "model ID");
    const doc = await LlmModelModel.findById(id);
    if (!doc) throw new NotFoundError("Model not found");
    const used = await LlmRunModel.exists({ modelId: id });
    if (doc.isDefault) await this.clearDefault();
    if (used) {
      doc.enabled = false;
      doc.visibleToUsers = false;
      doc.isDefault = false;
      doc.updatedBy = adminId;
      await doc.save();
    } else {
      await doc.deleteOne();
    }
    LlmModelRegistry.invalidate(id);
    await AuditService.log({ action: AuditAction.LLM_MODEL_DELETE, userId: adminId, targetType: "llm_model", targetId: id, details: { key: doc.key, archived: Boolean(used) } });
    return { deleted: !used, archived: Boolean(used) };
  }

  async setDefault(id: string, adminId: string, { audit = true } = {}) {
    objectId(id, "model ID");
    const doc = await LlmModelModel.findById(id);
    if (!doc) throw new NotFoundError("Model not found");
    if (!doc.enabled) throw new BadRequestError("Turn the model on before making it the default.");
    await LlmModelModel.updateMany({ _id: { $ne: id }, isDefault: true }, { $set: { isDefault: false } });
    doc.isDefault = true;
    await doc.save();
    await SystemSettingsModel.findOneAndUpdate({}, { $set: { defaultModelId: id, updatedBy: adminId } }, { upsert: true, setDefaultsOnInsert: true });
    if (audit) await AuditService.log({ action: AuditAction.LLM_MODEL_UPDATE, userId: adminId, targetType: "llm_model", targetId: id, details: { changed: ["isDefault"] } });
    return present(doc);
  }

  private async clearDefault() {
    await LlmModelModel.updateMany({ isDefault: true }, { $set: { isDefault: false } });
    await SystemSettingsModel.updateOne({}, { $set: { defaultModelId: null } });
  }

  /**
   * Lists the models a provider offers for a key: chat models first, the rest marked with why they cannot draw
   * architectures, free ones flagged. The key is used for this request only; `fromModelId` reuses a stored key.
   */
  async discover(body: unknown) {
    const input = asBody(body);
    if (!LLM_PROVIDERS.includes(input.provider as LlmProvider)) throw new BadRequestError(`provider must be one of: ${LLM_PROVIDERS.join(", ")}.`);
    const provider = input.provider as LlmProvider;
    let baseUrl: string | undefined;
    if (typeof input.baseUrl === "string" && input.baseUrl.trim()) {
      try { const u = new URL(input.baseUrl.trim()); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { throw new BadRequestError("baseUrl must be an http(s) URL."); }
      baseUrl = input.baseUrl.trim();
    }
    let apiKey = typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : undefined;
    if (!apiKey && typeof input.fromModelId === "string" && input.fromModelId) {
      const source = await LlmModelModel.findById(objectId(input.fromModelId, "model ID")).select(WITH_SECRET).lean();
      if (!source) throw new NotFoundError("Model not found");
      if (source.apiKey?.ciphertext) apiKey = unseal(source.apiKey as { ciphertext: string; iv: string; tag: string });
    }
    let models;
    try {
      models = await discoverModels({ provider, baseUrl, apiKey });
    } catch (error) {
      if (error instanceof DiscoveryError) throw new BadRequestError(error.message);
      throw error;
    }
    const registered = await LlmModelModel.find({ provider, ...(baseUrl ? { baseUrl } : {}) }, { model: 1 }).lean();
    const have = new Set(registered.map(r => r.model));
    return { models: models.map(m => ({ ...m, registered: have.has(m.id) })) };
  }

  /** Sends a tiny request to the model and stores the outcome as its health. */
  async test(id: string, adminId: string) {
    objectId(id, "model ID");
    const row = await LlmModelModel.findById(id).select(WITH_SECRET).lean();
    if (!row) throw new NotFoundError("Model not found");
    let result;
    try {
      result = await probeModel(LlmModelRegistry.clientForRow(row as any));
    } catch (error) {
      result = { status: "down" as const, latencyMs: 0, usage: null, error: error instanceof Error ? error.message : "Misconfigured" };
    }
    const health = { status: result.status, checkedAt: new Date(), latencyMs: result.latencyMs, ...(result.error ? { lastError: result.error } : {}) };
    // Replaces the whole object, so an earlier error does not linger after a successful check.
    await LlmModelModel.updateOne({ _id: id }, { $set: { health } });
    await AuditService.log({ action: AuditAction.LLM_MODEL_TEST, userId: adminId, targetType: "llm_model", targetId: id, details: { status: result.status, latencyMs: result.latencyMs } });
    return { ...result, checkedAt: health.checkedAt };
  }

  /** Probes every enabled model; used by the "check all" button. */
  async testAll(adminId: string) {
    const rows = await LlmModelModel.find({ enabled: true }, { _id: 1 }).lean();
    const results = [];
    for (const r of rows) results.push({ id: String(r._id), ...(await this.test(String(r._id), adminId)) });
    return { results };
  }

  async usage(query: Body) {
    const date = (v: unknown, end = false) => {
      if (typeof v !== "string" || !v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BadRequestError("from/to must be dates (YYYY-MM-DD).");
      if (end && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setUTCHours(23, 59, 59, 999);
      return d;
    };
    const groupBy = query.groupBy === "model" || query.groupBy === "user" ? query.groupBy : "day";
    return LlmRunService.usage({
      from: date(query.from) ?? new Date(Date.now() - 30 * 86_400_000), to: date(query.to, true),
      modelId: typeof query.modelId === "string" && query.modelId ? query.modelId : undefined,
      userId: typeof query.userId === "string" && query.userId ? query.userId : undefined,
      groupBy,
    });
  }

  async leaderboard(query: Body) {
    const q: LeaderboardQuery = {};
    if (query.mode === "refine" || query.mode === "name-only") q.mode = query.mode;
    if (query.purpose === "user" || query.purpose === "benchmark" || query.purpose === "all") q.purpose = query.purpose;
    if (["balanced", "quality", "budget", "custom"].includes(String(query.preset))) q.preset = query.preset as LeaderboardQuery["preset"];
    if (query.windowDays !== undefined && query.windowDays !== "") q.windowDays = Math.round(number(query.windowDays, "windowDays", { min: 1, max: 365 }));
    if (typeof query.benchmarkId === "string" && query.benchmarkId) q.benchmarkId = query.benchmarkId;
    return LlmRunService.leaderboard(q);
  }

  /** Projects with their recent snapshots, to pick what a benchmark runs on. */
  async benchmarkTargets() {
    const projects = await ProjectModel.find({}, { name: 1 }).sort({ updatedAt: -1 }).limit(100).lean();
    const snapshots = await SnapshotModel.aggregate([
      { $match: { projectId: { $in: projects.map(p => String(p._id)) } } },
      { $sort: { date: -1 } },
      { $group: { _id: "$projectId", snapshots: { $push: { id: { $toString: "$_id" }, hash: "$hash", title: "$title", date: "$date", files: { $size: { $ifNull: ["$nodes", []] } } } } } },
      { $project: { snapshots: { $slice: ["$snapshots", 15] } } },
    ]);
    const byProject = new Map(snapshots.map(s => [String(s._id), s.snapshots]));
    return { projects: projects.map(p => ({ id: String(p._id), name: (p as any).name, snapshots: byProject.get(String(p._id)) ?? [] })).filter(p => p.snapshots.length) };
  }

  async startBenchmark(body: unknown, adminId: string) {
    const input = asBody(body);
    const projectId = objectId(input.projectId, "project ID");
    const snapshotId = objectId(input.snapshotId, "snapshot ID");
    const ids = Array.isArray(input.modelIds) ? [...new Set(input.modelIds.map(String))] : [];
    if (ids.length < 2 || ids.length > 8) throw new BadRequestError("Pick between 2 and 8 models to compare.");
    ids.forEach(id => objectId(id, "model ID"));
    const models = await LlmModelModel.find({ _id: { $in: ids } }, { enabled: 1, displayName: 1 }).lean();
    if (models.length !== ids.length) throw new NotFoundError("One of the models was not found");
    const off = models.filter(m => !m.enabled);
    if (off.length) throw new BadRequestError(`Turn on ${off.map(m => m.displayName).join(", ")} first.`);
    if (!await SnapshotModel.exists({ _id: snapshotId, projectId })) throw new NotFoundError("Snapshot not found in this project");
    const benchmarkId = new mongoose.Types.ObjectId().toString();
    const jobId = await MiningService.startBenchmarkJob(projectId, adminId, snapshotId, ids, benchmarkId);
    await AuditService.log({ action: AuditAction.LLM_BENCHMARK_START, userId: adminId, targetType: "project", targetId: projectId, details: { snapshotId, modelIds: ids, benchmarkId, jobId } });
    return { jobId, benchmarkId };
  }

  /** Past benchmarks, newest first. */
  async benchmarks() {
    const rows = await LlmRunModel.aggregate([
      { $match: { purpose: "benchmark", benchmarkId: { $exists: true } } },
      { $group: { _id: "$benchmarkId", projectId: { $first: "$projectId" }, snapshotId: { $first: "$snapshotId" }, startedAt: { $min: "$createdAt" }, runs: { $sum: 1 }, models: { $addToSet: "$model" }, jobId: { $first: "$jobId" } } },
      { $sort: { startedAt: -1 } },
      { $limit: 50 },
    ]);
    const projects = await ProjectModel.find({ _id: { $in: rows.map(r => r.projectId).filter(id => mongoose.isValidObjectId(id)) } }, { name: 1 }).lean();
    const names = new Map(projects.map(p => [String(p._id), (p as any).name]));
    return { benchmarks: rows.map(r => ({ id: r._id, projectId: r.projectId, projectName: names.get(String(r.projectId)) ?? null, snapshotId: r.snapshotId, startedAt: r.startedAt, runs: r.runs, models: r.models, jobId: r.jobId })) };
  }

  async benchmark(benchmarkId: string) {
    const runs = await LlmRunModel.find({ benchmarkId }).sort({ createdAt: 1 }).lean();
    if (!runs.length) throw new NotFoundError("Benchmark not found");
    const board = await LlmRunService.leaderboard({ benchmarkId, purpose: "benchmark" });
    return {
      id: benchmarkId, projectId: runs[0].projectId, snapshotId: runs[0].snapshotId,
      runs: runs.map(r => ({ id: String(r._id), modelId: r.modelId, model: r.model, provider: r.provider, status: r.status, usage: r.usage, latencyMs: r.latencyMs, cost: r.cost, quality: r.quality, fallbackReason: r.fallbackReason, createdAt: r.createdAt })),
      leaderboard: { ...board, rows: board.rows.filter(r => r.stats.n > 0) },
    };
  }
}
