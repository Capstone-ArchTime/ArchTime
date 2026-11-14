import mongoose from "mongoose";
import {
  OrganizationMemberStatus,
  OrganizationRole,
  type IOrganization,
  type IOrganizationMember,
} from "../../domain/entities/Organization.js";
import type { IOrganizationRepository } from "../../domain/interfaces/IOrganizationRepository.js";
import { OrganizationModel } from "../database/models/OrganizationModel.js";
import { OrganizationMemberModel } from "../database/models/OrganizationMemberModel.js";

const validId = (id: string) => mongoose.isValidObjectId(id);
/** Memberships written before invitations existed have no status and are active. */
const ACTIVE = { status: { $ne: OrganizationMemberStatus.INVITED } };
const INVITED = { status: OrganizationMemberStatus.INVITED };

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
      status: doc.status === OrganizationMemberStatus.INVITED ? OrganizationMemberStatus.INVITED : OrganizationMemberStatus.ACTIVE,
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

  async addMember(data: { organizationId: string; userId: string; role: OrganizationRole; addedBy?: string; status?: OrganizationMemberStatus }): Promise<IOrganizationMember> {
    const doc = await OrganizationMemberModel.create(data);
    return this.toMember(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findMember(organizationId: string, userId: string): Promise<IOrganizationMember | null> {
    const doc = await OrganizationMemberModel.findOne({ organizationId, userId, ...ACTIVE }).lean();
    return doc ? this.toMember(doc as Record<string, unknown>) : null;
  }

  async findMemberOrInvitation(organizationId: string, userId: string): Promise<IOrganizationMember | null> {
    const doc = await OrganizationMemberModel.findOne({ organizationId, userId }).lean();
    return doc ? this.toMember(doc as Record<string, unknown>) : null;
  }

  async listInvited(organizationId: string): Promise<IOrganizationMember[]> {
    const docs = await OrganizationMemberModel.find({ organizationId, ...INVITED }).sort({ createdAt: 1 }).lean();
    return docs.map(doc => this.toMember(doc as Record<string, unknown>));
  }

  async listInvitationsOfUser(userId: string): Promise<IOrganizationMember[]> {
    const docs = await OrganizationMemberModel.find({ userId, ...INVITED }).sort({ createdAt: -1 }).lean();
    return docs.map(doc => this.toMember(doc as Record<string, unknown>));
  }

  async activateMember(memberId: string): Promise<IOrganizationMember | null> {
    if (!validId(memberId)) return null;
    const doc = await OrganizationMemberModel.findOneAndUpdate({ _id: memberId, ...INVITED }, { $set: { status: OrganizationMemberStatus.ACTIVE } }, { new: true }).lean();
    return doc ? this.toMember(doc as Record<string, unknown>) : null;
  }

  async findMemberById(organizationId: string, memberId: string): Promise<IOrganizationMember | null> {
    if (!validId(memberId)) return null;
    const doc = await OrganizationMemberModel.findOne({ _id: memberId, organizationId }).lean();
    return doc ? this.toMember(doc as Record<string, unknown>) : null;
  }

  async listMembers(organizationId: string): Promise<IOrganizationMember[]> {
    const docs = await OrganizationMemberModel.find({ organizationId, ...ACTIVE }).sort({ createdAt: 1 }).lean();
    return docs.map(doc => this.toMember(doc as Record<string, unknown>));
  }

  async listMembershipsOfUser(userId: string): Promise<IOrganizationMember[]> {
    const docs = await OrganizationMemberModel.find({ userId, ...ACTIVE }).lean();
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
    return OrganizationMemberModel.countDocuments({ organizationId, role: OrganizationRole.OWNER, ...ACTIVE });
  }

  async findPaginated(filter: { page: number; limit: number; search?: string }): Promise<{ items: IOrganization[]; total: number }> {
    const query: Record<string, unknown> = {};
    const search = filter.search?.trim();
    if (search) query.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const [docs, total] = await Promise.all([
      OrganizationModel.find(query).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit).lean(),
      OrganizationModel.countDocuments(query),
    ]);
    return { items: docs.map(doc => this.toOrganization(doc as Record<string, unknown>)), total };
  }
}
