import type { IProject, ProjectStatus, RepoVisibility } from "../../domain/entities/Project.js";
import type { IProjectRepository } from "../../domain/interfaces/IProjectRepository.js";
import { ProjectModel } from "../database/models/ProjectModel.js";

export class MongoProjectRepository implements IProjectRepository {
  private toEntity(doc: Record<string, unknown>): IProject {
    return {
      id: String(doc._id),
      name: doc.name as string,
      description: doc.description as string | undefined,
      repoUrl: doc.repoUrl as string,
      visibility: doc.visibility as RepoVisibility,
      token: doc.token as string | undefined,
      status: doc.status as ProjectStatus,
      history: doc.history as IProject["history"],
      userId: String(doc.userId),
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async create(data: Omit<IProject, "id" | "createdAt" | "updatedAt">): Promise<IProject> {
    const doc = await ProjectModel.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<IProject | null> {
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

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await ProjectModel.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }
}
