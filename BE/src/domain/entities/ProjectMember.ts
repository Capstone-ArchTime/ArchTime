export enum ProjectMemberRole {
  MAINTAINER = "project-maintainer",
  MEMBER = "developer-analyst",
}

export enum MemberStatus {
  ACTIVE = "active",
  INVITED = "invited",
}

export interface IProjectMember {
  id: string;
  projectId: string;
  userId?: string;
  email: string;
  name: string;
  role: ProjectMemberRole;
  status: MemberStatus;
  invitedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
