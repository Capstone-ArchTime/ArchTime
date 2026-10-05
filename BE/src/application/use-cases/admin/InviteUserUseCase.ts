import { randomBytes } from "node:crypto";
import { UserRole, UserStatus, type IUser } from "../../../domain/entities/User.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import type { IEmailService } from "../../../domain/interfaces/IEmailService.js";
import type { BcryptHasher } from "../../../infrastructure/services/BcryptHasher.js";
import { BadRequestError, ConflictError } from "../../../shared/errors/AppError.js";

export interface InviteUserInput {
  name: string;
  email: string;
  role: UserRole;
  temporaryPassword?: string;
}

export interface InviteUserResult {
  user: Omit<IUser, "passwordHash">;
  temporaryPassword: string;
}

export class InviteUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly bcryptHasher: BcryptHasher,
    private readonly emailService?: IEmailService,
  ) {}

  async execute(input: InviteUserInput): Promise<InviteUserResult> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestError("Name is required.");
    }

    const email = input.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestError("A valid email address is required.");
    }

    if (!Object.values(UserRole).includes(input.role)) {
      throw new BadRequestError(`Invalid role. Must be one of: ${Object.values(UserRole).join(", ")}`);
    }

    const exists = await this.userRepo.existsByEmail(email);
    if (exists) {
      throw new ConflictError("User with this email already exists.");
    }

    // Generate strong temporary password if not provided
    const temporaryPassword =
      input.temporaryPassword && input.temporaryPassword.length >= 8
        ? input.temporaryPassword
        : `ArchTime#${randomBytes(4).toString("hex")}!`;

    const passwordHash = await this.bcryptHasher.hashPassword(temporaryPassword);

    const user = await this.userRepo.create({
      name,
      email,
      passwordHash,
      role: input.role,
      status: UserStatus.ACTIVE,
      isVerified: true,
    });

    if (this.emailService) {
      try {
        await this.emailService.sendInvitation(email, temporaryPassword, input.role);
      } catch (err) {
        console.warn(`[InviteUserUseCase] Failed to send invitation email to ${email}:`, err);
      }
    }

    const { passwordHash: _ph, ...safeUser } = user;
    return { user: safeUser, temporaryPassword };
  }
}
