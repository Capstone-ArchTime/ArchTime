import { MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";

export class GetMiningJobsUseCase {
  public async execute(
    skip: number,
    limit: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const [docs, total] = await Promise.all([
      MiningJobModel.find()
        .populate("projectId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MiningJobModel.countDocuments(),
    ]);

    const items = docs.map(j => ({
      ...j,
      id: (j._id as any).toString(),
      _id: undefined,
    }));

    return { items, total };
  }
}
