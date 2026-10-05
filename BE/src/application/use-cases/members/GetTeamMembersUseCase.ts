import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import { UserRole } from "../../../domain/entities/User.js";

export interface TeamMemberDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited";
  projects: string[];
}

export class GetTeamMembersUseCase {
  constructor(
    private readonly memberRepository: IProjectMemberRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(params: {
    userId: string;
    userRole: UserRole;
    projectId?: string;
    query?: string;
  }): Promise<TeamMemberDTO[]> {
    const { userId, userRole, projectId, query } = params;

    // 1. Determine which projects the user has access to see team for
    let accessibleProjectIds: string[] = [];

    if (userRole === UserRole.SYSTEM_ADMINISTRATOR) {
      // Admin sees all projects
      if (projectId && projectId !== "all") {
        accessibleProjectIds = [projectId];
      }
    } else {
      // Maintainer sees projects they own or maintain
      const userProjects = await this.projectRepository.findByUserId(userId);
      const ownedIds = userProjects.map((p) => p.id);

      const memberships = await this.memberRepository.findByUserId(userId);
      const maintainedIds = memberships
        .filter((m) => m.role === "project-maintainer")
        .map((m) => m.projectId);

      const allIds = Array.from(new Set([...ownedIds, ...maintainedIds]));

      if (projectId && projectId !== "all") {
        accessibleProjectIds = allIds.includes(projectId) ? [projectId] : [];
      } else {
        accessibleProjectIds = allIds;
      }
    }

    // 2. Fetch members
    const filter: { projectId?: string; query?: string } = {};
    if (projectId && projectId !== "all") {
      filter.projectId = projectId;
    }
    if (query) {
      filter.query = query;
    }

    const members = await this.memberRepository.findAll(filter);

    // 3. Filter by accessible projects if not system admin
    const filteredMembers =
      userRole === UserRole.SYSTEM_ADMINISTRATOR && (!projectId || projectId === "all")
        ? members
        : members.filter((m) => accessibleProjectIds.includes(m.projectId));

    // 4. Group by email to aggregate projects array
    const memberMap = new Map<string, TeamMemberDTO>();

    for (const m of filteredMembers) {
      const existing = memberMap.get(m.email);
      if (existing) {
        if (!existing.projects.includes(m.projectId)) {
          existing.projects.push(m.projectId);
        }
      } else {
        memberMap.set(m.email, {
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          status: m.status,
          projects: [m.projectId],
        });
      }
    }

    return Array.from(memberMap.values());
  }
}
