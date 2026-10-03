import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";

export class GetSnapshotsUseCase {
  public async execute(
    projectId: string,
    skip: number,
    limit: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const [docs, total] = await Promise.all([
      SnapshotModel.find({ projectId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SnapshotModel.countDocuments({ projectId }),
    ]);

    const items = docs.map(s => ({
      ...s,
      id: s._id.toString(),
      _id: undefined,
    }));

    return { items, total };
  }
}
