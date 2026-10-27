import { apiRequest } from '@/api/client';
import type { AuthUser, SignInMethods } from '@/auth/permissions';
import type { ProfilePatch } from './profile-validation';
import { listTotal, parseSignInMethods } from './profile-view';

// The signed-in person's own account. Server: BE/src/presentation/routes/auth.routes.ts. Every call acts on the account the
// token belongs to; none of them takes a user id. countProjects reads GET /projects for the overview on the profile page.

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** Changes the name and/or username; returns the user as the server now holds it (the username comes back lower-cased). */
export async function updateProfile(patch: ProfilePatch): Promise<Pick<AuthUser, 'name' | 'username'>> {
  const body = await apiRequest<{ data?: { user?: { name?: unknown; username?: unknown } } }>('/auth/me', json('PATCH', patch));
  const user = body.data?.user;
  if (!user || typeof user.name !== 'string') throw new Error('The server returned an invalid profile.');
  return { name: user.name, username: typeof user.username === 'string' ? user.username : null };
}

/** Changes the password. The server ends every session of the account, this one included, and returns no new tokens. */
export async function changePassword(input: { oldPassword: string; newPassword: string; confirmNewPassword: string }): Promise<void> {
  await apiRequest('/auth/change-password', json('POST', input));
}

/** Ends every session of the account, this one included. */
export async function signOutEverywhere(): Promise<void> {
  await apiRequest('/auth/logout-all', json('POST'));
}

/**
 * A first password for an account that has none (made by signing in with GitHub). The server refuses it (409) once the
 * account has a password, and keeps every session. Returns how the account signs in now, or null if the server did not say.
 */
export async function setPassword(input: { newPassword: string; confirmNewPassword: string }): Promise<SignInMethods | null> {
  const body = await apiRequest<{ data?: { signInMethods?: unknown } }>('/auth/set-password', json('POST', input));
  return parseSignInMethods(body.data?.signInMethods);
}

/** How many workspaces of one kind the account has (all = every one it can read), asking for one row and reading the total. */
export async function countProjects(scope: 'all' | 'owned' | 'managed' | 'participating', signal?: AbortSignal): Promise<number> {
  return listTotal(await apiRequest(`/projects?scope=${scope}&limit=1`, { signal }), 'projects');
}
