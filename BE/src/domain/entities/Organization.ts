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
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
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
