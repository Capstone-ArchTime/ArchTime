// What the pages need to know when the server answers "too many requests" (HTTP 429): how long to wait, in plain words.
// Pure on purpose, so it is tested without a browser.

/** A refused request to the sign-in endpoints. `code` is the server's error code (RATE_LIMITED, OTP_LOCKED, ...). */
export class AuthRequestError extends Error {
  status: number;
  code?: string;
  /** Only on a rate limit: when the same request may be tried again. */
  retryAfterSeconds?: number;
  constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'AuthRequestError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The wait the server asked for: the `retryAfterSeconds` of its answer, else the Retry-After header (whole seconds, or
 * an HTTP date). Undefined when neither says anything usable. Never below one second.
 */
export function readRetryAfter(bodySeconds: unknown, header: string | null | undefined, now = Date.now()): number | undefined {
  if (typeof bodySeconds === 'number' && Number.isFinite(bodySeconds) && bodySeconds > 0) return Math.ceil(bodySeconds);
  const text = header?.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Math.max(1, Number(text));
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(1, Math.ceil((at - now) / 1000)) : undefined;
}

/** "45 seconds", "2 minutes", "1 hour", "1 hour 5 minutes". Rounds up, so the person never tries too early. */
export function formatWait(seconds: number): string {
  const total = Math.max(1, Math.ceil(seconds));
  if (total < 60) return `${total} ${total === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.ceil(total / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return rest ? `${hourText} ${rest} ${rest === 1 ? 'minute' : 'minutes'}` : hourText;
}

/** The sentence shown under a form. The wording avoids the words "email" and "password": the sign-up form files messages that mention them under a field. */
export function tooManyAttemptsMessage(retryAfterSeconds?: number): string {
  return retryAfterSeconds === undefined
    ? 'Too many attempts. Please wait a little and try again.'
    : `Too many attempts. Try again in ${formatWait(retryAfterSeconds)}.`;
}
