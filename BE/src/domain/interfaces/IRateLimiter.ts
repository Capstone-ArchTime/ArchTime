export interface RateLimitResult {
  /** False once this hit is over the limit. The hit is still counted, but the window does not move. */
  allowed: boolean;
  /** Seconds until the window ends and the counter starts again (at least 1). */
  retryAfterSeconds: number;
  /** How many more hits fit in the current window. */
  remaining: number;
}

/**
 * A fixed-window counter per key. `hit` is one atomic step, so parallel requests (even on several server instances)
 * cannot slip past the limit.
 */
export interface IRateLimiter {
  /** Counts one hit on `key` in a window of `windowSeconds`, starting a new window when the last one is over. */
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  /** Gives one hit back (a request that turned out not to count). Never goes below zero. */
  refund(key: string): Promise<void>;
  /** Forgets the key altogether. */
  reset(key: string): Promise<void>;
}
