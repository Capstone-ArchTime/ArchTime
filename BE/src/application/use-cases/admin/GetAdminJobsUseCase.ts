import { JobKind, JobStatus, MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";
import { ProjectModel } from "../../../infrastructure/database/models/ProjectModel.js";
import { UserModel } from "../../../infrastructure/database/models/UserModel.js";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/utils/apiResponse.js";

export interface GetAdminJobsInput {
  page?: number;
  limit?: number;
  status?: string;
  projectId?: string;
  kind?: string;
  search?: string;
}

export interface AdminJobItem {
  id: string;
  projectId: string;
  projectName?: string;
  projectRepoUrl?: string;
  requester?: {
    id: string;
    name: string;
    email: string;
  };
  status: JobStatus;
  kind: JobKind;
  stage: string;
  progress: number;
  total: number;
  processed: number;
  failedCommits: number;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetAdminJobsResult {
  jobs: AdminJobItem[];
  meta: PaginationMeta;
}

export class GetAdminJobsUseCase {
  async execute(input: GetAdminJobsInput): Promise<GetAdminJobsResult> {
    const page = Math.max(1, input.page ? Number(input.page) : 1);
    const limit = Math.max(1, Math.min(100, input.limit ? Number(input.limit) : 10));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (input.status && Object.values(JobStatus).includes(input.status as JobStatus)) {
      query.status = input.status;
    }

    if (input.kind && Object.values(JobKind).includes(input.kind as JobKind)) {
      query.kind = input.kind;
    }

    if (input.projectId) {
      query.projectId = input.projectId;
    }

    // If search is provided, we can find projects matching name or users matching name/email
    if (input.search && input.search.trim()) {
      const escaped = input.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const [matchedProjects, matchedUsers] = await Promise.all([
        ProjectModel.find({ name: { $regex: escaped, $options: "i" } }).select("_id").lean(),
        UserModel.find({
          $or: [
            { name: { $regex: escaped, $options: "i" } },
            { email: { $regex: escaped, $options: "i" } },
          ],
        }).select("_id").lean(),
      ]);

      const projectIds = matchedProjects.map((p) => p._id.toString());
      const userIds = matchedUsers.map((u) => u._id.toString());

      query.$or = [
        { projectId: { $in: projectIds } },
        { requestedBy: { $in: userIds } },
      ];
    }

    const [docs, total] = await Promise.all([
      MiningJobModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MiningJobModel.countDocuments(query),
    ]);

    // Enrich with project and requester details
    const projectIds = [...new Set(docs.map((d) => String(d.projectId)).filter(Boolean))];
    const userIds = [...new Set(docs.map((d) => String(d.requestedBy)).filter(Boolean))];

    const [projects, users] = await Promise.all([
      ProjectModel.find({ _id: { $in: projectIds } }).lean(),
      UserModel.find({ _id: { $in: userIds } }).lean(),
    ]);

    const projectMap = new Map(projects.map((p) => [p._id.toString(), p]));
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const jobs: AdminJobItem[] = docs.map((doc: any) => {
      const proj = projectMap.get(String(doc.projectId));
      const user = userMap.get(String(doc.requestedBy));

      return {
        id: doc._id.toString(),
        projectId: String(doc.projectId),
        projectName: proj?.name,
        projectRepoUrl: proj?.repoUrl,
        requester: user
          ? {
              id: user._id.toString(),
              name: user.name,
              email: user.email,
            }
          : undefined,
        status: doc.status as JobStatus,
        kind: doc.kind as JobKind,
        stage: doc.stage,
        progress: doc.progress ?? 0,
        total: doc.total ?? 0,
        processed: doc.processed ?? 0,
        failedCommits: doc.failedCommits ?? 0,
        error: doc.error,
        startedAt: doc.startedAt,
        finishedAt: doc.finishedAt,
        cancelledAt: doc.cancelledAt,
        cancelledBy: doc.cancelledBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

    const meta = buildPaginationMeta(total, page, limit);

    return { jobs, meta };
  }
}
