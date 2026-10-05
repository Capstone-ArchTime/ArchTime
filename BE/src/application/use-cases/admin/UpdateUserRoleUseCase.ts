import { UserRole, type IUser } from "../../../domain/entities/User.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export interface UpdateUserRoleInput {
  currentUserId: string;
  targetUserId: string;
  newRole: UserRole;
}

export class UpdateUserRoleUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: UpdateUserRoleInput): Promise<Omit<IUser, "passwordHash">> {
    if (!Object.values(UserRole).includes(input.newRole)) {
      throw new BadRequestError(`Invalid role. Must be one of: ${Object.values(UserRole).join(", ")}`);
    }

    const targetUser = await this.userRepo.findById(input.targetUserId);
    if (!targetUser) {
      throw new NotFoundError("User not found.");
    }

    // Safeguard: Prevent demoting the last System Administrator
    if (
      targetUser.role === UserRole.SYSTEM_ADMINISTRATOR &&
      input.newRole !== UserRole.SYSTEM_ADMINISTRATOR
    ) {
      const activeAdminCount = await this.userRepo.countByRole(UserRole.SYSTEM_ADMINISTRATOR);
      if (activeAdminCount <= 1) {
        throw new BadRequestError("Cannot demote the last System Administrator.");
      }
    }

    if (targetUser.role === input.newRole) {
      const { passwordHash: _ph, ...safeUser } = targetUser;
      return safeUser;
    }

    const updatedUser = await this.userRepo.updateRole(input.targetUserId, input.newRole);
    if (!updatedUser) {
      throw new NotFoundError("User not found.");
    }

    const { passwordHash: _ph, ...safeUser } = updatedUser;
    return safeUser;
  }
}
