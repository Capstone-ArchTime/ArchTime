import { API_BASE_URL } from './session.ts';

export type AuthResponse = { accessToken?: string; refreshToken?: string; message?: string };

export async function authRequest(endpoint: 'login' | 'register' | 'verify-email' | 'resend-otp' | 'forgot-password' | 'reset-password', body: Record<string, string>, signal?: AbortSignal): Promise<AuthResponse> {
  const timeout = AbortSignal.timeout(15_000);
  try {
    const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.message ?? result?.error;
      throw new Error(typeof detail === 'string' ? detail : `Request failed (${response.status}). Please try again.`);
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('The server returned an invalid response. Please try again.');
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('The request timed out. Check your connection and try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and try again.');
    throw error;
  }
}
