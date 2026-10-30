// When the emailed verification code stops working, so the verification page can count down to it. Kept in sessionStorage
// per email, so reloading the page keeps the countdown; the server decides in the end (it refuses an expired code).

import { formatWait } from '../auth/rate-limit.ts';

/** How long a code lasts on the server (RegisterUseCase / ResendOtpUseCase), used when a response does not say. */
export const OTP_TTL_MS = 10 * 60 * 1000;
const key = (email: string) => `archtime:otp-expires:${email.trim().toLowerCase()}`;

/** The expiry the server sent, or the usual lifetime from now when it sent none (or something unreadable). */
export function deadlineFrom(expiresAt: unknown, now = Date.now()): number {
  const at = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(at) ? at : now + OTP_TTL_MS;
}

export function rememberOtpDeadline(email: string, deadline: number, storage: Pick<Storage, 'setItem'> = sessionStorage) {
  try { storage.setItem(key(email), String(deadline)); } catch { /* storage unavailable: the countdown just does not survive a reload */ }
}

/** The remembered expiry of the code sent to this email, or null when none is known. */
export function recallOtpDeadline(email: string, storage: Pick<Storage, 'getItem'> = sessionStorage): number | null {
  try {
    const value = Number(storage.getItem(key(email)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

/** "9:05" for the time left; "0:00" once it is over. */
export function formatCountdown(msLeft: number): string {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The resend button while it is locked: "Resend in 45s" for a short wait, "Resend in 12 minutes" for a long one (a rate limit can ask for an hour). */
export function resendLabel(secondsLeft: number): string {
  return secondsLeft < 60 ? `Resend in ${secondsLeft}s` : `Resend in ${formatWait(secondsLeft)}`;
}
