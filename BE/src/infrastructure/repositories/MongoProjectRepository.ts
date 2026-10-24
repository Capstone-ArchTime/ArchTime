import type { IProject, ProjectStatus, RepoVisibility } from "../../domain/entities/Project.js";
import type { IProjectRepository } from "../../domain/interfaces/IProjectRepository.js";
import mongoose from "mongoose";
import { ProjectModel } from "../database/models/ProjectModel.js";
import { ProjectMemberModel } from "../database/models/ProjectMemberModel.js";
import { ChatConversationModel } from "../database/models/ChatConversationModel.js";
import { OnboardingPathModel } from "../database/models/OnboardingPathModel.js";
import { OnboardingAssignmentModel } from "../database/models/OnboardingAssignmentModel.js";
import { WorkspaceModel } from "../database/models/WorkspaceModel.js";
import { ArchitectureMappingModel } from "../database/models/ArchitectureMappingModel.js";
import { ArchitectureReferenceModel } from "../database/models/ArchitectureReferenceModel.js";
import { ApprovalRequestModel } from "../database/models/ApprovalRequestModel.js";
import { ProjectReportModel } from "../database/models/ProjectReportModel.js";
import { ProjectInvitationModel } from "../database/models/ProjectInvitationModel.js";

export class MongoProjectRepository implements IProjectRepository {
  private toEntity(doc: Record<string, unknown>): IProject {
    return {
      id: String(doc._id),
      name: doc.name as string,
      description: doc.description as string | undefined,
      repoUrl: doc.repoUrl as string,
      visibility: doc.visibility as RepoVisibility,
      // The repository token is deliberately left out: entities reach API responses. Mining reads it from the model.
      status: doc.status as ProjectStatus,
      history: doc.history as IProject["history"],
      userId: String(doc.userId),
      ...(doc.organizationId ? { organizationId: String(doc.organizationId) } : {}),
      ...(doc.credentialId ? { credentialId: String(doc.credentialId) } : {}),
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async findByOrganizationId(organizationId: string): Promise<IProject[]> {
    const docs = await ProjectModel.find({ organizationId }).lean();
    return docs.map(doc => this.toEntity(doc as Record<string, unknown>));
  }

  async findByIds(ids: string[]): Promise<IProject[]> {
    const valid = ids.filter(id => mongoose.isValidObjectId(id));
    if (valid.length === 0) return [];
    const docs = await ProjectModel.find({ _id: { $in: valid } }).lean();
    return docs.map(doc => this.toEntity(doc as Record<string, unknown>));
  }

  async countByCredentialId(credentialId: string): Promise<number> {
    return ProjectModel.countDocuments({ credentialId });
  }

  async create(data: Omit<IProject, "id" | "createdAt" | "updatedAt">): Promise<IProject> {
    const doc = await ProjectModel.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<IProject | null> {
    // A malformed id names no project: 404, not a cast error.
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await ProjectModel.findById(id).lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async findByUserId(userId: string): Promise<IProject[]> {
    const docs = await ProjectModel.find({ userId }).lean();
    return docs.map(doc => this.toEntity(doc as Record<string, unknown>));
  }

  async findByUserIdPaginated(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: IProject[]; total: number }> {
    const [docs, total] = await Promise.all([
      ProjectModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProjectModel.countDocuments({ userId }),
    ]);
    return {
      items: docs.map(doc => this.toEntity(doc as Record<string, unknown>)),
      total,
    };
  }

  async findAccessibleProjectsPaginated(
    filter: import("../../domain/interfaces/IProjectRepository.js").AccessibleProjectsFilter,
  ): Promise<{ items: IProject[]; total: number }> {
    const conditions: Record<string, unknown>[] = [];

    if (!filter.matchAll) {
      const orClauses: Record<string, unknown>[] = [];
      if (filter.userId) {
        orClauses.push({ userId: filter.userId });
      }
      if (filter.projectIds && filter.projectIds.length > 0) {
        orClauses.push({ _id: { $in: filter.projectIds } });
      }
      if (orClauses.length > 0) {
        conditions.push({ $or: orClauses });
      } else {
        return { items: [], total: 0 };
      }
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim();
      conditions.push({
        $or: [
          { name: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
        ],
      });
    }

    const query =
      conditions.length > 1
        ? { $and: conditions }
        : conditions.length === 1
          ? conditions[0]
          : {};

    const [docs, total] = await Promise.all([
      ProjectModel.find(query)
        .sort({ createdAt: -1 })
        .skip(filter.skip ?? 0)
        .limit(filter.limit ?? 10)
        .lean(),
      ProjectModel.countDocuments(query),
    ]);

    return {
      items: docs.map((doc) => this.toEntity(doc as Record<string, unknown>)),
      total,
    };
  }


  async delete(id: string, userId?: string): Promise<boolean> {
    const filter: Record<string, unknown> = { _id: id };
    if (userId) filter.userId = userId;
    const result = await ProjectModel.deleteOne(filter);
    if (result.deletedCount > 0) {
      // Clean up project members
      // Everything that describes the project goes with it. AI runs stay: they are the cost record of what was spent.
      // Snapshots, evidence and jobs are removed by MiningService.purgeProject.
      const results = await Promise.allSettled([
        ProjectMemberModel.deleteMany({ projectId: id }),
        ChatConversationModel.deleteMany({ projectId: id }),
        OnboardingPathModel.deleteMany({ projectId: id }),
        OnboardingAssignmentModel.deleteMany({ projectId: id }),
        WorkspaceModel.deleteMany({ projectId: id }),
        ArchitectureMappingModel.deleteMany({ projectId: id }),
        ArchitectureReferenceModel.deleteMany({ projectId: id }),
        ApprovalRequestModel.deleteMany({ projectId: id }),
        ProjectReportModel.deleteMany({ projectId: id }),
        ProjectInvitationModel.deleteMany({ projectId: id }),
      ]);
      for (const r of results) {
        if (r.status === "rejected") console.warn(`[projects] cleanup after deleting ${id} failed:`, r.reason);
      }
      return true;
    }
    return false;
  }
}

