import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { loadOwnedProject } from "./loadOwnedProject.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";

export interface GetSnapshotsOptions {
  summary?: boolean;
  skip?: number;
  limit?: number;
}

export class GetSnapshotsUseCase {
  /** `summary` leaves out the dependency graph, which is most of a snapshot's size. */
  public async execute(
    projectId: string,
    userIdOrSkip?: string | number,
    optionsOrLimit?: boolean | number | GetSnapshotsOptions,
  ): Promise<PaginatedResult<Record<string, unknown>> | any[]> {
    let userId: string | undefined;
    let summary = false;
    let skip: number | undefined;
    let limit: number | undefined;

    if (typeof userIdOrSkip === "number") {
      skip = userIdOrSkip;
      if (typeof optionsOrLimit === "number") {
        limit = optionsOrLimit;
      }
    } else {
      userId = userIdOrSkip;
      if (typeof optionsOrLimit === "boolean") {
        summary = optionsOrLimit;
      } else if (typeof optionsOrLimit === "object" && optionsOrLimit !== null) {
        summary = !!optionsOrLimit.summary;
        skip = optionsOrLimit.skip;
        limit = optionsOrLimit.limit;
      }
    }

    if (userId) {
      await loadOwnedProject(projectId, userId);
    }

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
