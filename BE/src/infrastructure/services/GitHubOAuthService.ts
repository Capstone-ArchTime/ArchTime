import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";

export interface GitHubProfile {
  githubId: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

/**
 * Configures the Passport GitHub OAuth 2.0 strategy.
 *
 * The verify callback extracts a minimal, stable profile using the GitHub
 * user `id` (numeric, converted to string) rather than the mutable `login`
 * or email fields — per GitHub's own recommendation.
 */
export function configureGitHubStrategy(
  clientID: string,
  clientSecret: string,
  callbackURL: string,
): void {
  passport.use(
    new GitHubStrategy(
      { clientID, clientSecret, callbackURL, scope: ["user:email"] },
      (
        _accessToken: string,
        _refreshToken: string,
        profile: {
          id: string;
          displayName?: string;
          username?: string;
          emails?: Array<{ value: string }>;
          photos?: Array<{ value: string }>;
        },
        done: (err: Error | null, user?: GitHubProfile) => void,
      ) => {
        const email =
          profile.emails && profile.emails.length > 0
            ? profile.emails[0].value
            : "";
        const name =
          profile.displayName || profile.username || `github-${profile.id}`;
        const avatarUrl =
          profile.photos && profile.photos.length > 0
            ? profile.photos[0].value
            : undefined;

        const ghProfile: GitHubProfile = {
          githubId: profile.id,
          name,
          email,
          avatarUrl,
        };

        done(null, ghProfile);
      },
    ),
  );

  // Minimal serialisation — we don't use persistent sessions;
  // the profile is only used during the OAuth callback request.
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj: Express.User, done) => done(null, obj));
}
