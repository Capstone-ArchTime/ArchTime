import { ProjectMemberRole } from "./ProjectMember.js";

export enum InvitationStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  DECLINED = "declined",
  EXPIRED = "expired",
}

export interface IProjectInvitation {
  id: string;
  projectId: string;
  email: string;
  role: ProjectMemberRole;
  token: string;
  invitedBy: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
