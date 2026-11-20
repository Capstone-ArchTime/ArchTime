import type { IUserRepository } from '../../domain/interfaces/IUserRepository.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { hasUsablePassword, signInMethodsOf, type SignInMethods } from './SignInMethods.js';

// Linking a GitHub account to a signed-in ArchTime account, and unlinking it (RF-19, UC-35). The GitHub side is the
// same OAuth flow as GitHub sign-in (GitHubIdentityService); only what is done with the identity differs.

export type GitHubLinkProblem = 'in_use' | 'other_account' | 'not_linked' | 'only_method';

export class GitHubLinkError extends ConflictError {
  constructor(readonly problem: GitHubLinkProblem, message: string) {
    super(message, 'CONFLICT');
  }
}

type Users = Pick<IUserRepository, 'findCredentials'> & Required<Pick<IUserRepository, 'findIdByGithubId' | 'setGithubId'>>;
export type LinkAudit = (entry: { action: string; userId: string; details: Record<string, unknown> }) => Promise<void>;

export class GitHubLinkUseCase {
  constructor(private readonly users: Users, private readonly audit: LinkAudit = async () => {}) {}

  async link(userId: string, identity: { id: string; name: string }): Promise<SignInMethods> {
    const credentials = await this.users.findCredentials(userId);
    if (!credentials) throw new NotFoundError('Account not found.');
    if (credentials.githubId === identity.id) return signInMethodsOf(credentials);
    if (credentials.githubId) throw new GitHubLinkError('other_account', 'Your account is already linked to another GitHub account. Unlink it first.');
    const owner = await this.users.findIdByGithubId(identity.id);
    if (owner && owner !== userId) throw new GitHubLinkError('in_use', 'This GitHub account is already linked to another ArchTime account.');
    let written: boolean;
    try {
      written = await this.users.setGithubId(userId, identity.id);
    } catch (error) {
      // Linked to someone else between the check and the write: the unique index refuses it.
      if ((error as { code?: number }).code === 11000) throw new GitHubLinkError('in_use', 'This GitHub account is already linked to another ArchTime account.');
      throw error;
    }
    if (!written) throw new GitHubLinkError('other_account', 'Your account is already linked to another GitHub account. Unlink it first.');
    await this.audit({ action: 'GITHUB_LINK', userId, details: { githubId: identity.id, githubName: identity.name } }).catch(() => undefined);
    return signInMethodsOf({ passwordHash: credentials.passwordHash, githubId: identity.id });
  }

  /** Refused while GitHub is the only way to sign in: the person would lock themselves out. */
  async unlink(userId: string): Promise<SignInMethods> {
    const credentials = await this.users.findCredentials(userId);
    if (!credentials) throw new NotFoundError('Account not found.');
    if (!credentials.githubId) throw new GitHubLinkError('not_linked', 'No GitHub account is linked.');
    if (!hasUsablePassword(credentials.passwordHash)) {
      throw new GitHubLinkError('only_method', 'GitHub is the only way you sign in. Set a password first, then unlink GitHub.');
    }
    await this.users.setGithubId(userId, null);
    await this.audit({ action: 'GITHUB_UNLINK', userId, details: { githubId: credentials.githubId } }).catch(() => undefined);
    return signInMethodsOf({ passwordHash: credentials.passwordHash, githubId: null });
  }
}
