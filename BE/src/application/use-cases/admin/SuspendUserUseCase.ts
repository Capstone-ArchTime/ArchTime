import { UserRole, UserStatus, type IUser } from "../../../domain/entities/User.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export interface SuspendUserInput {
  currentUserId: string;
  targetUserId: string;
  reason?: string;
}

export class SuspendUserUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: SuspendUserInput): Promise<Omit<IUser, "passwordHash">> {
    if (input.currentUserId === input.targetUserId) {
      throw new BadRequestError("You cannot suspend your own account.");
    }

    const targetUser = await this.userRepo.findById(input.targetUserId);
    if (!targetUser) {
      throw new NotFoundError("User not found.");
    }

    // Safeguard: Prevent suspending the last System Administrator
    if (targetUser.role === UserRole.SYSTEM_ADMINISTRATOR) {
      const activeAdminCount = await this.userRepo.countByRole(UserRole.SYSTEM_ADMINISTRATOR);
      if (activeAdminCount <= 1) {
        throw new BadRequestError("Cannot suspend the last System Administrator.");
      }
    }

    if (targetUser.status === UserStatus.SUSPENDED) {
      const { passwordHash: _ph, ...safeUser } = targetUser;
      return safeUser;
    }

    const updatedUser = await this.userRepo.updateStatus(
      input.targetUserId,
      UserStatus.SUSPENDED,
    );
    if (!updatedUser) {
      throw new NotFoundError("User not found.");
    }

    const { passwordHash: _ph, ...safeUser } = updatedUser;
    return safeUser;
  }
}
