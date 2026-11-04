import { OrganizationRole, type IOrganization } from "../../../domain/entities/Organization.js";
import type { IProject, ProjectStatus, RepoVisibility } from "../../../domain/entities/Project.js";
import type { IOrganizationRepository } from "../../../domain/interfaces/IOrganizationRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/utils/apiResponse.js";

/**
 * Organizations as a System Administrator sees them: who runs each one and how big it is. Metadata only. A project
 * appears with what an operator may see of any organization project (ProjectAccessPolicy "metadata": name, status,
 * mining progress), never its repository address, description, token, code, evidence, maps or decisions.
 */

export interface AdminPerson { userId: string; name: string | null; email: string | null }

export interface AdminOrganizationSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  createdBy: AdminPerson;
  owners: AdminPerson[];
  memberCount: number;
  projectCount: number;
}

export interface AdminOrganizationProject {
  id: string;
  name: string;
  status: ProjectStatus;
  visibility: RepoVisibility;
  totalCommits: number | null;
  createdAt: Date;
}

export interface AdminOrganizationDetail extends AdminOrganizationSummary {
  members: (AdminPerson & { role: OrganizationRole; joinedAt: Date })[];
  projects: AdminOrganizationProject[];
}

const MAX_LIMIT = 50;

/** The fields of a project an operator may see; everything else is left out on purpose, not by accident. */
export function projectMetadata(p: IProject): AdminOrganizationProject {
  return { id: p.id, name: p.name, status: p.status, visibility: p.visibility, totalCommits: p.history?.totalCommits ?? null, createdAt: p.createdAt };
}

export class GetAdminOrganizationsUseCase {
  constructor(
    private readonly organizations: Pick<IOrganizationRepository, "findPaginated" | "findById" | "listMembers">,
    private readonly projects: Pick<IProjectRepository, "findByOrganizationId">,
    private readonly users: Pick<IUserRepository, "findById">,
  ) {}

  private async person(userId: string, cache: Map<string, Promise<AdminPerson>>): Promise<AdminPerson> {
    let found = cache.get(userId);
    if (!found) {
      found = this.users.findById(userId).then(u => ({ userId, name: u?.name ?? null, email: u?.email ?? null }), () => ({ userId, name: null, email: null }));
      cache.set(userId, found);
    }
    return found;
  }

  private async describe(org: IOrganization, cache: Map<string, Promise<AdminPerson>>) {
    const [members, projects] = await Promise.all([this.organizations.listMembers(org.id), this.projects.findByOrganizationId(org.id)]);
    const [createdBy, owners] = await Promise.all([
      this.person(org.createdBy, cache),
      Promise.all(members.filter(m => m.role === OrganizationRole.OWNER).map(m => this.person(m.userId, cache))),
    ]);
    const summary: AdminOrganizationSummary = {
      id: org.id, name: org.name, description: org.description ?? null, createdAt: org.createdAt, createdBy, owners,
      memberCount: members.length, projectCount: projects.length,
    };
    return { summary, members, projects };
  }

  async list(input: { page?: unknown; limit?: unknown; search?: unknown }): Promise<{ organizations: AdminOrganizationSummary[]; meta: PaginationMeta }> {
    const page = Math.max(1, Math.floor(Number(input.page)) || 1);
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(input.limit)) || 10));
    const search = typeof input.search === "string" ? input.search.slice(0, 100) : undefined;
    const { items, total } = await this.organizations.findPaginated({ page, limit, search });
    const cache = new Map<string, Promise<AdminPerson>>();
    const organizations = await Promise.all(items.map(async org => (await this.describe(org, cache)).summary));
    return { organizations, meta: buildPaginationMeta(total, page, limit) };
  }

  async get(organizationId: string): Promise<AdminOrganizationDetail> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundError("Organization not found.");
    const cache = new Map<string, Promise<AdminPerson>>();
    const { summary, members, projects } = await this.describe(org, cache);
    return {
      ...summary,
      members: await Promise.all(members.map(async m => ({ ...(await this.person(m.userId, cache)), role: m.role, joinedAt: m.createdAt }))),
      projects: projects.map(projectMetadata),
    };
  }
}
