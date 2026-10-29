import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { IRateLimiter } from "../../domain/interfaces/IRateLimiter.js";
import { TooManyRequestsError } from "../../shared/errors/AppError.js";
import { normalizeLimitKey } from "../../shared/utils/normalize.js";

export interface RateLimitPolicy {
  /** Names the counter, so two policies never share one ("register:ip"). */
  name: string;
  limit: number;
  windowSeconds: number;
  /** What to count by: one key, several, or none (the policy is then skipped for this request). Normalised here. */
  key: (req: Request) => string | string[] | undefined;
  /** Failures-only mode: a successful request clears this counter instead of leaving its hit on it. */
  clearOnSuccess?: boolean;
}

export interface RateLimitOptions {
  /**
   * Count failed requests only. The hit is taken before the handler runs (so parallel guesses cannot slip past), and
   * given back afterwards unless the answer was 401: a success (or a 403, which means the password was right) clears
   * the policies marked clearOnSuccess and refunds the others; 400 and 5xx are refunded and never clear anything.
   */
  failuresOnly?: boolean;
}

/**
 * Express middleware that counts each request against the given policies in order (put the cheap per-IP one first) and
 * answers 429 with Retry-After once one is over its limit. It stops at the first policy that refuses.
 */
export function createRateLimit(limiter: IRateLimiter, policies: RateLimitPolicy[], options: RateLimitOptions = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taken: { key: string; clearOnSuccess: boolean }[] = [];
      for (const policy of policies) {
        const raw = policy.key(req);
        for (const part of Array.isArray(raw) ? raw : [raw]) {
          const key = normalizeLimitKey(part);
          if (!key) continue;
          const counter = `${policy.name}:${key}`;
          const result = await limiter.hit(counter, policy.limit, policy.windowSeconds);
          if (!result.allowed) throw new TooManyRequestsError(result.retryAfterSeconds);
          taken.push({ key: counter, clearOnSuccess: policy.clearOnSuccess === true });
        }
      }
      if (options.failuresOnly && taken.length > 0) {
        res.once("finish", () => {
          settle(limiter, taken, res.statusCode).catch(err => console.error("[RateLimit] could not settle counters", err));
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function settle(limiter: IRateLimiter, taken: { key: string; clearOnSuccess: boolean }[], status: number): Promise<void> {
  if (status === 401) return; // a real failed attempt: its hit stays
  const verified = status < 400 || status === 403;
  await Promise.all(taken.map(({ key, clearOnSuccess }) => (verified && clearOnSuccess ? limiter.reset(key) : limiter.refund(key))));
}
