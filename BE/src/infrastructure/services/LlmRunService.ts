import mongoose from "mongoose";
import type { MappingComponent } from "../../domain/architecture/buildView.js";
import type { ValidationResult } from "../../domain/architecture/types.js";
import type { RefineReceipt } from "../../domain/architecture/llm/types.js";
import { modelStats, modularity, normalizeWeights, runCost, runQuality, SCORE_PRESETS, scoreModels } from "../../domain/architecture/llm/metrics.js";
import type { ModelCandidate, ModelStats, RunSample, RunStatus, ScorePreset, ScoreWeights } from "../../domain/architecture/llm/metrics.js";
import { LlmRunModel } from "../database/models/LlmRunModel.js";
import type { ILlmRun } from "../database/models/LlmRunModel.js";
import { LlmModelModel } from "../database/models/LlmModelModel.js";
import { SystemSettingsModel } from "../database/models/SystemSettingsModel.js";
import type { ResolvedModel } from "../llm/registry.js";
import { NotFoundError } from "../../shared/errors/AppError.js";

export interface RecordRunInput {
  projectId: string;
  snapshotId: string;
  userId?: string;
  jobId?: string;
  purpose: "user" | "benchmark";
  benchmarkId?: string;
  model: Pick<ResolvedModel, "modelId" | "modelKey" | "pricing" | "client">;
  receipt: RefineReceipt;
  files: string[];
  edges: { source: string; target: string }[];
  initial: MappingComponent[];
  components: MappingComponent[];
  validation: ValidationResult;
  maxMoveRatio: number;
  wallMs: number;
}

const groupsOf = (components: MappingComponent[]) => new Map(components.flatMap(c => c.memberIds.map(f => [f, c.id] as [string, string])));

export function statusOf(receipt: RefineReceipt): RunStatus {
  if (receipt.accepted) return "accepted";
  if (receipt.fallbackReason === "cancelled") return "cancelled";
  return "fallback";
}

/** Builds the stored record for a finished refinement: usage, cost and the quality signals (see metrics.ts). */
export function buildRun(input: RecordRunInput): Omit<ILlmRun, "createdAt"> {
  const { receipt } = input;
  const usage = receipt.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 0, estimated: false };
  const attemptsUsed = receipt.attempts.length;
  const errors = input.validation.issues.filter(i => i.severity === "error").length;
  const warnings = input.validation.issues.length - errors;
  const mod = modularity(input.files, input.edges, groupsOf(input.components));
  const baseline = modularity(input.files, input.edges, groupsOf(input.initial));
  const quality = runQuality({
    accepted: receipt.accepted, mode: receipt.mode, attemptsUsed, validation: { errors, warnings },
    modularity: mod, baselineModularity: baseline, roles: input.components.map(c => c.role), movedRatio: receipt.movedRatio, maxMoveRatio: input.maxMoveRatio,
  });
  const lastError = [...receipt.attempts].reverse().find(a => a.errorKind)?.errorKind;
  const status = statusOf(receipt);
  const pricing = input.model.pricing;
  return {
    projectId: input.projectId, snapshotId: input.snapshotId, userId: input.userId ?? "system", jobId: input.jobId,
    modelId: input.model.modelId, modelKey: input.model.modelKey, provider: receipt.provider, model: receipt.model,
    purpose: input.purpose, ...(input.benchmarkId ? { benchmarkId: input.benchmarkId } : {}),
    mode: receipt.mode, filesSent: receipt.filesSent, status,
    // A provider error only counts against the model when it is why the run ended without an answer.
    ...(lastError && status !== "accepted" ? { errorKind: lastError } : {}),
    ...(receipt.fallbackReason ? { fallbackReason: receipt.fallbackReason.slice(0, 500) } : {}),
    attempts: receipt.attempts.map(a => ({
      n: a.n, ok: a.ok, issueCodes: [...new Set(a.issues.map(i => i.code))],
      inputTokens: a.usage?.inputTokens ?? 0, outputTokens: a.usage?.outputTokens ?? 0, latencyMs: a.latencyMs ?? 0, ...(a.errorKind ? { errorKind: a.errorKind } : {}),
    })),
    usage, latencyMs: receipt.latencyMs ?? 0, wallMs: input.wallMs,
    cost: {
      amount: runCost(usage, pricing), currency: pricing?.currency ?? "USD",
      ...(pricing ? { pricing: { inputPerMTok: pricing.inputPerMTok, outputPerMTok: pricing.outputPerMTok, ...(pricing.cacheReadPerMTok !== undefined ? { cacheReadPerMTok: pricing.cacheReadPerMTok } : {}) } } : {}),
    },
    quality: {
      ...quality, errors, warnings, modularity: round(mod), baselineModularity: round(baseline),
      ...(receipt.movedRatio !== undefined ? { movedRatio: receipt.movedRatio } : {}), attemptsUsed, components: input.components.length,
    },
  };
}

