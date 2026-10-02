import { randomBytes } from 'node:crypto';
import { UserRole } from '../../domain/entities/User.js';
import { UserModel } from '../../infrastructure/database/models/UserModel.js';
import type { GitHubIdentity } from '../../infrastructure/services/GitHubIdentityService.js';
import { ConflictError } from '../../shared/errors/AppError.js';

export class GitHubLoginUseCase {
  async execute(identity: GitHubIdentity): Promise<string> {
    const existing = await UserModel.findOne({ githubId: identity.id });
    if (existing) return existing.id as string;
    // Never silently link by email: a pre-existing account requires its own login.
    if (await UserModel.exists({ email: identity.email })) {
      throw new ConflictError('An account already uses this email. Sign in with your email and password.');
    }
    try {
      const user = await UserModel.create({ githubId: identity.id, email: identity.email, name: identity.name,
        passwordHash: `!github-only:${randomBytes(32).toString('hex')}`, isVerified: true, role: UserRole.DEVELOPER_ANALYST });
      return user.id as string;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const concurrent = await UserModel.findOne({ githubId: identity.id });
      if (concurrent) return concurrent.id as string;
      throw new ConflictError('An account already uses this email. Sign in with your email and password.');
    }
  }
}
