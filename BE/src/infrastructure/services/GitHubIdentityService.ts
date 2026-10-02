export type GitHubIdentity = { id: string; name: string; email: string };

export class GitHubIdentityService {
  constructor(private readonly clientId: string, private readonly clientSecret: string,
    private readonly callbackUrl: string, private readonly request: typeof fetch = fetch) {}

  async identify(code: string, verifier: string): Promise<GitHubIdentity> {
    const tokenResponse = await this.request('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.clientId, client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl, code, code_verifier: verifier }), signal: AbortSignal.timeout(15_000),
    });
    const token = await tokenResponse.json() as { access_token?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error('GitHub token exchange failed');
    const headers = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ArchTime' };
    const [profileResponse, emailsResponse] = await Promise.all([
      this.request('https://api.github.com/user', { headers, signal: AbortSignal.timeout(15_000) }),
      this.request('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(15_000) }),
    ]);
    if (!profileResponse.ok || !emailsResponse.ok) throw new Error('GitHub identity lookup failed');
    const profile = await profileResponse.json() as { id: number; name?: string; login: string };
    const emails = await emailsResponse.json() as { email: string; verified: boolean; primary: boolean }[];
    const email = emails.find(item => item.verified && item.primary) ?? emails.find(item => item.verified);
    if (!Number.isSafeInteger(profile.id) || !profile.login || !email?.email) throw new Error('GitHub verified email required');
    return { id: String(profile.id), name: profile.name || profile.login, email: email.email.trim().toLowerCase() };
  }
}
