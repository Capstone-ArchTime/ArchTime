import type { IRateLimiter, RateLimitResult } from "../../domain/interfaces/IRateLimiter.js";
import { RateLimitModel } from "../database/models/RateLimitModel.js";

/**
 * Fixed-window rate limiter kept in MongoDB, so every server instance counts the same hits.
 *
 * `hit` is ONE findOneAndUpdate with an aggregation-pipeline update: it starts a new window when the stored one is over
 * and otherwise adds one, and it upserts when the key is new. MongoDB runs that as a single atomic document update, so
 * concurrent requests cannot read the same count and both squeeze in. The window ends are taken from this server's
 * clock; instances whose clocks differ by a few seconds only blur the edge of a window.
 */
export class MongoRateLimiter implements IRateLimiter {
  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = new Date(this.now());
    const windowEnd = new Date(now.getTime() + windowSeconds * 1000);
    // A missing resetAt (the document the upsert is creating) counts as "window over".
    const windowOpen = { $gt: [{ $ifNull: ["$resetAt", new Date(0)] }, now] };
    const update = [{
      $set: {
        count: { $cond: [windowOpen, { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
        resetAt: { $cond: [windowOpen, "$resetAt", windowEnd] },
      },
    }];
    const doc = await this.upsert(key, update);
    return {
      allowed: doc.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((doc.resetAt.getTime() - now.getTime()) / 1000)),
      remaining: Math.max(0, limit - doc.count),
    };
  }

  async refund(key: string): Promise<void> {
    await RateLimitModel.updateOne({ key, count: { $gt: 0 }, resetAt: { $gt: new Date(this.now()) } }, { $inc: { count: -1 } });
  }

  async reset(key: string): Promise<void> {
    await RateLimitModel.deleteOne({ key });
  }

  private async upsert(key: string, update: Record<string, unknown>[]) {
    // Two first-ever hits on a key can race to insert it; the loser gets a duplicate-key error and simply updates the winner's document.
    for (let attempt = 0; ; attempt++) {
      try {
        const doc = await RateLimitModel.findOneAndUpdate({ key }, update, { upsert: true, new: true }).lean();
        if (!doc) throw new Error("Rate limiter could not update its counter.");
        return doc;
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || attempt >= 2) throw err;
      }
    }
  }
}
