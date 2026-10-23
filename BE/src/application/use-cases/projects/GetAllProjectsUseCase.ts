import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProject } from "../../../domain/entities/Project.js";
import { UserRole } from "../../../domain/entities/User.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";
import type { ProjectAccess, ProjectAccessPolicy } from "../../services/ProjectAccessPolicy.js";

/** Clients know five role labels; an organization owner works as a maintainer. */
const roleLabel = (access: ProjectAccess): ProjectItemDTO["userRole"] =>
  access.role === "organization-owner" ? "project-maintainer" : access.role ?? "viewer";

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
    private readonly accessPolicy?: Pick<ProjectAccessPolicy, "readableProjects">,
  ) {}

  /**
   * Lists what the user may read according to ProjectAccessPolicy: organization projects of organizations they left
   * drop out, and organization owners see every project of their organizations.
   */
  private async listReadable(params: GetAllProjectsRequest): Promise<PaginatedResult<ProjectItemDTO>> {
    const readable = await this.accessPolicy!.readableProjects({ userId: params.userId, role: params.userRole ?? UserRole.USER });
    const inScope = readable.filter(({ project, access }) => {
      switch (params.scope) {
        case "owned": return project.userId === params.userId && access.role === "owner";
        case "managed": return access.actions.has("write");
        case "participating": return access.role === "developer-analyst";
        default: return true;
      }
    });
    const accessById = new Map(inScope.map(e => [e.project.id, e.access]));
    const { items, total } = await this.projectRepository.findAccessibleProjectsPaginated({
      projectIds: [...accessById.keys()],
      search: params.search,
      skip: params.skip ?? 0,
      limit: params.limit ?? 10,
    });
    return {
      items: items.map((project) => {
        const access = accessById.get(project.id)!;
        return {
          ...project,
          userRole: roleLabel(access),
          isOwner: access.role === "owner",
          isMaintainer: access.actions.has("write"),
        };
      }),
      total,
    };
  }

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

    if (this.accessPolicy && userRole !== UserRole.SYSTEM_ADMINISTRATOR) {
      return this.listReadable(params);
    }

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
