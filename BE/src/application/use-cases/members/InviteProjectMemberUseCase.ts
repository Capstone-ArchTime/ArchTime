import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import {
  MemberStatus,
  ProjectMemberRole,
  type IProjectMember,
} from "../../../domain/entities/ProjectMember.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../../shared/errors/AppError.js";

export interface InviteProjectMemberRequest {
  projectId: string;
  email: string;
  name: string;
  role?: ProjectMemberRole;
  invitedBy?: string;
}

export class InviteProjectMemberUseCase {
  constructor(
    private readonly memberRepository: IProjectMemberRepository,
    private readonly projectRepository: IProjectRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(req: InviteProjectMemberRequest): Promise<IProjectMember> {
    const email = req.email?.trim().toLowerCase();
    const name = req.name?.trim();

    if (!email || !name || !req.projectId) {
      throw new BadRequestError(
        "Missing required fields: projectId, email, name.",
        "VALIDATION_ERROR",
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestError(
        "Invalid email address format.",
        "VALIDATION_ERROR",
      );
    }

    const project = await this.projectRepository.findById(req.projectId);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }

    const existingMember = await this.memberRepository.findByProjectAndEmail(
      req.projectId,
      email,
    );
    if (existingMember) {
      throw new ConflictError(
        "A member with this email already exists in this project.",
        "ALREADY_EXISTS",
      );
    }

    // Check if the user already exists in the system
    const existingUser = await this.userRepository.findByEmail(email);

    const role = req.role ?? ProjectMemberRole.MEMBER;
    const status = existingUser ? MemberStatus.ACTIVE : MemberStatus.INVITED;

    return await this.memberRepository.addMember({
      projectId: req.projectId,
      userId: existingUser?.id,
      email,
      name,
      role,
      status,
      invitedBy: req.invitedBy,
    });
  }
}
