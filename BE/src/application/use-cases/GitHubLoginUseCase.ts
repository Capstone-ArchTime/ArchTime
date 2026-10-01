import type { IUser } from "../../domain/entities/User.js";
import { UserRole } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { ITokenPair } from "../../domain/interfaces/IAuthService.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import type { GitHubProfile } from "../../infrastructure/services/GitHubOAuthService.js";

/**
 * Possible outcomes when a user authenticates via GitHub OAuth.
 */
export type GitHubLoginResult =
  | { status: "SUCCESS"; user: Omit<IUser, "passwordHash">; tokens: ITokenPair }
  | { status: "ACCOUNT_LINK_REQUIRED"; email: string; message: string };

export class GitHubLoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly jwtService: JwtTokenService,
  ) {}

  async execute(profile: GitHubProfile): Promise<GitHubLoginResult> {
    // 1. Try finding a user already linked to this GitHub ID
    const linkedUser = await this.userRepo.findByGithubId(profile.githubId);
    if (linkedUser) {
      const tokens = this.jwtService.generateTokens(linkedUser.id, linkedUser.role);
      const { passwordHash: _ph, ...safeUser } = linkedUser;
      return { status: "SUCCESS", user: safeUser, tokens };
    }

    // 2. Check if a user with the same email already exists
    if (profile.email) {
      const existingUser = await this.userRepo.findByEmail(profile.email);
      if (existingUser) {
        // Email already has an account — require explicit linking
        return {
          status: "ACCOUNT_LINK_REQUIRED",
          email: profile.email,
          message:
            "An account with this email already exists. Please log in with your email/password first, then link your GitHub account in Account Settings.",
        };
      }
    }

    // 3. First-time user — create a new OAuth account (auto-verified)
    const newUser = await this.userRepo.createOAuthUser({
      name: profile.name,
      email: profile.email,
      role: UserRole.DEVELOPER_ANALYST,
      githubId: profile.githubId,
      avatarUrl: profile.avatarUrl,
    });

    const tokens = this.jwtService.generateTokens(newUser.id, newUser.role);
    const { passwordHash: _ph, ...safeUser } = newUser;
    return { status: "SUCCESS", user: safeUser, tokens };
  }
}
