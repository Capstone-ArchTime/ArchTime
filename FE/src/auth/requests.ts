import { API_BASE_URL } from './session.ts';
import { AuthRequestError, readRetryAfter, tooManyAttemptsMessage } from './rate-limit.ts';

export { AuthRequestError } from './rate-limit.ts';

export type AuthResponse = { accessToken?: string; refreshToken?: string; message?: string; /** register and resend-otp: when the emailed code expires (ISO time) */ expiresAt?: string };

export async function authRequest(endpoint: 'login' | 'register' | 'verify-email' | 'resend-otp' | 'forgot-password' | 'reset-password', body: Record<string, string>, signal?: AbortSignal): Promise<AuthResponse> {
  const timeout = AbortSignal.timeout(15_000);
  try {
    const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code = typeof result?.error?.code === 'string' ? result.error.code : undefined;
      if (endpoint === 'login' && (response.status === 401 || code === 'INVALID_CREDENTIALS')) {
        throw new AuthRequestError('Incorrect username/email or password.', response.status, code);
      }
      // Too many requests: the answer says when to try again. (A locked verification code is a 429 too, but there is nothing to wait for: its own message says to ask for a new one.)
      if (response.status === 429 && code !== 'OTP_LOCKED') {
        const wait = readRetryAfter(result?.error?.retryAfterSeconds, response.headers.get('Retry-After'));
        throw new AuthRequestError(tooManyAttemptsMessage(wait), 429, code ?? 'RATE_LIMITED', wait);
      }
      // BE errors look like { success: false, error: { code, message } }
      const detail = result?.message ?? (typeof result?.error === 'string' ? result.error : result?.error?.message);
      throw new AuthRequestError(typeof detail === 'string' ? detail : `Request failed (${response.status}). Please try again.`, response.status, code);
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('The server returned an invalid response. Please try again.');
    // BE wraps response in { success, data, message } - unwrap if needed
    if (result.success && result.data) {
      return { ...result.data, message: result.message };
    }
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('The request timed out. Check your connection and try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and try again.');
    throw error;
  }
}
