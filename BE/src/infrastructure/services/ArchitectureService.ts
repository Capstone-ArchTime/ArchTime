import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { ArchitectureMappingModel } from "../database/models/ArchitectureMappingModel.js";
import { ALGORITHM_VERSION, buildView, graphHash, proposeMapping } from "../../domain/architecture/buildView.js";
import type { SnapshotGraph } from "../../domain/architecture/buildView.js";
import { validateView } from "../../domain/architecture/validate.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";

// Grouping runs in the request. It is a few tens of milliseconds for typical repositories, so it only needs a size guard;
// the slower LLM refinement planned next will run as a background job instead.
const MAX_FILES = 20_000;

export interface ArchitecturePayload {
  status: "ready" | "missing";
  snapshot: { id: string; hash: string; title: string; date: Date } | null;
  view: ReturnType<typeof buildView> | null;
  validation: ReturnType<typeof validateView> | null;
  mapping: { generator: string; algorithmVersion: string; createdAt: Date; stale: boolean } | null;
}

export interface ArchitectureOptions { minComponents?: number; maxComponents?: number }

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

  private static payload(snapshot: any, graph: SnapshotGraph, mapping: any): ArchitecturePayload {
    const view = buildView(
      { projectId: String(snapshot.projectId), snapshotId: String(snapshot._id), title: `${snapshot.title?.split("\n")[0] ?? "Snapshot"} (${snapshot.hash})`, generator: mapping.generator },
      graph,
      mapping.components,
    );
    return {
      status: "ready",
      snapshot: { id: String(snapshot._id), hash: snapshot.hash, title: snapshot.title, date: snapshot.date },
      view,
      validation: validateView(view, mapping.options),
      mapping: { generator: mapping.generator, algorithmVersion: mapping.algorithmVersion, createdAt: mapping.updatedAt ?? mapping.createdAt, stale: mapping.graphHash !== graphHash(graph) || mapping.algorithmVersion !== ALGORITHM_VERSION },
    };
  }

  public static async get(projectId: string, snapshotId?: string): Promise<ArchitecturePayload> {
    const snapshot = await this.pickSnapshot(projectId, snapshotId);
    const mapping = await ArchitectureMappingModel.findOne({ projectId, snapshotId: String(snapshot._id) }).lean();
    if (!mapping) return { status: "missing", snapshot: { id: String(snapshot._id), hash: snapshot.hash, title: snapshot.title, date: snapshot.date }, view: null, validation: null, mapping: null };
    return this.payload(snapshot, this.toGraph(snapshot), mapping);
  }

  /** Computes (or recomputes) the grouping for a snapshot and stores it. */
  public static async generate(projectId: string, snapshotId?: string, options: ArchitectureOptions = {}): Promise<ArchitecturePayload> {
    const snapshot = await this.pickSnapshot(projectId, snapshotId);
    const graph = this.toGraph(snapshot);
    if (graph.nodes.length === 0) throw new BadRequestError("This snapshot has no source files to group");
    if (graph.nodes.length > MAX_FILES) throw new BadRequestError(`This snapshot has ${graph.nodes.length} files; grouping is limited to ${MAX_FILES}`);
    const minComponents = clampInt(options.minComponents, 2, 30, 8);
    const maxComponents = clampInt(options.maxComponents, minComponents, 40, Math.max(15, minComponents));

    const { components } = proposeMapping(graph, { minComponents, maxComponents });
    if (components.length === 0) throw new BadRequestError("No analyzable source files were found in this snapshot");
    const mapping = await ArchitectureMappingModel.findOneAndUpdate(
      { projectId, snapshotId: String(snapshot._id) },
      { $set: { generator: "cluster-only", algorithmVersion: ALGORITHM_VERSION, graphHash: graphHash(graph), options: { minComponents, maxComponents }, components } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return this.payload(snapshot, graph, mapping);
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
