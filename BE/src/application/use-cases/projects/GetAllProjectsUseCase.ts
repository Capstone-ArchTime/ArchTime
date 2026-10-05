import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProject } from "../../../domain/entities/Project.js";
import { UserRole } from "../../../domain/entities/User.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";

export interface GetAllProjectsRequest {
  userId: string;
  userRole?: UserRole;
  scope?: "all" | "managed" | "participating" | "owned";
  search?: string;
  skip?: number;
  limit?: number;
}

export interface ProjectItemDTO extends IProject {
  userRole: "owner" | "project-maintainer" | "developer-analyst" | "system-administrator" | "viewer";
  isOwner: boolean;
  isMaintainer: boolean;
}

export class GetAllProjectsUseCase {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memberRepository?: IProjectMemberRepository,
  ) {}

  async execute(
    paramsOrUserId: string | GetAllProjectsRequest,
    skipParam = 0,
    limitParam = 10,
  ): Promise<PaginatedResult<ProjectItemDTO>> {
    let params: GetAllProjectsRequest;

    if (typeof paramsOrUserId === "string") {
      params = {
        userId: paramsOrUserId,
        skip: skipParam,
        limit: limitParam,
        scope: "all",
      };
    } else {
      params = {
        ...paramsOrUserId,
        skip: paramsOrUserId.skip ?? skipParam,
        limit: paramsOrUserId.limit ?? limitParam,
        scope: paramsOrUserId.scope ?? "all",
      };
    }

    const { userId, userRole, scope, search, skip, limit } = params;

    // 1. Fetch user's project memberships
    const memberships = this.memberRepository
      ? await this.memberRepository.findByUserId(userId)
      : [];

    const memberRoleMap = new Map<string, string>();
    for (const m of memberships) {
      memberRoleMap.set(m.projectId, m.role);
    }

    // 2. Prepare filter according to requested scope
    let projectIds: string[] | undefined;
    let queryUserId: string | undefined = userId;
    let matchAll = false;

    if (scope === "owned") {
      queryUserId = userId;
      projectIds = undefined;
    } else if (scope === "managed") {
      queryUserId = userId;
      projectIds = memberships
        .filter((m) => m.role === "project-maintainer")
        .map((m) => m.projectId);
    } else if (scope === "participating") {
      queryUserId = undefined; // only participating, not owned
      projectIds = memberships
        .filter((m) => m.role === "developer-analyst")
        .map((m) => m.projectId);
    } else {
      // scope === "all"
      if (userRole === UserRole.SYSTEM_ADMINISTRATOR) {
        matchAll = true;
        queryUserId = undefined;
        projectIds = undefined;
      } else {
        queryUserId = userId;
        projectIds = memberships.map((m) => m.projectId);
      }
    }

    const { items, total } =
      await this.projectRepository.findAccessibleProjectsPaginated({
        userId: queryUserId,
        projectIds,
        matchAll,
        search,
        skip: skip ?? 0,
        limit: limit ?? 10,
      });

    // 3. Enrich items with user role context
    const enrichedItems: ProjectItemDTO[] = items.map((project) => {
      const isOwner = project.userId === userId;
      const mRole = memberRoleMap.get(project.id);

      let effectiveRole: ProjectItemDTO["userRole"] = "viewer";
      if (isOwner) {
        effectiveRole = "owner";
      } else if (mRole === "project-maintainer") {
        effectiveRole = "project-maintainer";
      } else if (mRole === "developer-analyst") {
        effectiveRole = "developer-analyst";
      } else if (userRole === UserRole.SYSTEM_ADMINISTRATOR) {
        effectiveRole = "system-administrator";
      }

      const isMaintainer =
        isOwner ||
        effectiveRole === "project-maintainer" ||
        effectiveRole === "system-administrator";

      return {
        ...project,
        userRole: effectiveRole,
        isOwner,
        isMaintainer,
      };
    });

    return {
      items: enrichedItems,
      total,
    };
  }
}
