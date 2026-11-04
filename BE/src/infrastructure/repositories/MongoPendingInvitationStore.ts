import type { PendingInvitationStore } from "../../application/use-cases/organizations/OrganizationUseCases.js";
import { InvitationStatus } from "../../domain/entities/ProjectInvitation.js";
import { ProjectInvitationModel } from "../database/models/ProjectInvitationModel.js";

/** Withdraws invitations as CancelProjectInvitationUseCase does: the pending record is deleted, so its link stops working. */
export class MongoPendingInvitationStore implements PendingInvitationStore {
  async cancelPending(projectIds: string[], email: string): Promise<number> {
    if (!projectIds.length) return 0;
    const result = await ProjectInvitationModel.deleteMany({ projectId: { $in: projectIds }, email, status: InvitationStatus.PENDING });
    return result.deletedCount ?? 0;
  }
}
