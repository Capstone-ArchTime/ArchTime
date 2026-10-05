import type {
  IProjectMember,
  ProjectMemberRole,
} from "../../domain/entities/ProjectMember.js";
import type { IProjectMemberRepository } from "../../domain/interfaces/IProjectMemberRepository.js";
import { ProjectMemberModel } from "../database/models/ProjectMemberModel.js";

export class MongoProjectMemberRepository implements IProjectMemberRepository {
  private toEntity(doc: Record<string, unknown>): IProjectMember {
    return {
      id: ((doc._id as { toString(): string })?.toString() ?? doc.id) as string,
      projectId: doc.projectId as string,
      userId: doc.userId as string | undefined,
      email: doc.email as string,
      name: doc.name as string,
      role: doc.role as ProjectMemberRole,
      status: doc.status as IProjectMember["status"],
      invitedBy: doc.invitedBy as string | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async addMember(
    member: Omit<IProjectMember, "id" | "createdAt" | "updatedAt">,
  ): Promise<IProjectMember> {
    const doc = await ProjectMemberModel.create({
      ...member,
      email: member.email.toLowerCase().trim(),
    });
    return this.toEntity(doc.toJSON());
  }

  async findByProjectAndEmail(
    projectId: string,
    email: string,
  ): Promise<IProjectMember | null> {
    const doc = await ProjectMemberModel.findOne({
      projectId,
      email: email.toLowerCase().trim(),
    }).lean();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async findByProjectAndUserId(
    projectId: string,
    userId: string,
  ): Promise<IProjectMember | null> {
    const doc = await ProjectMemberModel.findOne({
      projectId,
      userId,
    }).lean();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async findByProjectId(projectId: string): Promise<IProjectMember[]> {
    const docs = await ProjectMemberModel.find({ projectId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((doc) => this.toEntity(doc as Record<string, unknown>));
  }

  async findByUserId(userId: string): Promise<IProjectMember[]> {
    const docs = await ProjectMemberModel.find({
      userId,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((doc) => this.toEntity(doc as Record<string, unknown>));
  }

  async findAll(filter?: {
    projectId?: string;
    query?: string;
  }): Promise<IProjectMember[]> {
    const conditions: Record<string, unknown> = {};

    if (filter?.projectId && filter.projectId !== "all") {
      conditions.projectId = filter.projectId;
    }

    if (filter?.query?.trim()) {
      const q = filter.query.trim();
      conditions.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const docs = await ProjectMemberModel.find(conditions)
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((doc) => this.toEntity(doc as Record<string, unknown>));
  }

  async updateRole(
    id: string,
    role: ProjectMemberRole,
  ): Promise<IProjectMember | null> {
    const doc = await ProjectMemberModel.findByIdAndUpdate(
      id,
      { role },
      { new: true },
    ).lean();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await ProjectMemberModel.findByIdAndDelete(id);
    return !!result;
  }

  async deleteByProjectAndId(
    projectId: string,
    memberId: string,
  ): Promise<boolean> {
    const result = await ProjectMemberModel.deleteOne({
      _id: memberId,
      projectId,
    });
    return result.deletedCount > 0;
  }
}
