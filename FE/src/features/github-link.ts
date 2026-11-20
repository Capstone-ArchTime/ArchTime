import { apiRequest } from '../api/client.ts';
import { API_BASE_URL } from '../auth/session.ts';
import type { SignInMethods } from '../auth/permissions.ts';

// Linking GitHub to the signed-in account and unlinking it (RF-19, UC-35). Linking leaves the page for GitHub and comes
// back to /profile#github=linked or /profile#github_error=<reason>.

const PROBLEMS: Record<string, string> = {
  in_use: 'That GitHub account is already linked to another ArchTime account.',
  other_account: 'Your account is already linked to another GitHub account. Unlink it first.',
  cancelled: 'Linking GitHub was cancelled.',
  expired: 'The link request expired. Try again.',
  unavailable: 'GitHub sign-in is not configured or is temporarily unavailable.',
  failed: 'GitHub could not be linked. Check that your GitHub account has a verified email and try again.',
};

/** What the return from GitHub says, read from the address hash; null when the page was not opened by it. */
export function githubLinkResult(hash: string): { ok: boolean; text: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('github') === 'linked') return { ok: true, text: 'GitHub is linked: you can now also sign in with GitHub.' };
  const problem = params.get('github_error');
  if (problem !== null) return { ok: false, text: PROBLEMS[problem] ?? PROBLEMS.failed };
  return null;
}

/** Leaves for GitHub with a one-time ticket for this account (a page change cannot carry the session token). */
export async function startGitHubLink(go: (url: string) => void = url => window.location.assign(url)): Promise<void> {
  const res = await apiRequest<{ data: { ticket: string } }>('/auth/github/link', { method: 'POST' });
  go(`${API_BASE_URL}/auth/github?link=${encodeURIComponent(res.data.ticket)}`);
}

export async function unlinkGitHub(): Promise<SignInMethods | null> {
  const res = await apiRequest<{ data?: { signInMethods?: SignInMethods } }>('/auth/github/link', { method: 'DELETE' });
  return res.data?.signInMethods ?? null;
}
