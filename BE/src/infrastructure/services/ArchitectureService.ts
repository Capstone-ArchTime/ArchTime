import mongoose from "mongoose";
import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { ArchitectureReferenceModel } from "../database/models/ArchitectureReferenceModel.js";
import { assessView } from "../../domain/architecture/quality.js";
import type { ReferenceComponent, ViewAssessment } from "../../domain/architecture/quality.js";
import { ArchitectureMappingModel } from "../database/models/ArchitectureMappingModel.js";
import { ALGORITHM_VERSION, buildView, fileDependencies, graphHash, proposeMapping } from "../../domain/architecture/buildView.js";
import type { MappingComponent, SnapshotGraph } from "../../domain/architecture/buildView.js";
import { refineMapping } from "../../domain/architecture/llm/refine.js";
import { DEFAULT_REFINE_OPTIONS } from "../../domain/architecture/llm/types.js";
import type { RefineReceipt } from "../../domain/architecture/llm/types.js";
import { validateView } from "../../domain/architecture/validate.js";
import { matchComponents, trackLineages } from "../../domain/architecture/matching.js";
import type { ComponentMatching, Lineage, MatchComponent } from "../../domain/architecture/matching.js";
import { evaluateEvolution, UNASSIGNED_COMPONENT } from "../../domain/architecture/evaluation.js";
import type { EvolutionEvaluation } from "../../domain/architecture/evaluation.js";
import type { LlmCapability } from "../llm/runtime.js";
import { LlmModelRegistry } from "../llm/registry.js";
import { LlmRunService } from "./LlmRunService.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";

// Clustering runs in the request: it takes a few tens of milliseconds for typical repositories, so it only needs a size
// guard. Asking a model takes much longer and runs as a background job (see ArchitectureJob).
const MAX_FILES = 20_000;
/** Snapshots followed by a lineage request (the most recent ones that have components). */
const MAX_LINEAGE_SNAPSHOTS = 60;

export interface ArchitecturePayload {
  status: "ready" | "missing";
  snapshot: { id: string; hash: string; title: string; date: Date } | null;
  view: ReturnType<typeof buildView> | null;
  validation: ReturnType<typeof validateView> | null;
  mapping: { generator: string; algorithmVersion: string; createdAt: Date; stale: boolean; receipt: RefineReceipt | null } | null;
  /** What the server can do with an AI model, so the UI can offer (or hide) the option and warn when prompts leave the network. */
  llm: LlmCapability;
  /** How meaningful the view is (see domain/architecture/quality.ts): grounding, cycles, layering, balance, and agreement with the reference and the previous snapshot. */
  quality?: ViewAssessment | null;
}

type QualityContext = { reference: ReferenceComponent[] | null; previous: { snapshotId: string; components: { id: string; memberIds: string[] }[] } | null };

export interface MatchedSide {
  snapshot: { id: string; hash: string; title: string; date: Date };
  /** The components were grouped from an older version of the snapshot graph or algorithm. */
  stale: boolean;
  components: { id: string; name: string; role: string; files: number }[];
}

export interface ArchitectureMatchPayload { before: MatchedSide; after: MatchedSide; matching: ComponentMatching }

export interface ArchitectureLineagePayload {
  snapshots: { id: string; hash: string; title: string; date: Date }[];
  lineages: Lineage[];
  byComponent: Record<string, Record<string, string>>;
  steps: { from: string; to: string; summary: ComponentMatching["summary"]; changes: ComponentMatching["changes"] }[];
}

export interface ArchitectureEvaluationPayload extends Omit<EvolutionEvaluation, "snapshots"> {
  snapshots: (EvolutionEvaluation["snapshots"][number] & { snapshot: { id: string; hash: string; title: string; date: Date }; generator: string })[];
  hasReference: boolean;
}

export interface ArchitectureOptions { minComponents?: number; maxComponents?: number }

/** Who asked for a refinement and with which model; recorded with the run. */
export interface RefineRunContext {
  /** Registry id; the administrator's default (or the environment's model) when absent. */
  modelId?: string | null;
  userId?: string;
  jobId?: string;
  /** A benchmark run is recorded for comparison only: the project's stored components are left alone. */
  purpose?: "user" | "benchmark";
  benchmarkId?: string;
}

export class ArchitectureService {
  private static async pickSnapshot(projectId: string, snapshotId?: string) {
    const query = snapshotId ? { _id: snapshotId, projectId } : { projectId };
    const snapshot = await SnapshotModel.findOne(query).sort({ date: -1 }).lean();
    if (!snapshot) throw new NotFoundError(snapshotId ? "Snapshot not found" : "This workspace has no mined snapshots yet");
    return snapshot;
  }

