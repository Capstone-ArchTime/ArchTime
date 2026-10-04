import { UserStatus, type IUser } from "../../../domain/entities/User.js";
import type { IUserRepository } from "../../../domain/interfaces/IUserRepository.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";

export interface ReactivateUserInput {
  targetUserId: string;
}

export class ReactivateUserUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: ReactivateUserInput): Promise<Omit<IUser, "passwordHash">> {
    const targetUser = await this.userRepo.findById(input.targetUserId);
    if (!targetUser) {
      throw new NotFoundError("User not found.");
    }

    if (targetUser.status === UserStatus.ACTIVE) {
      const { passwordHash: _ph, ...safeUser } = targetUser;
      return safeUser;
    }

    const updatedUser = await this.userRepo.updateStatus(
      input.targetUserId,
      UserStatus.ACTIVE,
    );
    if (!updatedUser) {
      throw new NotFoundError("User not found.");
    }

    const { passwordHash: _ph, ...safeUser } = updatedUser;
    return safeUser;
  }
}
