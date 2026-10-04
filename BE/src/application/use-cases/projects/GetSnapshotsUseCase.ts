import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { loadOwnedProject } from "./loadOwnedProject.js";

export interface GetSnapshotsOptions {
  summary?: boolean;
  skip?: number;
  limit?: number;
}

export class GetSnapshotsUseCase {
  /** `summary` leaves out the dependency graph, which is most of a snapshot's size. */
  public async execute(
    projectId: string,
    userId?: string,
    options: boolean | GetSnapshotsOptions = false,
  ): Promise<{ items: any[]; total: number } | any[]> {
    if (userId) {
      await loadOwnedProject(projectId, userId);
    }

    const summary = typeof options === "boolean" ? options : !!options.summary;
    const skip = typeof options === "object" ? options.skip : undefined;
    const limit = typeof options === "object" ? options.limit : undefined;

    let query: any = SnapshotModel.find({ projectId }).sort({ date: -1 });
    if (summary) {
      query = query.select("-nodes -edges");
    }
    if (typeof skip === "number") {
      query = query.skip(skip);
    }
    if (typeof limit === "number") {
      query = query.limit(limit);
    }

    const [docs, total] = await Promise.all([
      query.lean(),
      SnapshotModel.countDocuments({ projectId }),
    ]);

    const items = docs.map((s: any) => ({
      ...s,
      id: s._id.toString(),
      _id: undefined,
    }));

    if (typeof skip === "number" || typeof limit === "number") {
      return { items, total };
    }

    return items;
  }
}
