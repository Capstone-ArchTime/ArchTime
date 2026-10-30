import mongoose from "mongoose";
import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { EvidenceModel } from "../database/models/EvidenceModel.js";
import { ArchitectureReferenceModel } from "../database/models/ArchitectureReferenceModel.js";
import { assessView } from "../../domain/architecture/quality.js";
import type { ReferenceComponent, ViewAssessment } from "../../domain/architecture/quality.js";
import { ArchitectureMappingModel } from "../database/models/ArchitectureMappingModel.js";
import { ALGORITHM_VERSION, buildView, fileDependencies, graphHash, proposeMapping } from "../../domain/architecture/buildView.js";
import type { MappingComponent, SnapshotGraph } from "../../domain/architecture/buildView.js";
import { compactImpact, diffResolved, fileChangeTotals, IMPACT_LABEL, ownerMapOf, projectImpact, resolveGraph } from "../../domain/architecture/bridge.js";
import type { ImpactProjection, ResolvedGraph } from "../../domain/architecture/bridge.js";
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

/** Commits listed by a component-impact request: the most recent ones at or before the viewed snapshot. */
const IMPACT_DEFAULT_LIMIT = 20;
const IMPACT_MAX_LIMIT = 50;
const IMPACT_NOTE =
  "Components are a computed grouping over import edges (an inference, not something the code declares), and the change is derived by comparing two mined snapshots: " +
  "the commit's snapshot and the latest earlier one. Only resolved file-to-file import changes are compared. A renamed file shows as one removal and one addition, " +
  "and a file the commit deleted has no component in the grouping.";

type SnapshotSummary = { id: string; hash: string; title: string; date: Date };

export type ArchitectureImpactBase = { label: typeof IMPACT_LABEL; note: string };

export type EvidenceImpactPayload = ArchitectureImpactBase & {
  evidence: { id: string; commit: string; title: string; date: Date; type: string; depsAdded: number; depsRemoved: number };
  snapshot: SnapshotSummary;
  /** The snapshot the change was measured against; null for the first mined commit. */
  baseline: SnapshotSummary | null;
  hasBaseline: boolean;
  fileChanges: ImpactProjection["fileChanges"];
} & (
  | { grouped: false; reason: string }
  | ({ grouped: true; mapping: { generator: string; createdAt: Date; stale: boolean } } & Pick<ImpactProjection, "components" | "componentEdges" | "unmappedFiles" | "unmappedPairs">)
);

export type CommitImpact = {
  commit: string; title: string; date: Date; evidenceId: string;
  /** False when the commit's snapshot or the one before it could not be loaded, so nothing could be compared. */
  comparable: boolean;
} & ReturnType<typeof compactImpact>;

