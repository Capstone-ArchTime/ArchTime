/** An e-mail address the way it is compared and stored: no surrounding spaces, lower case. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const MAX_KEY_LENGTH = 300; // the longest valid e-mail address (254) plus "|" and a full IPv6 address (45)

/**
 * Turns whatever a client sent into a rate-limit key part, so "Ann@X.com", " ann@x.com " and "ANN@X.COM" share one
 * counter. Anything that is not a non-blank string gives undefined (the policy is then skipped for that request).
 * Very long values are cut so a client cannot make the counter collection hold huge keys.
 */
export function normalizeLimitKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase().slice(0, MAX_KEY_LENGTH);
  return key || undefined;
}

/** The client address as a rate-limit key. IPv4 reached over an IPv6 socket ("::ffff:1.2.3.4") counts as plain IPv4. */
export function normalizeIp(ip: string | undefined): string {
  return (ip ?? "unknown").toLowerCase().replace(/^::ffff:/, "");
}
