export enum OrganizationRole {
  /** Manages the organization, its members and credentials; has maintainer rights on every project of the organization. */
  OWNER = "owner",
  /** Belongs to the organization; what they may do in a project comes from their project role. */
  MEMBER = "member",
}

export interface IOrganization {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  /**
   * Set while a System Administrator has suspended the organization (RF-14, UC-25): its workspaces are closed to
   * everyone and its owners cannot change it, until it is reactivated. Null or absent: active.
   */
  suspension?: OrganizationSuspension | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSuspension {
  at: Date;
  /** The System Administrator who suspended it. */
  by: string;
  reason: string;
}

export const isSuspended = (org: Pick<IOrganization, "suspension"> | null | undefined): boolean => !!org?.suspension;

/** An invited person is not a member yet: they get no access until they accept (UC-28). */
export enum OrganizationMemberStatus {
  INVITED = "invited",
  ACTIVE = "active",
}

export interface IOrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  /** Missing on memberships created before invitations existed: those are active. */
  status: OrganizationMemberStatus;
  addedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum CredentialProvider {
  GITHUB = "github",
  GITLAB = "gitlab",
  BITBUCKET = "bitbucket",
  OTHER = "other",
}

/**
 * A repository access token owned by the organization rather than by an employee, so projects keep working when the
 * person who added it leaves. The token itself is stored encrypted and never leaves the server; only its last four
 * characters are shown.
 */
export interface IOrganizationCredential {
  id: string;
  organizationId: string;
  name: string;
  provider: CredentialProvider;
  last4: string;
  createdBy: string;
  rotatedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
