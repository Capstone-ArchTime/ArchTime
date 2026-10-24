import { MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";
import { UserRole } from "../../../domain/entities/User.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";
import type { AccessUser, ProjectAccessPolicy } from "../../services/ProjectAccessPolicy.js";

/**
 * Mining jobs the caller may see: those of projects they can read. System Administrators see every job (they
 * monitor the platform; a job carries metadata, not project content).
 */
export class GetMiningJobsUseCase {
  constructor(private readonly accessPolicy?: Pick<ProjectAccessPolicy, "readableProjects">) {}

  public async execute(
    skip: number,
    limit: number,
    user?: AccessUser,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    let filter: Record<string, unknown> = {};
    if (user && this.accessPolicy && user.role !== UserRole.SYSTEM_ADMINISTRATOR) {
      const readable = await this.accessPolicy.readableProjects(user);
      if (readable.length === 0) return { items: [], total: 0 };
      filter = { projectId: { $in: readable.map(r => r.project.id) } };
    }

    const [docs, total] = await Promise.all([
      MiningJobModel.find(filter)
        .populate("projectId", "name")
        // The monitor shows who asked for the job, not their account id.
        .populate("requestedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MiningJobModel.countDocuments(filter),
    ]);

    const items = docs.map(j => ({
      ...j,
      id: (j._id as any).toString(),
      _id: undefined,
    }));

    return { items, total };
  }
}
