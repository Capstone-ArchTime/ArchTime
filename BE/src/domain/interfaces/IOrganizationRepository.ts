import type {
  CredentialProvider,
  IOrganization,
  IOrganizationCredential,
  IOrganizationMember,
  OrganizationMemberStatus,
  OrganizationRole,
} from "../entities/Organization.js";

export interface IOrganizationRepository {
  create(data: { name: string; description?: string; createdBy: string }): Promise<IOrganization>;
  findById(id: string): Promise<IOrganization | null>;
  findByIds(ids: string[]): Promise<IOrganization[]>;
  update(id: string, patch: { name?: string; description?: string }): Promise<IOrganization | null>;

  addMember(data: { organizationId: string; userId: string; role: OrganizationRole; addedBy?: string; status?: OrganizationMemberStatus }): Promise<IOrganizationMember>;
  /** Active members only: an invitation gives no access. The same holds for listMembers, listMembershipsOfUser, countOwners. */
  findMember(organizationId: string, userId: string): Promise<IOrganizationMember | null>;
  /** An active membership or a pending invitation. */
  findMemberOrInvitation(organizationId: string, userId: string): Promise<IOrganizationMember | null>;
  listInvited(organizationId: string): Promise<IOrganizationMember[]>;
  listInvitationsOfUser(userId: string): Promise<IOrganizationMember[]>;
  activateMember(memberId: string): Promise<IOrganizationMember | null>;
  findMemberById(organizationId: string, memberId: string): Promise<IOrganizationMember | null>;
  listMembers(organizationId: string): Promise<IOrganizationMember[]>;
  listMembershipsOfUser(userId: string): Promise<IOrganizationMember[]>;
  updateMemberRole(memberId: string, role: OrganizationRole): Promise<IOrganizationMember | null>;
  removeMember(memberId: string): Promise<boolean>;
  countOwners(organizationId: string): Promise<number>;
  /** Every organization, newest first, for platform administration; `search` matches the name. */
  findPaginated(filter: { page: number; limit: number; search?: string }): Promise<{ items: IOrganization[]; total: number }>;
}

/** Secrets go in as plain text and come back only through resolveSecret; encryption is the repository's concern. */
export interface IOrganizationCredentialRepository {
  create(data: { organizationId: string; name: string; provider: CredentialProvider; secret: string; createdBy: string }): Promise<IOrganizationCredential>;
  findById(organizationId: string, credentialId: string): Promise<IOrganizationCredential | null>;
  list(organizationId: string): Promise<IOrganizationCredential[]>;
  rotate(organizationId: string, credentialId: string, secret: string): Promise<IOrganizationCredential | null>;
  delete(organizationId: string, credentialId: string): Promise<boolean>;
  /** The decrypted token, for cloning only; null when the credential no longer exists. */
  resolveSecret(credentialId: string): Promise<string | null>;
}
