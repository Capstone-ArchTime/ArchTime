import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import { NotFoundError } from "../../shared/errors/AppError.js";

/**
 * Ends every session of the user, this one included: access and refresh tokens carry the account's token version,
 * and bumping it makes all of them invalid at once (see authenticate.ts and RefreshTokenUseCase).
 */
export class LogoutAllDevicesUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: { userId: string }): Promise<{ message: string }> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError("User not found.");
    await this.userRepo.revokeSessions(user.id);
    return { message: "Signed out of all devices. Sign in again to continue." };
  }
}
