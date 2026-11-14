import type { NotifierDirectory, Recipient } from "../../application/use-cases/conformance/FindingNotifier.js";
import { ProjectModel } from "../database/models/ProjectModel.js";
import { ProjectMemberModel } from "../database/models/ProjectMemberModel.js";
import { OrganizationMemberModel } from "../database/models/OrganizationMemberModel.js";
import { UserModel } from "../database/models/UserModel.js";
import { MemberStatus, ProjectMemberRole } from "../../domain/entities/ProjectMember.js";
import { OrganizationMemberStatus, OrganizationRole } from "../../domain/entities/Organization.js";
import { UserStatus } from "../../domain/entities/User.js";

/** Who hears about conformance findings (BR-34): the project owner, its active maintainers and its organization's owners. */
export const mongoConformanceDirectory: NotifierDirectory = {
  async projectName(projectId) {
    const project = await ProjectModel.findById(projectId).select("name").lean<{ name: string }>().catch(() => null);
    return project?.name ?? null;
  },
  async recipients(projectId) {
    const project = await ProjectModel.findById(projectId).select("userId organizationId").lean<{ userId?: string; organizationId?: string | null }>().catch(() => null);
    if (!project) return [];
    const [maintainers, orgOwners] = await Promise.all([
      ProjectMemberModel.find({ projectId, role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE }).select("userId").lean<{ userId: string }[]>(),
      project.organizationId
        ? OrganizationMemberModel.find({ organizationId: project.organizationId, role: OrganizationRole.OWNER, status: OrganizationMemberStatus.ACTIVE }).select("userId").lean<{ userId: string }[]>()
        : Promise.resolve([]),
    ]);
    const ids = [...new Set([project.userId, ...maintainers.map(m => m.userId), ...orgOwners.map(o => o.userId)].filter((id): id is string => !!id).map(String))];
    const users = await UserModel.find({ _id: { $in: ids }, status: UserStatus.ACTIVE, isVerified: true }).select("email name").lean<{ email: string; name: string }[]>();
    const seen = new Set<string>();
    return users.filter(u => u.email && !seen.has(u.email.toLowerCase()) && seen.add(u.email.toLowerCase())).map((u): Recipient => ({ email: u.email, name: u.name }));
  },
};