export type CommitImpactsPayload = ArchitectureImpactBase & { snapshot: SnapshotSummary; limit: number } & (
  | { grouped: false; reason: string; commits: [] }
  | { grouped: true; mapping: { generator: string; createdAt: Date }; commits: CommitImpact[]; skipped: number }
);

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
  /** `select` leaves out the node and edge lists for callers that only need the snapshot's identity. */
  private static async pickSnapshot(projectId: string, snapshotId?: string, select?: string) {
    const query = snapshotId ? { _id: snapshotId, projectId } : { projectId };
    const found = SnapshotModel.findOne(query).sort({ date: -1 });
    const snapshot = await (select ? found.select(select) : found).lean();
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

  /**
   * What one commit changed, in components (the bridge from evidence to the Architecture Map; see domain/architecture/bridge.ts).
   * The commit's snapshot is found through evidence.commit == snapshot.hash, and the baseline is the latest earlier-dated
   * snapshot of the project, as MiningService does it. The change is projected onto the mapping stored for that snapshot.
   * A snapshot without a mapping is answered with the raw file counts and never grouped here: grouping may call an AI.
   */
  public static async evidenceImpact(projectId: string, evidenceId: string): Promise<EvidenceImpactPayload> {
    // The patch and file list are the heavy parts of an evidence record and are not needed here.
    const evidence = await EvidenceModel.findOne({ _id: evidenceId, projectId }).select("-diffBefore -diffAfter -sourceFiles").lean();
    if (!evidence) throw new NotFoundError("Evidence not found");
    const snapshot = await SnapshotModel.findOne({ projectId, hash: evidence.commit }).sort({ date: -1 }).lean();
    if (!snapshot) throw new NotFoundError("The snapshot of this commit was not found");
    const [baseline, mapping] = await Promise.all([
      SnapshotModel.findOne({ projectId, date: { $lt: snapshot.date } }).sort({ date: -1 }).lean(),
      ArchitectureMappingModel.findOne({ projectId, snapshotId: String(snapshot._id) }).lean(),
    ]);
    const graph = this.toGraph(snapshot);
    const diff = diffResolved(baseline ? resolveGraph(this.toGraph(baseline)) : null, resolveGraph(graph));
    const head = {
      label: IMPACT_LABEL as typeof IMPACT_LABEL, note: IMPACT_NOTE,
      evidence: { id: String(evidence._id), commit: evidence.commit, title: evidence.changeTitle, date: evidence.date, type: evidence.type, depsAdded: evidence.depsAdded, depsRemoved: evidence.depsRemoved },
      snapshot: this.summary(snapshot), baseline: baseline ? this.summary(baseline) : null,
      hasBaseline: diff.hasBaseline, fileChanges: fileChangeTotals(diff),
    };
    if (!mapping) {
      return { ...head, grouped: false, reason: "This commit has not been grouped into components yet. Open it in the Architecture Map and group its files." };
    }
    const { label: _label, hasBaseline: _hasBaseline, fileChanges: _fileChanges, ...rest } = projectImpact(diff, ownerMapOf(mapping.components));
    return {
      ...head, grouped: true, ...rest,
      mapping: { generator: mapping.generator, createdAt: (mapping as any).updatedAt ?? (mapping as any).createdAt, stale: mapping.graphHash !== graphHash(graph) || mapping.algorithmVersion !== ALGORITHM_VERSION },
    };
  }

  /**
   * The commits that changed the components of ONE viewed snapshot, newest first (component -> commits). The viewed snapshot's
   * mapping gives the owner map; each of the most recent `limit` evidence records dated at or before the snapshot is turned
   * into a file-level change (its snapshot against the latest earlier one) and projected onto that owner map, so files that
   * no longer exist in the mapping count as unmapped. Without a mapping nothing is computed (grouped: false).
   *
   * Cost: at most `limit` (default 20, max 50) evidence rows read without their patches (served by the { projectId, date }
   * index on evidence, so the query does not scan other projects' documents), one lean query for their snapshots'
   * hashes and dates, one lean baseline lookup per commit, and the node and edge lists of at most 2 x limit snapshots, loaded
   * one at a time. Neighbouring commits share a snapshot, so a run of consecutive commits loads about limit + 1 graphs, and
   * only two resolved graphs are ever held in memory. Nothing is written.
   */
  public static async commitImpacts(projectId: string, snapshotId?: string, limitInput?: unknown): Promise<CommitImpactsPayload> {
    const snapshot = await this.pickSnapshot(projectId, snapshotId, "hash title date projectId");
    const limit = clampInt(limitInput, 1, IMPACT_MAX_LIMIT, IMPACT_DEFAULT_LIMIT);
    const head = { label: IMPACT_LABEL as typeof IMPACT_LABEL, note: IMPACT_NOTE, snapshot: this.summary(snapshot), limit };
    const mapping = await ArchitectureMappingModel.findOne({ projectId, snapshotId: String(snapshot._id) }).lean();
    if (!mapping) {
      return { ...head, grouped: false, reason: "This snapshot has not been grouped into components yet. Open it in the Architecture Map and group its files.", commits: [] };
    }
    const owner = ownerMapOf(mapping.components);
    const evidences = await EvidenceModel.find({ projectId, date: { $lte: snapshot.date } }).sort({ date: -1, _id: -1 }).limit(limit).select("changeTitle commit date").lean();
    const hashes = [...new Set(evidences.map(e => e.commit))];
    const snapshots = hashes.length ? await SnapshotModel.find({ projectId, hash: { $in: hashes } }).sort({ date: -1 }).select("hash date").lean() : [];
    const byHash = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) if (!byHash.has(s.hash)) byHash.set(s.hash, s);

    // The older commit's snapshot is usually the newer commit's baseline, so the last baseline is kept for the next round.
    let kept: { id: string; graph: ResolvedGraph | null } | null = null;
    const load = async (id: string): Promise<ResolvedGraph | null> => {
      if (kept?.id === id) return kept.graph;
      const row = await SnapshotModel.findOne({ _id: id }).select("nodes edges").lean();
      return row ? resolveGraph(this.toGraph(row)) : null;
    };
    const commits: CommitImpact[] = [];
    let skipped = 0;
    for (const e of evidences) {
      const after = byHash.get(e.commit);
      if (!after) { skipped++; continue; }
      const base = await SnapshotModel.findOne({ projectId, date: { $lt: after.date } }).sort({ date: -1 }).select("_id").lean();
      const afterGraph = await load(String(after._id));
      const beforeGraph = base ? await load(String(base._id)) : null;
      kept = base ? { id: String(base._id), graph: beforeGraph } : null;
      const comparable = !!afterGraph && !!beforeGraph;
      const projection = projectImpact(diffResolved(comparable ? beforeGraph : null, afterGraph ?? { files: [], pairs: [] }), owner);
      commits.push({ commit: e.commit, title: e.changeTitle, date: e.date, evidenceId: String(e._id), comparable, ...compactImpact(projection) });
    }
    return { ...head, grouped: true, mapping: { generator: mapping.generator, createdAt: (mapping as any).updatedAt ?? (mapping as any).createdAt }, commits, skipped };
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
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
