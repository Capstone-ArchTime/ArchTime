import type { IRateLimiter, RateLimitResult } from "../../domain/interfaces/IRateLimiter.js";

/**
 * The same fixed-window counter held in this process. For tests and single-instance experiments only: the counts are
 * lost on restart and not shared between server instances (use MongoRateLimiter in the real app).
 */
export class InMemoryRateLimiter implements IRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      remaining: Math.max(0, limit - window.count),
    };
  }

  async refund(key: string): Promise<void> {
    const window = this.windows.get(key);
    if (window && window.resetAt > this.now() && window.count > 0) window.count -= 1;
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }
}