const round = (x: number) => Math.round(x * 10_000) / 10_000;
/** A user's verdict, when given, counts for a fifth of the run's quality. */
export const ratedQuality = (score: number, feedback?: { rating?: number } | null) =>
  feedback && (feedback.rating === 0 || feedback.rating === 1) ? 0.8 * score + 0.2 * feedback.rating : score;

const toSample = (r: Pick<ILlmRun, "status" | "errorKind" | "quality" | "filesSent" | "latencyMs" | "usage" | "cost" | "feedback">): RunSample => ({
  status: r.status, errorKind: r.errorKind, attemptsUsed: r.quality?.attemptsUsed ?? 1, filesSent: r.filesSent, quality: ratedQuality(r.quality?.score ?? 0, r.feedback),
  latencyMs: r.latencyMs ?? 0, totalTokens: r.usage?.totalTokens ?? 0, cost: r.cost?.amount ?? 0,
});

export interface LeaderboardQuery { mode?: "refine" | "name-only"; windowDays?: number; purpose?: "user" | "benchmark" | "all"; preset?: ScorePreset | "custom"; benchmarkId?: string }

export class LlmRunService {
  /** Stores the run. Accounting must never break a refinement, so a failure is logged and null returned. */
  static async record(input: RecordRunInput): Promise<{ id: string; cost: { amount: number; currency: string } } | null> {
    try {
      const run = buildRun(input);
      const doc = await LlmRunModel.create(run);
      return { id: String(doc._id ?? (doc as any).id), cost: { amount: run.cost.amount, currency: run.cost.currency } };
    } catch (error) {
      console.warn(`[llm] could not record a run for project ${input.projectId}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  static async listForUser(userId: string, query: { projectId?: string; page?: number; limit?: number }) {
    const filter: Record<string, unknown> = { userId, purpose: "user" };
    if (query.projectId) filter.projectId = query.projectId;
    return this.page(filter, query);
  }

  static async listForProject(projectId: string, query: { page?: number; limit?: number }) {
    return this.page({ projectId, purpose: "user" }, query);
  }

  private static async page(filter: Record<string, unknown>, query: { page?: number; limit?: number }) {
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
    const [runs, total, totals] = await Promise.all([
      LlmRunModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("projectId", "name").lean(),
      LlmRunModel.countDocuments(filter),
      LlmRunModel.aggregate([{ $match: filter }, { $group: {
        _id: null, runs: { $sum: 1 }, inputTokens: { $sum: "$usage.inputTokens" }, outputTokens: { $sum: "$usage.outputTokens" },
        totalTokens: { $sum: "$usage.totalTokens" }, cost: { $sum: "$cost.amount" },
      } }]),
    ]);
    const t = totals[0] ?? { runs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
    return {
      runs: runs.map(present),
      totals: { runs: t.runs, inputTokens: t.inputTokens, outputTokens: t.outputTokens, totalTokens: t.totalTokens, cost: Math.round(t.cost * 1e6) / 1e6 },
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async setFeedback(runId: string, userId: string, rating: 0 | 1) {
    if (!mongoose.isValidObjectId(runId)) throw new NotFoundError("Run not found");
    const run = await LlmRunModel.findOneAndUpdate({ _id: runId, userId }, { $set: { feedback: { rating, at: new Date() } } }, { new: true }).lean();
    if (!run) throw new NotFoundError("Run not found");
    return present(run);
  }

  /** Usage for administrators: totals, and a breakdown by day, model or user. */
  static async usage(query: { from?: Date; to?: Date; modelId?: string; userId?: string; groupBy?: "day" | "model" | "user" }) {
    const match: Record<string, unknown> = {};
    if (query.from || query.to) match.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    if (query.modelId) match.modelId = query.modelId;
    if (query.userId) match.userId = query.userId;
    const sums = {
      runs: { $sum: 1 },
      accepted: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $in: ["$status", ["failed", "fallback"]] }, 1, 0] } },
      inputTokens: { $sum: "$usage.inputTokens" }, outputTokens: { $sum: "$usage.outputTokens" }, totalTokens: { $sum: "$usage.totalTokens" },
      cost: { $sum: "$cost.amount" }, avgLatencyMs: { $avg: "$latencyMs" },
    };
    const key = query.groupBy === "model" ? { modelKey: "$modelKey", modelId: "$modelId", model: "$model", provider: "$provider" }
      : query.groupBy === "user" ? "$userId"
      : { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    const [totals, groups] = await Promise.all([
      LlmRunModel.aggregate([{ $match: match }, { $group: { _id: null, ...sums } }]),
      LlmRunModel.aggregate([{ $match: match }, { $group: { _id: key, ...sums } }, { $sort: query.groupBy === "day" || !query.groupBy ? { _id: 1 } : { totalTokens: -1 } }, { $limit: 400 }]),
    ]);
    let rows: Record<string, unknown>[] = groups.map(g => ({ ...g, key: g._id, _id: undefined }));
    if (query.groupBy === "user") {
      const ids = rows.map(r => String(r.key)).filter(id => mongoose.isValidObjectId(id));
      const users = await mongoose.model("User").find({ _id: { $in: ids } }, { name: 1, email: 1 }).lean() as { _id: unknown; name?: string; email?: string }[];
      const byId = new Map(users.map(u => [String(u._id), u]));
      rows = rows.map(r => ({ ...r, user: byId.get(String(r.key)) ? { id: String(r.key), name: byId.get(String(r.key))!.name, email: byId.get(String(r.key))!.email } : { id: String(r.key) } }));
    }
    const t = totals[0] ?? { runs: 0, accepted: 0, failed: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, avgLatencyMs: 0 };
    delete (t as any)._id;
    return { totals: t, groupBy: query.groupBy ?? "day", rows };
  }

  /** Per-model statistics and scores over the window, with the recommended model. */
  static async leaderboard(query: LeaderboardQuery = {}) {
    const settings = await SystemSettingsModel.findOne().lean();
    const scoring = settings?.scoring;
    const windowDays = query.windowDays ?? scoring?.windowDays ?? 30;
    const presetName = query.preset ?? (scoring?.preset as ScorePreset | "custom" | undefined) ?? "balanced";
    const weights: ScoreWeights = presetName === "custom" ? normalizeWeights(scoring?.weights) : SCORE_PRESETS[presetName] ?? SCORE_PRESETS.balanced;
    const match: Record<string, unknown> = {};
    if (query.benchmarkId) match.benchmarkId = query.benchmarkId;
    else match.createdAt = { $gte: new Date(Date.now() - windowDays * 86_400_000) };
    if (query.mode) match.mode = query.mode;
    if (query.purpose && query.purpose !== "all") match.purpose = query.purpose;

    const [models, runs] = await Promise.all([
      LlmModelModel.find().lean(),
      LlmRunModel.find(match, { modelId: 1, modelKey: 1, model: 1, provider: 1, status: 1, errorKind: 1, quality: 1, filesSent: 1, latencyMs: 1, usage: 1, cost: 1, feedback: 1 }).lean(),
    ]);
    const byModel = new Map<string, RunSample[]>();
    const labels = new Map<string, { modelKey: string; model: string; provider: string }>();
    for (const r of runs) {
      const id = r.modelId ? String(r.modelId) : `env:${r.model}`;
      if (!byModel.has(id)) byModel.set(id, []);
      byModel.get(id)!.push(toSample(r));
      if (!labels.has(id)) labels.set(id, { modelKey: r.modelKey, model: r.model, provider: r.provider });
    }
    const registered = new Map(models.map(m => [String(m._id), m]));
    const candidates: (ModelCandidate & { stats: ModelStats })[] = [];
    for (const m of models) candidates.push({ id: String(m._id), stats: modelStats(byModel.get(String(m._id)) ?? []), enabled: m.enabled, health: m.health?.status });
    for (const [id, samples] of byModel) if (!registered.has(id) && id.startsWith("env:")) candidates.push({ id, stats: modelStats(samples), enabled: false, health: "unknown" });
    // A benchmark asks each model once, on the same input: one run each is a fair comparison.
    const scores = new Map(scoreModels(candidates, weights, query.benchmarkId ? { minRuns: 1 } : {}).map(s => [s.id, s]));
    const rows = candidates.map(c => {
      const m = registered.get(c.id);
      const label = labels.get(c.id);
      return {
        modelId: m ? c.id : null,
        key: m?.key ?? label?.modelKey ?? c.id,
        displayName: m?.displayName ?? `${label?.model ?? c.id} (server config)`,
        provider: m?.provider ?? label?.provider ?? "",
        model: m?.model ?? label?.model ?? "",
        enabled: c.enabled, health: c.health ?? "unknown",
        stats: { ...c.stats, costPerSuccess: Number.isFinite(c.stats.costPerSuccess) ? c.stats.costPerSuccess : null },
        ...scores.get(c.id)!,
      };
    }).sort((a, b) => b.score - a.score || b.stats.n - a.stats.n);
    return { windowDays, mode: query.mode ?? null, purpose: query.purpose ?? "all", preset: presetName, weights, rows, recommendedModelId: rows.find(r => r.recommended)?.modelId ?? null };
  }

  /** The recommended registry model for a snapshot of this many files, or null when there is not enough data. */
  static async recommendedFor(mode: "refine" | "name-only"): Promise<{ modelId: string | null; scores: Map<string, { score: number; confident: boolean; n: number }> }> {
    const board = await this.leaderboard({ mode, purpose: "all" });
    return {
      modelId: board.recommendedModelId,
      scores: new Map(board.rows.filter(r => r.modelId).map(r => [r.modelId as string, { score: r.score, confident: r.confident, n: r.stats.n }])),
    };
  }
}

/** What the API returns for a run: no internal ids beyond what the UI links to. */
function present(r: any) {
  const project = r.projectId && typeof r.projectId === "object" ? { id: String(r.projectId._id), name: r.projectId.name } : { id: String(r.projectId) };
  return {
    id: String(r._id), project, snapshotId: r.snapshotId, jobId: r.jobId, modelId: r.modelId ?? null, modelKey: r.modelKey, provider: r.provider, model: r.model,
    purpose: r.purpose, mode: r.mode, filesSent: r.filesSent, status: r.status, errorKind: r.errorKind, fallbackReason: r.fallbackReason,
    usage: r.usage, latencyMs: r.latencyMs, wallMs: r.wallMs, cost: r.cost, quality: r.quality, attempts: r.attempts, feedback: r.feedback ?? null, createdAt: r.createdAt,
  };
}
