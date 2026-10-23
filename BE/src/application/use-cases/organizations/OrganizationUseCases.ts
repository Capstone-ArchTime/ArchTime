import {
  OrganizationRole,
  type IOrganization,
  type IOrganizationMember,
} from "../../../domain/entities/Organization.js";
import type { IOrganizationRepository } from "../../../domain/interfaces/IOrganizationRepository.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../shared/errors/AppError.js";

const NAME_MIN = 2;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

export interface OrganizationSummary extends IOrganization {
  myRole: OrganizationRole;
  memberCount: number;
}

export interface OrganizationMemberView extends IOrganizationMember {
  name: string;
  email: string;
}

function parseName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < NAME_MIN || value.trim().length > NAME_MAX) {
    throw new BadRequestError(`Organization name must be ${NAME_MIN}–${NAME_MAX} characters.`, "VALIDATION_ERROR");
  }
  return value.trim();
}

function parseDescription(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > DESCRIPTION_MAX) {
    throw new BadRequestError(`Description must be text of at most ${DESCRIPTION_MAX} characters.`, "VALIDATION_ERROR");
  }
  return value.trim();
}

function parseRole(value: unknown): OrganizationRole {
  if (value === undefined) return OrganizationRole.MEMBER;
  if (!Object.values(OrganizationRole).includes(value as OrganizationRole)) {
    throw new BadRequestError(`Role must be one of: ${Object.values(OrganizationRole).join(", ")}.`, "VALIDATION_ERROR");
  }
  return value as OrganizationRole;
}

/**
 * Organizations, their members and who may manage them. Only members see an organization; only owners change it.
 * A System Administrator is not a member and gets no access here: platform operators do not read organization content.
 */
export class OrganizationUseCases {
  constructor(
    private readonly organizations: IOrganizationRepository,
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly projectMembers: IProjectMemberRepository,
  ) {}

  /** The caller's membership; 404 rather than 403 for non-members so organization ids cannot be probed. */
  async requireMember(organizationId: string, userId: string): Promise<IOrganizationMember> {
    const membership = await this.organizations.findMember(organizationId, userId);
    if (!membership || !(await this.organizations.findById(organizationId))) {
      throw new NotFoundError("Organization not found.");
    }
    return membership;
  }

  async requireOwner(organizationId: string, userId: string): Promise<IOrganizationMember> {
    const membership = await this.requireMember(organizationId, userId);
    if (membership.role !== OrganizationRole.OWNER) {
      throw new ForbiddenError("Only organization owners can do this.");
    }
    return membership;
  }

  async create(input: { userId: string; name: unknown; description?: unknown }): Promise<OrganizationSummary> {
    const name = parseName(input.name);
    const description = parseDescription(input.description);
    const organization = await this.organizations.create({ name, description, createdBy: input.userId });
    await this.organizations.addMember({ organizationId: organization.id, userId: input.userId, role: OrganizationRole.OWNER });
    return { ...organization, myRole: OrganizationRole.OWNER, memberCount: 1 };
  }

  async listMine(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.organizations.listMembershipsOfUser(userId);
    const roleOf = new Map(memberships.map(m => [m.organizationId, m.role]));
    const organizations = await this.organizations.findByIds([...roleOf.keys()]);
    return Promise.all(organizations.map(async org => ({
      ...org,
      myRole: roleOf.get(org.id)!,
      memberCount: (await this.organizations.listMembers(org.id)).length,
    })));
  }

  async get(organizationId: string, userId: string): Promise<OrganizationSummary> {
    const membership = await this.requireMember(organizationId, userId);
    const organization = (await this.organizations.findById(organizationId))!;
    const memberCount = (await this.organizations.listMembers(organizationId)).length;
    return { ...organization, myRole: membership.role, memberCount };
  }

  async update(input: { organizationId: string; userId: string; name?: unknown; description?: unknown }): Promise<IOrganization> {
    await this.requireOwner(input.organizationId, input.userId);
    const patch: { name?: string; description?: string } = {};
    if (input.name !== undefined) patch.name = parseName(input.name);
    if (input.description !== undefined) patch.description = parseDescription(input.description) ?? "";
    if (Object.keys(patch).length === 0) throw new BadRequestError("Nothing to update: send name and/or description.", "VALIDATION_ERROR");
    const updated = await this.organizations.update(input.organizationId, patch);
    if (!updated) throw new NotFoundError("Organization not found.");
    return updated;
  }

  async listMembers(organizationId: string, userId: string): Promise<OrganizationMemberView[]> {
    await this.requireMember(organizationId, userId);
    const members = await this.organizations.listMembers(organizationId);
    return Promise.all(members.map(async m => {
      const user = await this.users.findById(m.userId);
      return { ...m, name: user?.name ?? "(deleted account)", email: user?.email ?? "" };
    }));
  }

  /** Adds an existing account by email. People without an account have to register first. */
  async addMember(input: { organizationId: string; userId: string; email: unknown; role?: unknown }): Promise<OrganizationMemberView> {
    await this.requireOwner(input.organizationId, input.userId);
    if (typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      throw new BadRequestError("A valid email address is required.", "VALIDATION_ERROR");
    }
    const role = parseRole(input.role);
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    if (!user) throw new NotFoundError("No account uses this email. Ask the person to register first.");
    if (await this.organizations.findMember(input.organizationId, user.id)) {
      throw new ConflictError("This person is already a member of the organization.");
    }
    const member = await this.organizations.addMember({ organizationId: input.organizationId, userId: user.id, role, addedBy: input.userId });
    return { ...member, name: user.name, email: user.email };
  }

  async updateMemberRole(input: { organizationId: string; userId: string; memberId: string; role: unknown }): Promise<IOrganizationMember> {
    await this.requireOwner(input.organizationId, input.userId);
    if (input.role === undefined) throw new BadRequestError("Field required: role.", "VALIDATION_ERROR");
    const role = parseRole(input.role);
    const member = await this.organizations.findMemberById(input.organizationId, input.memberId);
    if (!member) throw new NotFoundError("Member not found.");
    if (member.role === role) return member;
    if (member.role === OrganizationRole.OWNER && (await this.organizations.countOwners(input.organizationId)) <= 1) {
      throw new BadRequestError("An organization needs at least one owner. Make someone else an owner first.");
    }
    const updated = await this.organizations.updateMemberRole(member.id, role);
    if (!updated) throw new NotFoundError("Member not found.");
    return updated;
  }

  /**
   * Owners remove members; any member may remove themselves (leave). The person loses every project membership in the
   * organization's projects, and project access checks also require organization membership (see projectRole.ts).
   */
  async removeMember(input: { organizationId: string; userId: string; memberId: string }): Promise<{ removedProjectMemberships: number }> {
    const caller = await this.requireMember(input.organizationId, input.userId);
    const member = await this.organizations.findMemberById(input.organizationId, input.memberId);
    if (!member) throw new NotFoundError("Member not found.");
    if (member.userId !== input.userId && caller.role !== OrganizationRole.OWNER) {
      throw new ForbiddenError("Only organization owners can remove other members.");
    }
    if (member.role === OrganizationRole.OWNER && (await this.organizations.countOwners(input.organizationId)) <= 1) {
      throw new BadRequestError("An organization needs at least one owner. Make someone else an owner first.");
    }
    await this.organizations.removeMember(member.id);
    const projectIds = (await this.projects.findByOrganizationId(input.organizationId)).map(p => p.id);
    const removedProjectMemberships = await this.projectMembers.deleteByUserInProjects(member.userId, projectIds);
    return { removedProjectMemberships };
  }
}