  private static toGraph(snapshot: { nodes?: unknown; edges?: unknown }): SnapshotGraph {
    return { nodes: (snapshot.nodes ?? []) as SnapshotGraph["nodes"], edges: (snapshot.edges ?? []) as SnapshotGraph["edges"] };
  }

  private static summary(snapshot: any) {
    return { id: String(snapshot._id), hash: snapshot.hash, title: snapshot.title, date: snapshot.date };
  }

  /**
   * What a view is compared with: the project's reference architecture and the components of the closest earlier snapshot
   * that has them. Without a database (unit tests, scripts) there is nothing to compare with.
   */
  private static async qualityContext(projectId: string, snapshot: any): Promise<QualityContext> {
    if (mongoose.connection.readyState !== 1) return { reference: null, previous: null };
    const [reference, earlier] = await Promise.all([
      ArchitectureReferenceModel.findOne({ projectId }).lean(),
      SnapshotModel.find({ projectId, date: { $lt: snapshot.date } }, { _id: 1 }).sort({ date: -1 }).limit(50).lean(),
    ]);
    const ids = earlier.map(s => String(s._id));
    const mappings = ids.length ? await ArchitectureMappingModel.find({ projectId, snapshotId: { $in: ids } }, { snapshotId: 1, components: 1 }).lean() : [];
    const bySnapshot = new Map(mappings.map(m => [String(m.snapshotId), m]));
    const closest = ids.map(id => bySnapshot.get(id)).find(Boolean);
    return {
      reference: reference?.components?.length ? reference.components : null,
      previous: closest ? { snapshotId: String(closest.snapshotId), components: closest.components } : null,
    };
  }

  private static payload(snapshot: any, graph: SnapshotGraph, mapping: any, llm: LlmCapability, context?: QualityContext): ArchitecturePayload {
    const view = buildView(
      { projectId: String(snapshot.projectId), snapshotId: String(snapshot._id), title: `${snapshot.title?.split("\n")[0] ?? "Snapshot"} (${snapshot.hash})`, generator: mapping.generator },
      graph,
      mapping.components,
    );
    return {
      status: "ready",
      snapshot: this.summary(snapshot),
      view,
      validation: validateView(view, mapping.options),
      mapping: {
        generator: mapping.generator, algorithmVersion: mapping.algorithmVersion, createdAt: mapping.updatedAt ?? mapping.createdAt,
        stale: mapping.graphHash !== graphHash(graph) || mapping.algorithmVersion !== ALGORITHM_VERSION, receipt: mapping.receipt ?? null,
      },
      llm,
      quality: context ? assessView(view, context) : null,
    };
  }

  public static async get(projectId: string, snapshotId?: string): Promise<ArchitecturePayload> {
    const snapshot = await this.pickSnapshot(projectId, snapshotId);
    const mapping = await ArchitectureMappingModel.findOne({ projectId, snapshotId: String(snapshot._id) }).lean();
    const llm = await LlmModelRegistry.capability();
    if (!mapping) return { status: "missing", snapshot: this.summary(snapshot), view: null, validation: null, mapping: null, llm };
    return this.payload(snapshot, this.toGraph(snapshot), mapping, llm, await this.qualityContext(projectId, snapshot));
  }

  private static async prepare(projectId: string, snapshotId: string | undefined, options: ArchitectureOptions) {
    const snapshot = await this.pickSnapshot(projectId, snapshotId);
    const graph = this.toGraph(snapshot);
    if (graph.nodes.length === 0) throw new BadRequestError("This snapshot has no source files to group");
    if (graph.nodes.length > MAX_FILES) throw new BadRequestError(`This snapshot has ${graph.nodes.length} files; grouping is limited to ${MAX_FILES}`);
    const minComponents = clampInt(options.minComponents, 2, 30, 8);
    const maxComponents = clampInt(options.maxComponents, minComponents, 40, Math.max(15, minComponents));
    const proposal = proposeMapping(graph, { minComponents, maxComponents });
    if (proposal.components.length === 0) throw new BadRequestError("No analyzable source files were found in this snapshot");
    return { snapshot, graph, minComponents, maxComponents, components: proposal.components };
  }

