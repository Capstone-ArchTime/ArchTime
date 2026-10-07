import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { ArchitectureMappingModel } from "../database/models/ArchitectureMappingModel.js";
import { ALGORITHM_VERSION, buildView, fileDependencies, graphHash, proposeMapping } from "../../domain/architecture/buildView.js";
import type { MappingComponent, SnapshotGraph } from "../../domain/architecture/buildView.js";
import { refineMapping } from "../../domain/architecture/llm/refine.js";
import { DEFAULT_REFINE_OPTIONS } from "../../domain/architecture/llm/types.js";
import type { RefineReceipt } from "../../domain/architecture/llm/types.js";
import { validateView } from "../../domain/architecture/validate.js";
import type { LlmCapability } from "../llm/runtime.js";
import { LlmModelRegistry } from "../llm/registry.js";
import { LlmRunService } from "./LlmRunService.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";

// Clustering runs in the request: it takes a few tens of milliseconds for typical repositories, so it only needs a size
// guard. Asking a model takes much longer and runs as a background job (see ArchitectureJob).
const MAX_FILES = 20_000;

export interface ArchitecturePayload {
  status: "ready" | "missing";
  snapshot: { id: string; hash: string; title: string; date: Date } | null;
  view: ReturnType<typeof buildView> | null;
  validation: ReturnType<typeof validateView> | null;
  mapping: { generator: string; algorithmVersion: string; createdAt: Date; stale: boolean; receipt: RefineReceipt | null } | null;
  /** What the server can do with an AI model, so the UI can offer (or hide) the option and warn when prompts leave the network. */
  llm: LlmCapability;
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
    if (!snapshot) throw new NotFoundError(snapshotId ? "Snapshot not found" : "This project has no mined snapshots yet");
    return snapshot;
  }

  private static toGraph(snapshot: { nodes?: unknown; edges?: unknown }): SnapshotGraph {
    return { nodes: (snapshot.nodes ?? []) as SnapshotGraph["nodes"], edges: (snapshot.edges ?? []) as SnapshotGraph["edges"] };
  }

  private static summary(snapshot: any) {
    return { id: String(snapshot._id), hash: snapshot.hash, title: snapshot.title, date: snapshot.date };
  }

  private static payload(snapshot: any, graph: SnapshotGraph, mapping: any, llm: LlmCapability): ArchitecturePayload {
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
    };
  }

  public static async get(projectId: string, snapshotId?: string): Promise<ArchitecturePayload> {
    const snapshot = await this.pickSnapshot(projectId, snapshotId);
    const mapping = await ArchitectureMappingModel.findOne({ projectId, snapshotId: String(snapshot._id) }).lean();
    const llm = await LlmModelRegistry.capability();
    if (!mapping) return { status: "missing", snapshot: this.summary(snapshot), view: null, validation: null, mapping: null, llm };
    return this.payload(snapshot, this.toGraph(snapshot), mapping, llm);
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
    return this.payload(snapshot, graph, mapping, await LlmModelRegistry.capability());
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
    const receipt: RefineReceipt = { ...result.receipt, modelId: resolved.modelId ?? undefined };
    const run = await LlmRunService.record({
      projectId, snapshotId: String(snapshot._id), userId: context.userId, jobId: context.jobId, purpose: context.purpose ?? "user", benchmarkId: context.benchmarkId,
      model: resolved, receipt, files, edges, initial, components, validation,
      maxMoveRatio: refineOptions.maxMoveRatio ?? DEFAULT_REFINE_OPTIONS.maxMoveRatio, wallMs: Date.now() - started,
    });
    if (run) { receipt.runId = run.id; receipt.cost = run.cost; }
    const llm = resolved.capability;
    if (context.purpose === "benchmark") {
      return { status: "ready", snapshot: this.summary(snapshot), view, validation, mapping: null, llm };
    }
    const mapping = await this.store(projectId, snapshot, graph, {
      generator: result.generator, options: { minComponents, maxComponents }, components, receipt,
    });
    return this.payload(snapshot, graph, mapping, llm);
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
