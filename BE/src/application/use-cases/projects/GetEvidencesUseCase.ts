import { EvidenceModel } from "../../../infrastructure/database/models/EvidenceModel.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";

export class GetEvidencesUseCase {
  public async execute(
    projectId: string,
    skip: number,
    limit: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const [docs, total] = await Promise.all([
      EvidenceModel.find({ projectId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EvidenceModel.countDocuments({ projectId }),
    ]);

    const items = docs.map(e => ({
      ...e,
      id: e._id.toString(),
      _id: undefined,
    }));

    return { items, total };
  }
}
