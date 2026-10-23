import mongoose from "mongoose";
import {
  OrganizationRole,
  type IOrganization,
  type IOrganizationMember,
} from "../../domain/entities/Organization.js";
import type { IOrganizationRepository } from "../../domain/interfaces/IOrganizationRepository.js";
import { OrganizationModel } from "../database/models/OrganizationModel.js";
import { OrganizationMemberModel } from "../database/models/OrganizationMemberModel.js";

const validId = (id: string) => mongoose.isValidObjectId(id);

export class MongoOrganizationRepository implements IOrganizationRepository {
  private toOrganization(doc: Record<string, unknown>): IOrganization {
    return {
      id: String(doc._id),
      name: doc.name as string,
      description: doc.description as string | undefined,
      createdBy: String(doc.createdBy),
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  private toMember(doc: Record<string, unknown>): IOrganizationMember {
    return {
      id: String(doc._id),
      organizationId: String(doc.organizationId),
      userId: String(doc.userId),
      role: doc.role as OrganizationRole,
      addedBy: doc.addedBy ? String(doc.addedBy) : undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async create(data: { name: string; description?: string; createdBy: string }): Promise<IOrganization> {
    const doc = await OrganizationModel.create(data);
    return this.toOrganization(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<IOrganization | null> {
    if (!validId(id)) return null;
    const doc = await OrganizationModel.findById(id).lean();
    return doc ? this.toOrganization(doc as Record<string, unknown>) : null;
  }

  async findByIds(ids: string[]): Promise<IOrganization[]> {
    const valid = ids.filter(validId);
    if (valid.length === 0) return [];
    const docs = await OrganizationModel.find({ _id: { $in: valid } }).sort({ name: 1 }).lean();
    return docs.map(doc => this.toOrganization(doc as Record<string, unknown>));
  }

  async update(id: string, patch: { name?: string; description?: string }): Promise<IOrganization | null> {
    if (!validId(id)) return null;
    const doc = await OrganizationModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    return doc ? this.toOrganization(doc as Record<string, unknown>) : null;
  }

  async addMember(data: { organizationId: string; userId: string; role: OrganizationRole; addedBy?: string }): Promise<IOrganizationMember> {
    const doc = await OrganizationMemberModel.create(data);
    return this.toMember(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findMember(organizationId: string, userId: string): Promise<IOrganizationMember | null> {
    const doc = await OrganizationMemberModel.findOne({ organizationId, userId }).lean();
    return doc ? this.toMember(doc as Record<string, unknown>) : null;
  }

  async findMemberById(organizationId: string, memberId: string): Promise<IOrganizationMember | null> {
    if (!validId(memberId)) return null;
    const doc = await OrganizationMemberModel.findOne({ _id: memberId, organizationId }).lean();
    return doc ? this.toMember(doc as Record<string, unknown>) : null;
  }

  async listMembers(organizationId: string): Promise<IOrganizationMember[]> {
    const docs = await OrganizationMemberModel.find({ organizationId }).sort({ createdAt: 1 }).lean();
    return docs.map(doc => this.toMember(doc as Record<string, unknown>));
  }

  async listMembershipsOfUser(userId: string): Promise<IOrganizationMember[]> {
    const docs = await OrganizationMemberModel.find({ userId }).lean();
    return docs.map(doc => this.toMember(doc as Record<string, unknown>));
  }

  async updateMemberRole(memberId: string, role: OrganizationRole): Promise<IOrganizationMember | null> {
    if (!validId(memberId)) return null;
    const doc = await OrganizationMemberModel.findByIdAndUpdate(memberId, { $set: { role } }, { new: true }).lean();
    return doc ? this.toMember(doc as Record<string, unknown>) : null;
  }

  async removeMember(memberId: string): Promise<boolean> {
    if (!validId(memberId)) return false;
    return !!(await OrganizationMemberModel.findByIdAndDelete(memberId));
  }

  async countOwners(organizationId: string): Promise<number> {
    return OrganizationMemberModel.countDocuments({ organizationId, role: OrganizationRole.OWNER });
  }
}
