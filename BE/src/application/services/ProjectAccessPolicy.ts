import type { IProject } from "../../domain/entities/Project.js";
import { RepoVisibility } from "../../domain/entities/Project.js";
import { UserRole } from "../../domain/entities/User.js";
import { MemberStatus, ProjectMemberRole } from "../../domain/entities/ProjectMember.js";
import { OrganizationRole } from "../../domain/entities/Organization.js";
import type { IProjectRepository } from "../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../domain/interfaces/IProjectMemberRepository.js";
import type { IOrganizationRepository } from "../../domain/interfaces/IOrganizationRepository.js";
import { ForbiddenError, NotFoundError } from "../../shared/errors/AppError.js";

/**
 * metadata – name, status, mining progress; what a platform operator may see of any project
 * read     – history, snapshots, evidence, maps, ADRs, the mentor
 * write    – maintainer work: scan, mine, cluster, refine, ADRs, rules, diagram
 * admin    – manage the project's members, invitations and approvals
 * owner    – delete the project
 */
export type ProjectAction = "metadata" | "read" | "write" | "admin" | "owner";

export type ProjectAccessRole =
  | "owner"
  | "organization-owner"
  | "project-maintainer"
  | "developer-analyst"
  | "system-administrator"
  | "viewer";

export interface ProjectAccess {
  role: ProjectAccessRole | null;
  actions: ReadonlySet<ProjectAction>;
  /** The membership role to expose on the request, as before this policy existed. */
  memberRole?: ProjectMemberRole | "owner";
}

const set = (...a: ProjectAction[]): ReadonlySet<ProjectAction> => new Set(a);
const EVERYTHING = set("metadata", "read", "write", "admin", "owner");
const MAINTAINER = set("metadata", "read", "write", "admin");
const READER = set("metadata", "read");
const NOTHING = set();

export interface AccessUser { userId: string; role: UserRole | string }

/**
 * Who may do what in a project (system overview §4):
 * 1. System Administrator: operates the platform. Personal projects: everything but deleting. Organization projects:
 *    metadata only, never their content.
 * 2. Organization projects are visible to members of their organization only; leaving the organization ends access,
 *    project ownership included.
 * 3. Organization Owner: maintainer rights on every project of the organization, and may delete them.
 * 4. Project Owner: everything.
 * 5. Project Maintainer: read, write, admin. Project Member: read.
 * 6. Public personal projects: read for any signed-in user (viewer).
 */
export class ProjectAccessPolicy {
  constructor(
    private readonly projects: Pick<IProjectRepository, "findById" | "findByUserId" | "findByOrganizationId" | "findByIds">,
    private readonly members: Pick<IProjectMemberRepository, "findByProjectAndUserId" | "findByUserId">,
    private readonly organizations?: Pick<IOrganizationRepository, "findMember" | "listMembershipsOfUser">,
  ) {}

  async evaluate(project: IProject, user: AccessUser): Promise<ProjectAccess> {
    if (user.role === UserRole.SYSTEM_ADMINISTRATOR) {
      return { role: "system-administrator", actions: project.organizationId ? set("metadata") : MAINTAINER };
    }

    if (project.organizationId) {
      const orgMember = this.organizations ? await this.organizations.findMember(project.organizationId, user.userId) : null;
      if (!orgMember) return { role: null, actions: NOTHING };
      if (orgMember.role === OrganizationRole.OWNER) {
        return project.userId === user.userId
          ? { role: "owner", actions: EVERYTHING, memberRole: "owner" }
          : { role: "organization-owner", actions: EVERYTHING, memberRole: ProjectMemberRole.MAINTAINER };
      }
    }

    if (project.userId === user.userId) return { role: "owner", actions: EVERYTHING, memberRole: "owner" };

    const member = await this.members.findByProjectAndUserId(project.id, user.userId);
    if (member && member.status === MemberStatus.ACTIVE) {
      return member.role === ProjectMemberRole.MAINTAINER
        ? { role: "project-maintainer", actions: MAINTAINER, memberRole: member.role }
        : { role: "developer-analyst", actions: READER, memberRole: member.role };
    }

    if (!project.organizationId && project.visibility === RepoVisibility.PUBLIC) {
      return { role: "viewer", actions: READER };
    }
    return { role: null, actions: NOTHING };
  }

  /** The project and the caller's access to it; null when the project does not exist. */
  async accessTo(projectId: string, user: AccessUser): Promise<{ project: IProject; access: ProjectAccess } | null> {
    const project = await this.projects.findById(projectId);
    return project ? { project, access: await this.evaluate(project, user) } : null;
  }

  /** Throws 404 when the project does not exist and 403 when the action is not allowed. */
  async require(projectId: string, user: AccessUser, action: ProjectAction): Promise<{ project: IProject; access: ProjectAccess }> {
    const found = await this.accessTo(projectId, user);
    if (!found) throw new NotFoundError("Workspace not found.");
    if (!found.access.actions.has(action)) throw new ForbiddenError(deniedMessage(found.access, action));
    return found;
  }

  /**
   * Every project the user may read, with their access: owned and joined projects, plus all projects of the
   * organizations they own. Public projects of other people are not listed (they are opened by link).
   */
  async readableProjects(user: AccessUser): Promise<{ project: IProject; access: ProjectAccess }[]> {
    const [owned, memberships, orgMemberships] = await Promise.all([
      this.projects.findByUserId(user.userId),
      this.members.findByUserId(user.userId),
      this.organizations ? this.organizations.listMembershipsOfUser(user.userId) : Promise.resolve([]),
    ]);
    const ownedOrgIds = orgMemberships.filter(m => m.role === OrganizationRole.OWNER).map(m => m.organizationId);
    const [joined, ...orgProjects] = await Promise.all([
      this.projects.findByIds(memberships.filter(m => m.status === MemberStatus.ACTIVE).map(m => m.projectId)),
      ...ownedOrgIds.map(id => this.projects.findByOrganizationId(id)),
    ]);
    const unique = new Map<string, IProject>();
    for (const p of [...owned, ...joined, ...orgProjects.flat()]) unique.set(p.id, p);
    const evaluated = await Promise.all([...unique.values()].map(async project => ({ project, access: await this.evaluate(project, user) })));
    return evaluated.filter(e => e.access.actions.has("read"));
  }
}

export function deniedMessage(access: ProjectAccess, action: ProjectAction): string {
  if (!access.actions.has("metadata")) return "Forbidden: you do not have permission to access this workspace.";
  if (access.role === "system-administrator") {
    return action === "owner"
      ? "Forbidden: only the workspace owner or an owner of its organization can delete it."
      : "Forbidden: System Administrators cannot read the content of an organization's workspace.";
  }
  if (action === "owner") return "Forbidden: only the workspace owner or an owner of its organization can delete it.";
  return "Forbidden: only project maintainers can perform this action.";
}
