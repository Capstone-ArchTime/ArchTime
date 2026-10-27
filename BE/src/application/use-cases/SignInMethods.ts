/**
 * Accounts made by signing in with GitHub get a random hash with this prefix instead of a password (GitHubLoginUseCase),
 * because the hash is a required field. Nobody knows a password for it, so it does not count as one.
 */
export const GITHUB_ONLY_PASSWORD_PREFIX = "!github-only:";

export interface SignInMethods {
  password: boolean;
  github: boolean;
}

/** A stored hash someone can sign in with: there is one and it is not the GitHub-only placeholder. */
export function hasUsablePassword(passwordHash: string | null | undefined): boolean {
  return typeof passwordHash === "string" && passwordHash.length > 0 && !passwordHash.startsWith(GITHUB_ONLY_PASSWORD_PREFIX);
}

export function signInMethodsOf(credentials: { passwordHash: string | null; githubId: string | null }): SignInMethods {
  return { password: hasUsablePassword(credentials.passwordHash), github: !!credentials.githubId };
}
