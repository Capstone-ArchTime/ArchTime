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
  NotFoundError,
} from "../../../shared/errors/AppError.js";

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
  ) {}

  async execute(input: InviteMemberTokenInput): Promise<IProjectInvitation> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const email = input.email?.trim().toLowerCase();
    if (!email) throw new BadRequestError("Recipient email is required.");

    // Check if already a member
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      const isMember = await this.memberRepository.findByProjectAndUserId(input.projectId, existingUser.id);
      if (isMember) {
        throw new ConflictError("User is already a member of this project.");
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
      const inviteUrl = `http://localhost:5173/invitations/accept?token=${token}`;
      this.emailService
        .sendProjectInvitation(email, project.name, invitation.role, inviteUrl)
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
  ) {}

  async execute(token: string, userId?: string): Promise<{ success: boolean; projectId: string; role: string }> {
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

    // Determine target user
    let user = userId ? await this.userRepository.findById(userId) : null;
    if (!user) {
      user = await this.userRepository.findByEmail(invitation.email);
    }

    if (!user) {
      throw new BadRequestError(
        "Please register or log in with the invited email address to accept this invitation.",
      );
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