  private static async store(projectId: string, snapshot: any, graph: SnapshotGraph, set: Record<string, unknown>) {
    return ArchitectureMappingModel.findOneAndUpdate(
      { projectId, snapshotId: String(snapshot._id) },
      { $set: { algorithmVersion: ALGORITHM_VERSION, graphHash: graphHash(graph), ...set } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  /** Computes (or recomputes) the grouping for a snapshot with dependency clustering and stores it. */
  public static async generate(projectId: string, snapshotId?: string, options: ArchitectureOptions = {}): Promise<ArchitecturePayload> {
    const { snapshot, graph, minComponents, maxComponents, components } = await this.prepare(projectId, snapshotId, options);
    const mapping = await this.store(projectId, snapshot, graph, { generator: "cluster-only", options: { minComponents, maxComponents }, components, receipt: null });
    return this.payload(snapshot, graph, mapping, await LlmModelRegistry.capability(), await this.qualityContext(projectId, snapshot));
  }

  /**
   * Same grouping, then asks a model (the one chosen, else the default) to name and refine it. The answer is verified; if it
   * cannot be verified the clustering result is stored and the receipt says why. Every run is recorded with its token use,
   * latency, cost and quality so models can be compared (see LlmRunService).
   */
  public static async refine(
    projectId: string,
    snapshotId: string | undefined,
    hooks: { onProgress?: (stage: string, progress: number) => void | Promise<void>; isCancelled?: () => boolean; signal?: AbortSignal } = {},
    options: ArchitectureOptions = {},
    context: RefineRunContext = {},
  ): Promise<ArchitecturePayload> {
    const resolved = await LlmModelRegistry.resolve(context.modelId);
    const started = Date.now();
    await hooks.onProgress?.("Grouping files by their dependencies", 5);
    const { snapshot, graph, minComponents, maxComponents, components: initial } = await this.prepare(projectId, snapshotId, options);
    const { files, edges } = fileDependencies(graph);
    const refineOptions = { ...resolved.options, minComponents, maxComponents };
    const result = await refineMapping({
      files, edges, initial, client: resolved.client,
      options: refineOptions,
      onProgress: hooks.onProgress, isCancelled: hooks.isCancelled, signal: hooks.signal,
      log: message => console.warn(`[architecture] project ${projectId}: ${message}`),
    });
    const components = result.components as MappingComponent[];
    const view = buildView({ projectId, snapshotId: String(snapshot._id), title: snapshot.title ?? "Snapshot", generator: result.generator }, graph, components);
    const validation = validateView(view, { minComponents, maxComponents });
    const compareWith = await this.qualityContext(projectId, snapshot);
    const assessment = assessView(view, compareWith);
    const receipt: RefineReceipt = { ...result.receipt, modelId: resolved.modelId ?? undefined };
    const run = await LlmRunService.record({
      projectId, snapshotId: String(snapshot._id), userId: context.userId, jobId: context.jobId, purpose: context.purpose ?? "user", benchmarkId: context.benchmarkId,
      model: resolved, receipt, files, edges, initial, components, validation, assessment,
      maxMoveRatio: refineOptions.maxMoveRatio ?? DEFAULT_REFINE_OPTIONS.maxMoveRatio, wallMs: Date.now() - started,
    });
    if (run) { receipt.runId = run.id; receipt.cost = run.cost; }
    const llm = resolved.capability;
    if (context.purpose === "benchmark") {
      return { status: "ready", snapshot: this.summary(snapshot), view, validation, mapping: null, llm, quality: assessment };
    }
    const mapping = await this.store(projectId, snapshot, graph, {
      generator: result.generator, options: { minComponents, maxComponents }, components, receipt,
    });
    return this.payload(snapshot, graph, mapping, llm, compareWith);
  }

  /** The stored components of a snapshot as they appear in its view, without the unassigned-files bucket. */
  private static matchable(snapshot: any, mapping: any): { components: MatchComponent[]; described: MatchedSide["components"] } {
    const view = buildView(
      { projectId: String(snapshot.projectId), snapshotId: String(snapshot._id), title: snapshot.title ?? "Snapshot", generator: mapping.generator },
      this.toGraph(snapshot),
      mapping.components,
    );
    const kept = view.components.filter(c => c.name !== UNASSIGNED_COMPONENT);
    return {
      components: kept.map(c => ({ id: c.id, name: c.name, memberIds: c.memberIds })),
      described: kept.map(c => ({ id: c.id, name: c.name, role: c.role, files: c.memberIds.length })),
    };
  }

  /**
   * Which component of one snapshot became which of the other (see domain/architecture/matching.ts). The earlier snapshot
   * by commit date is "before", whichever order the ids come in. Both snapshots need stored components.
   */
  public static async match(projectId: string, firstId: string, secondId: string): Promise<ArchitectureMatchPayload> {
    const [first, second] = await Promise.all([
      SnapshotModel.findOne({ _id: firstId, projectId }).lean(),
      SnapshotModel.findOne({ _id: secondId, projectId }).lean(),
    ]);
    if (!first || !second) throw new NotFoundError("One or both snapshots not found in this workspace");
    const [earlier, later] = new Date(first.date) <= new Date(second.date) ? [first, second] : [second, first];
    const mappings = await ArchitectureMappingModel.find({ projectId, snapshotId: { $in: [String(earlier._id), String(later._id)] } }).lean();
    const side = (snapshot: any) => {
      const mapping = mappings.find(m => String(m.snapshotId) === String(snapshot._id));
      if (!mapping) throw new BadRequestError(`Snapshot ${snapshot.hash} has no components yet. Generate its architecture first.`);
      const graph = this.toGraph(snapshot);
      const { components, described } = this.matchable(snapshot, mapping);
      const stale = mapping.graphHash !== graphHash(graph) || mapping.algorithmVersion !== ALGORITHM_VERSION;
      return { components, info: { snapshot: this.summary(snapshot), stale, components: described } as MatchedSide };
    };
    const a = side(earlier), b = side(later);
    return { before: a.info, after: b.info, matching: matchComponents(a.components, b.components) };
  }

  /** The most recent snapshots that have stored components, oldest first, with their mappings. */
  private static async mappedSnapshots(projectId: string) {
    const mappings = await ArchitectureMappingModel.find({ projectId }).lean();
    const bySnapshot = new Map(mappings.map(m => [String(m.snapshotId), m]));
    const snapshots = bySnapshot.size
      ? await SnapshotModel.find({ projectId, _id: { $in: [...bySnapshot.keys()] } }).sort({ date: -1 }).limit(MAX_LINEAGE_SNAPSHOTS).lean()
      : [];
    return { snapshots: snapshots.reverse(), bySnapshot };
  }

  /** Components followed through the project's snapshots that have them, oldest first. */
  public static async lineage(projectId: string): Promise<ArchitectureLineagePayload> {
    const { snapshots, bySnapshot } = await this.mappedSnapshots(projectId);
    const tracked = trackLineages(snapshots.map(s => ({ snapshotId: String(s._id), components: this.matchable(s, bySnapshot.get(String(s._id))).components })));
    return {
      snapshots: snapshots.map(s => this.summary(s)),
      lineages: tracked.lineages,
      byComponent: tracked.byComponent,
      steps: tracked.steps.map(st => ({ from: st.from, to: st.to, summary: st.matching.summary, changes: st.matching.changes })),
    };
  }

  /**
   * The recovered architecture against the directory baseline over the project's snapshots (see
   * domain/architecture/evaluation.ts): agreement with the reference architecture, stability between snapshots, and the
   * structural changes each one shows.
   */
  public static async evaluation(projectId: string, options: { depth?: number } = {}): Promise<ArchitectureEvaluationPayload> {
    const [{ snapshots, bySnapshot }, reference] = await Promise.all([
      this.mappedSnapshots(projectId),
      ArchitectureReferenceModel.findOne({ projectId }).lean(),
    ]);
    const inputs = snapshots.map(s => {
      const mapping = bySnapshot.get(String(s._id))!;
      const view = buildView({ projectId, snapshotId: String(s._id), title: s.title ?? "Snapshot", generator: mapping.generator }, this.toGraph(s), mapping.components);
      return { snapshotId: String(s._id), components: view.components.map(c => ({ id: c.id, name: c.name, memberIds: c.memberIds })), generator: mapping.generator };
    });
    const result = evaluateEvolution(inputs, { reference: reference?.components ?? null, baseline: options.depth ? { depth: options.depth } : {} });
    return {
      ...result,
      snapshots: result.snapshots.map((e, i) => ({ ...e, snapshot: this.summary(snapshots[i]), generator: inputs[i].generator })),
      hasReference: !!reference?.components?.length,
    };
  }

  public static async getReference(projectId: string): Promise<ReferenceComponent[]> {
    const ref = await ArchitectureReferenceModel.findOne({ projectId }).lean();
    return ref?.components ?? [];
  }

  public static async saveReference(projectId: string, components: ReferenceComponent[], userId: string): Promise<ReferenceComponent[]> {
    if (!components.length) {
      await ArchitectureReferenceModel.deleteOne({ projectId });
      return [];
    }
    const saved = await ArchitectureReferenceModel.findOneAndUpdate({ projectId }, { $set: { components, updatedBy: userId } }, { upsert: true, new: true }).lean();
    return saved?.components ?? components;
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
