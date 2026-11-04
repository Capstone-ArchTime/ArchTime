import type { IProject } from "../../domain/entities/Project.js";
import type { IOrganizationRepository } from "../../domain/interfaces/IOrganizationRepository.js";
import { ForbiddenError } from "../../shared/errors/AppError.js";

export type OrganizationMembershipLookup = Pick<IOrganizationRepository, "findMember">;

/**
 * A project of an organization is only open to the organization's members (ProjectAccessPolicy). A project role given to
 * anyone else would do nothing now, and would come back to life if the person were added to the organization later, so it
 * is refused where it is handed out: direct adds, invitations, and accepting an invitation.
 */
export async function requireOrganizationMember(
  project: Pick<IProject, "organizationId">,
  userId: string | undefined,
  organizations: OrganizationMembershipLookup | undefined,
  message = "This person is not a member of the organization that owns this workspace. Add them to the organization first.",
): Promise<void> {
  if (!project.organizationId || !organizations) return;
  const member = userId ? await organizations.findMember(project.organizationId, userId) : null;
  if (!member) throw new ForbiddenError(message);
}
