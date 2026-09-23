import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import { BadRequestError, UnauthorizedError } from "../../shared/errors/AppError.js";

export class ChangePasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hasher: BcryptHasher,
  ) {}

  async execute(input: {
    userId: string;
    oldPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new UnauthorizedError("User not found.");
    }

    const passwordMatch = await this.hasher.comparePassword(
      input.oldPassword,
      user.passwordHash,
    );
    if (!passwordMatch) {
      throw new BadRequestError("Invalid old password.");
    }

    const passwordHash = await this.hasher.hashPassword(input.newPassword);
    
    await this.userRepo.updatePassword(user.id, passwordHash);

    return { message: "Password has been changed successfully." };
  }
}
