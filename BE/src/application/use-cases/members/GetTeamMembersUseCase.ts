import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import { UserRole } from "../../../domain/entities/User.js";
import type { ProjectAccessPolicy } from "../../services/ProjectAccessPolicy.js";

/** One person's place in one workspace. `memberId` is what the member routes of that workspace take. */
export interface TeamMembershipDTO {
  projectId: string;
  memberId: string;
  /** "owner" for the workspace owner's own membership, else the membership role. */
  role: string;
  status: "active" | "invited";
}

export interface TeamMemberDTO {
  id: string;
  name: string;
  email: string;
  /** Role and status of the first membership; use `memberships` for anything per workspace. */
  role: string;
  status: "active" | "invited";
  projects: string[];
  memberships: TeamMembershipDTO[];
}

export class GetTeamMembersUseCase {
  constructor(
    private readonly memberRepository: IProjectMemberRepository,
    private readonly projectRepository: IProjectRepository,
    private readonly accessPolicy?: Pick<ProjectAccessPolicy, "readableProjects">,
  ) {}

  /** Workspaces whose team the user manages: owned, maintained, or in an organization they own. */
  private async managedProjectIds(userId: string, userRole: UserRole): Promise<string[]> {
    if (this.accessPolicy) {
      const readable = await this.accessPolicy.readableProjects({ userId, role: userRole });
      return readable.filter(e => e.access.actions.has("admin")).map(e => e.project.id);
    }
    const owned = (await this.projectRepository.findByUserId(userId)).map((p) => p.id);
    const maintained = (await this.memberRepository.findByUserId(userId))
      .filter((m) => m.role === "project-maintainer" && m.status === "active")
      .map((m) => m.projectId);
    return Array.from(new Set([...owned, ...maintained]));
  }

  async execute(params: {
    userId: string;
    userRole: UserRole;
    projectId?: string;
    query?: string;
  }): Promise<TeamMemberDTO[]> {
    const { userId, userRole, query } = params;
    const projectId = params.projectId && params.projectId !== "all" ? params.projectId : undefined;
    const isAdmin = userRole === UserRole.SYSTEM_ADMINISTRATOR;

    // 1. Which workspaces' teams the user may see (an administrator sees all)
    let accessibleProjectIds: string[] | null = null;
    if (!isAdmin) {
      const managed = await this.managedProjectIds(userId, userRole);
      accessibleProjectIds = projectId ? managed.filter((id) => id === projectId) : managed;
      if (accessibleProjectIds.length === 0) return [];
    }

    // 2. Fetch members
    const members = await this.memberRepository.findAll({ projectId, query });
    const visible = accessibleProjectIds ? members.filter((m) => accessibleProjectIds.includes(m.projectId)) : members;

    // 3. Mark each owner's own membership
    const projectIds = Array.from(new Set(visible.map((m) => m.projectId)));
    const ownerOf = new Map((await this.projectRepository.findByIds(projectIds)).map((p) => [p.id, p.userId]));

    // 4. Group by email, keeping every membership
    const memberMap = new Map<string, TeamMemberDTO>();
    for (const m of visible) {
      const role = m.userId && ownerOf.get(m.projectId) === m.userId ? "owner" : m.role;
      const membership: TeamMembershipDTO = { projectId: m.projectId, memberId: m.id, role, status: m.status };
      const existing = memberMap.get(m.email);
      if (existing) {
        if (!existing.projects.includes(m.projectId)) {
          existing.projects.push(m.projectId);
          existing.memberships.push(membership);
        }
      } else {
        memberMap.set(m.email, {
          id: m.id,
          name: m.name,
          email: m.email,
          role,
          status: m.status,
          projects: [m.projectId],
          memberships: [membership],
        });
      }
    }

    return Array.from(memberMap.values());
  }
}
