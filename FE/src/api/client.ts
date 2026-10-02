import { API_BASE_URL, readTokens, tokenStorage, verifySession } from '../auth/session.ts';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

let renewal: Promise<string> | null = null;
async function renewToken() {
  if (!renewal) {
    const tokens = readTokens();
    renewal = verifySession(tokens, new AbortController().signal).then(result => {
      if (readTokens().refreshToken !== tokens.refreshToken) throw new Error('Your account changed. Reload this page.');
      tokenStorage().setItem('accessToken', result.accessToken);
      return result.accessToken;
    }).finally(() => { renewal = null; });
  }
  return renewal;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const send = (token: string) => fetch(`${API_BASE_URL}${path}`, {
    ...options, signal, headers: { ...Object.fromEntries(new Headers(options.headers)), Authorization: `Bearer ${token}` },
  });
  try {
    let response = await send(readTokens().accessToken);
    if (response.status === 401 && readTokens().refreshToken) {
      const token = await renewToken();
      signal.throwIfAborted();
      response = await send(token);
    }
    const body = response.status === 204 ? undefined : await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body?.message ?? body?.error;
      throw new ApiError(typeof detail === 'string' ? detail : response.status === 403 ? 'You do not have permission to view this data.' : `Request failed (${response.status}). Please retry.`, response.status);
    }
    if (body === null) throw new Error('The server returned an invalid response.');
    return body as T;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('The request timed out. Please retry.');
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and retry.');
    throw error;
  }
}
