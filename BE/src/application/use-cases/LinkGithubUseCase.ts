import type { IUser } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { GitHubProfile } from "../../infrastructure/services/GitHubOAuthService.js";
import { ConflictError } from "../../shared/errors/AppError.js";

/**
 * Allows an *authenticated* user to link their ArchTime account with a GitHub
 * account. The user must be logged in via email/password first.
 *
 * Guards:
 * - The GitHub ID must not already be linked to another ArchTime account.
 * - The user must not already have a GitHub account linked.
 */
export class LinkGithubUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: {
    userId: string;
    githubProfile: GitHubProfile;
  }): Promise<{ message: string; user: Omit<IUser, "passwordHash"> }> {
    // Ensure this GitHub ID isn't already linked elsewhere
    const existingLinked = await this.userRepo.findByGithubId(
      input.githubProfile.githubId,
    );
    if (existingLinked && existingLinked.id !== input.userId) {
      throw new ConflictError(
        "This GitHub account is already linked to another ArchTime account.",
      );
    }

    // Ensure the current user doesn't already have a GitHub link
    const currentUser = await this.userRepo.findById(input.userId);
    if (currentUser?.githubId) {
      throw new ConflictError(
        "Your account already has a GitHub account linked. Unlink it first before linking a new one.",
      );
    }

    await this.userRepo.linkGithub(
      input.userId,
      input.githubProfile.githubId,
      input.githubProfile.avatarUrl,
    );

    const updatedUser = await this.userRepo.findById(input.userId);
    const { passwordHash: _ph, ...safeUser } = updatedUser!;

    return {
      message: "GitHub account linked successfully.",
      user: safeUser,
    };
  }
}
