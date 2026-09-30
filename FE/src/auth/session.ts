import { isAuthUser } from './permissions.ts';

export const API_BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:4000/api';
export type Tokens = { accessToken: string; refreshToken: string };
export class InvalidSessionError extends Error {}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

// Always resolve identity and permissions on the server, never from browser-stored roles.
export async function verifySession(tokens: Tokens, signal: AbortSignal) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  let accessToken = tokens.accessToken;
  let response = await fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
  if (response.status === 401 && tokens.refreshToken) {
    const refresh = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens.refreshToken }), signal,
    });
    if ([400, 401, 403, 404].includes(refresh.status)) throw new InvalidSessionError('Your session has expired. Please sign in again.');
    if (!refresh.ok) throw new Error('Unable to renew your session. Please retry.');
    const body = await refresh.json();
    if (typeof body.accessToken !== 'string' || !body.accessToken) throw new Error('Invalid session response.');
    accessToken = body.accessToken;
    response = await fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
  }
  if ([401, 403, 404].includes(response.status)) throw new InvalidSessionError('Your session has expired or access was revoked.');
  if (!response.ok) throw new Error('Unable to verify your session. Please retry.');
  const { user } = await response.json();
  if (!isAuthUser(user)) throw new InvalidSessionError('This account does not have a supported role.');
  return { user, accessToken };
}
