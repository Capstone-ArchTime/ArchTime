import { randomBytes } from "node:crypto";
import { ProjectInvitationModel } from "../../../infrastructure/database/models/ProjectInvitationModel.js";
import {
  InvitationStatus,
  type IProjectInvitation,
} from "../../../domain/entities/ProjectInvitation.js";
import { ProjectMemberRole, MemberStatus } from "../../../domain/entities/ProjectMember.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import type { IEmailService } from "../../../domain/interfaces/IEmailService.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../../shared/errors/AppError.js";
import { requireOrganizationMember, type OrganizationMembershipLookup } from "../../services/organizationGate.js";

export interface InviteMemberTokenInput {
  projectId: string;
  email: string;
  role?: ProjectMemberRole;
  invitedBy: string;
}

export class InviteProjectMemberTokenUseCase {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memberRepository: IProjectMemberRepository,
    private readonly userRepository: IUserRepository,
    private readonly emailService?: IEmailService,
    /** Where the frontend runs; the email links to its /invitations/accept page. */
    private readonly frontendUrl = "http://localhost:5173",
    private readonly organizations?: OrganizationMembershipLookup,
  ) {}

  async execute(input: InviteMemberTokenInput): Promise<IProjectInvitation> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Workspace not found.");

    const email = input.email?.trim().toLowerCase();
    if (!email) throw new BadRequestError("Recipient email is required.");

    // Check if already a member
    const existingUser = await this.userRepository.findByEmail(email);
    await requireOrganizationMember(project, existingUser?.id, this.organizations);
    if (existingUser) {
      const isMember = await this.memberRepository.findByProjectAndUserId(input.projectId, existingUser.id);
      if (isMember) {
        throw new ConflictError("User is already a member of this workspace.");
      }
    }

    // Cancel previous pending invitation for this email on this project
    await ProjectInvitationModel.deleteMany({
      projectId: input.projectId,
      email,
      status: InvitationStatus.PENDING,
    });

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await ProjectInvitationModel.create({
      projectId: input.projectId,
      email,
      role: input.role ?? ProjectMemberRole.MEMBER,
      token,
      invitedBy: input.invitedBy,
      status: InvitationStatus.PENDING,
      expiresAt,
    });

    if (this.emailService?.sendProjectInvitation) {
      const inviteUrl = `${this.frontendUrl.replace(/\/+$/, "")}/invitations/accept?token=${encodeURIComponent(token)}`;
      // In the invitee's language when they have an account, otherwise in the language of whoever invited them.
      const inviter = existingUser ? null : await this.userRepository.findById(input.invitedBy).catch(() => null);
      const language = existingUser?.language ?? inviter?.language;
      this.emailService
        .sendProjectInvitation(email, project.name, invitation.role, inviteUrl, language)
        .catch((err: any) => {
          console.warn("[InviteProjectMemberToken] Failed to send email:", err);
        });
    }

    return invitation.toJSON() as IProjectInvitation;
  }
}

export class GetProjectInvitationsUseCase {
  async execute(projectId: string): Promise<IProjectInvitation[]> {
    const docs = await ProjectInvitationModel.find({
      projectId,
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    return docs.map((d) => d.toJSON() as IProjectInvitation);
  }
}

export class CancelProjectInvitationUseCase {
  async execute(projectId: string, invitationId: string): Promise<void> {
    const res = await ProjectInvitationModel.deleteOne({
      _id: invitationId,
      projectId,
    });
    if (res.deletedCount === 0) {
      throw new NotFoundError("Invitation not found.");
    }
  }
}

export class AcceptProjectInvitationUseCase {
  constructor(
    private readonly memberRepository: IProjectMemberRepository,
    private readonly userRepository: IUserRepository,
    private readonly projectRepository?: Pick<IProjectRepository, "findById">,
    private readonly organizations?: OrganizationMembershipLookup,
  ) {}

  async execute(token: string, userId?: string): Promise<{ success: boolean; projectId: string; role: string }> {
    // Only the signed-in owner of the invited address may accept: the emailed link alone must not add an account to a
    // workspace (links get forwarded, logged and opened by mail scanners).
    if (!userId) throw new UnauthorizedError("Sign in with the invited email address to accept this invitation.");

    const invitation = await ProjectInvitationModel.findOne({
      token,
      status: InvitationStatus.PENDING,
    });

    if (!invitation) {
      throw new NotFoundError("Invitation not found or has already been accepted.");
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = InvitationStatus.EXPIRED;
      await invitation.save();
      throw new BadRequestError("Invitation has expired.");
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError("Sign in with the invited email address to accept this invitation.");
    }
    if (user.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
      throw new ForbiddenError(
        "This invitation was sent to a different email address. Sign in with that address to accept it.",
      );
    }

    // An invitation sent before the person left (or was removed from) the workspace's organization grants nothing.
    if (this.projectRepository) {
      const project = await this.projectRepository.findById(invitation.projectId);
      if (!project) throw new NotFoundError("Workspace not found.");
      await requireOrganizationMember(project, user.id, this.organizations,
        "You are not a member of the organization that owns this workspace, so this invitation can no longer be accepted.");
    }

    // Add to project membership
    const alreadyMember = await this.memberRepository.findByProjectAndUserId(invitation.projectId, user.id);
    if (!alreadyMember) {
      await this.memberRepository.addMember({
        projectId: invitation.projectId,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: invitation.role,
        status: MemberStatus.ACTIVE,
      });
    }

    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedAt = new Date();
    await invitation.save();

    return {
      success: true,
      projectId: invitation.projectId,
      role: invitation.role,
    };
  }
}

export class DeclineProjectInvitationUseCase {
  async execute(token: string): Promise<void> {
    const invitation = await ProjectInvitationModel.findOne({
      token,
      status: InvitationStatus.PENDING,
    });

    if (!invitation) {
      throw new NotFoundError("Invitation not found.");
    }

    invitation.status = InvitationStatus.DECLINED;
    await invitation.save();
  }
}
