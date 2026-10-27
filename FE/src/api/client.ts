import { API_BASE_URL, readTokens, tokenStorage, verifySession } from '../auth/session.ts';

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Problems with single fields of the request, when the server sent them (for example "steps[2].title"). */
  fields?: Record<string, string>;
  constructor(message: string, status: number, code?: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
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

/** Sends the request with the session's token, renewing it once when the server says it expired. */
async function sendAuthorized(path: string, options: RequestInit, signal: AbortSignal): Promise<Response> {
  const send = (token: string) => fetch(`${API_BASE_URL}${path}`, {
    ...options, signal, headers: { ...Object.fromEntries(new Headers(options.headers)), Authorization: `Bearer ${token}` },
  });
  let response = await send(readTokens().accessToken);
  if (response.status === 401 && readTokens().refreshToken) {
    const token = await renewToken();
    signal.throwIfAborted();
    response = await send(token);
  }
  return response;
}

/**
 * A file from the API (a PDF, say), with the name the server gave it. A link cannot be used for this: the browser would
 * not send the session's token.
 */
export async function apiDownload(path: string, options: RequestInit = {}, timeoutMs = 60_000): Promise<{ blob: Blob; filename: string | null }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await sendAuthorized(path, options, signal);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = typeof body?.error?.message === 'string' ? body.error.message : response.status === 403 ? 'You do not have permission to download this file.' : `Download failed (${response.status}). Please retry.`;
      throw new ApiError(message, response.status, typeof body?.error?.code === 'string' ? body.error.code : undefined);
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
    return { blob: await response.blob(), filename };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('The download timed out. Please retry.');
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and retry.');
    throw error;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await sendAuthorized(path, options, signal);
    const body = response.status === 204 ? undefined : await response.json().catch(() => null);
    if (!response.ok) {
      const code = typeof body?.error === 'object' && body?.error !== null ? body.error.code : undefined;
      const serverMsg = typeof body?.error === 'object' && body?.error !== null
        ? body.error.message
        : (typeof body?.error === 'string' ? body.error : body?.message);
      const detail = typeof serverMsg === 'string' && serverMsg.trim()
        ? serverMsg
        : response.status === 403
          ? 'You do not have permission to view this data.'
          : response.status === 409
            ? 'Revision conflict: This workspace has been modified by someone else. Please reload before saving.'
            : `Request failed (${response.status}). Please retry.`;
      const sent = typeof body?.error === 'object' && body?.error !== null ? body.error.fields : undefined;
      const fields = sent && typeof sent === 'object' ? Object.fromEntries(Object.entries(sent).filter(([, problem]) => typeof problem === 'string')) as Record<string, string> : undefined;
      throw new ApiError(detail, response.status, code, fields);
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
