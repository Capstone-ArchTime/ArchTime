import "./setup-env.mjs";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { InMemoryRateLimiter } from "../src/infrastructure/services/InMemoryRateLimiter.ts";
import { MongoRateLimiter } from "../src/infrastructure/repositories/MongoRateLimiter.ts";
import { RateLimitModel } from "../src/infrastructure/database/models/RateLimitModel.ts";

// The same behaviour is checked on both implementations. The Mongo one runs against a throwaway database on a real
// MongoDB (atomicity cannot be shown with a mock) and is skipped when none is reachable. Set MONGODB_TEST_URI to use a
// server other than the local default. Both take a fake clock, so no test waits for a window to pass.
const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_rl_${randomUUID().slice(0, 8)}`;
let connected = false;
let unavailable = "MongoDB is not reachable";

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await RateLimitModel.syncIndexes(); // the unique key index is what makes concurrent first hits safe
    connected = true;
  } catch (err) {
    unavailable = `MongoDB is not usable: ${err.message}`;
    connected = false;
  }
});

after(async () => {
  if (connected) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

function clock() {
  // Starts at the real time and only moves forward, so a stored window never looks long-expired to MongoDB's own TTL sweep.
  const state = { t: Date.now() };
  return { now: () => state.t, advance: seconds => { state.t += seconds * 1000; } };
}

function behaviour(label, make, needsMongo) {
  describe(label, () => {
    const prefix = () => `k-${randomUUID()}`;
    const it = (name, body) => test(name, async t => {
      if (needsMongo && !connected) return t.skip(unavailable);
      await body(t);
    });

    it("the first hit starts a window and is allowed", async () => {
      const c = clock();
      const result = await make(c.now).hit(prefix(), 3, 60);
      assert.deepEqual(result, { allowed: true, retryAfterSeconds: 60, remaining: 2 });
    });

    it("the limit itself is allowed, the next hit is refused, and refusing does not move the window", async () => {
      const c = clock();
      const limiter = make(c.now);
      const key = prefix();
      for (let i = 1; i <= 3; i++) assert.equal((await limiter.hit(key, 3, 60)).allowed, true, `hit ${i}`);
      c.advance(10);
      const refused = await limiter.hit(key, 3, 60);
      assert.deepEqual(refused, { allowed: false, retryAfterSeconds: 50, remaining: 0 });
      c.advance(10);
      assert.equal((await limiter.hit(key, 3, 60)).retryAfterSeconds, 40, "more refused hits do not push the end of the window out");
    });

    it("the counter starts again once the window is over", async () => {
      const c = clock();
      const limiter = make(c.now);
      const key = prefix();
      await limiter.hit(key, 1, 60);
      assert.equal((await limiter.hit(key, 1, 60)).allowed, false);
      c.advance(59);
      assert.equal((await limiter.hit(key, 1, 60)).allowed, false, "one second before the end");
      c.advance(1);
      assert.deepEqual(await limiter.hit(key, 1, 60), { allowed: true, retryAfterSeconds: 60, remaining: 0 });
    });

    it("two keys count independently", async () => {
      const c = clock();
      const limiter = make(c.now);
      const [a, b] = [prefix(), prefix()];
      await limiter.hit(a, 1, 60);
      assert.equal((await limiter.hit(a, 1, 60)).allowed, false);
      assert.equal((await limiter.hit(b, 1, 60)).allowed, true);
    });

    it("50 hits at the same moment allow exactly the limit", async () => {
      const limiter = make(clock().now);
      const key = prefix();
      const results = await Promise.all(Array.from({ length: 50 }, () => limiter.hit(key, 7, 60)));
      assert.equal(results.filter(r => r.allowed).length, 7);
      assert.equal(results.filter(r => !r.allowed).length, 43);
      assert.equal(Math.min(...results.map(r => r.remaining)), 0);
    });

    it("a refund gives one hit back, never below zero and never into an ended window", async () => {
      const c = clock();
      const limiter = make(c.now);
      const key = prefix();
      await limiter.hit(key, 2, 60);
      await limiter.hit(key, 2, 60);
      assert.equal((await limiter.hit(key, 2, 60)).allowed, false);
      await limiter.refund(key); // 3 -> 2, so the limit is reached but not passed
      await limiter.refund(key); // 2 -> 1
      assert.deepEqual(await limiter.hit(key, 2, 60), { allowed: true, retryAfterSeconds: 60, remaining: 0 });
      const fresh = prefix();
      await limiter.refund(fresh); // nothing to give back
      assert.equal((await limiter.hit(fresh, 1, 60)).allowed, true);
      assert.equal((await limiter.hit(fresh, 1, 60)).allowed, false, "a refund on an unknown key did not create credit");
      c.advance(61);
      await limiter.refund(key); // the window is over: the next window must not lose a hit to it
      await limiter.hit(key, 1, 60);
      assert.equal((await limiter.hit(key, 1, 60)).allowed, false);
    });

    it("a reset forgets the key", async () => {
      const limiter = make(clock().now);
      const key = prefix();
      await limiter.hit(key, 1, 60);
      assert.equal((await limiter.hit(key, 1, 60)).allowed, false);
      await limiter.reset(key);
      assert.equal((await limiter.hit(key, 1, 60)).allowed, true);
      await limiter.reset(prefix()); // unknown key: harmless
    });
  });
}

behaviour("in-memory limiter", now => new InMemoryRateLimiter(now), false);
behaviour("Mongo limiter", now => new MongoRateLimiter(now), true);

describe("Mongo limiter, what only a real database shows", () => {
  test("concurrent FIRST hits on a new key (racing upserts) all succeed and count exactly", async t => {
    if (!connected) return t.skip(unavailable);
    const limiter = new MongoRateLimiter();
    const key = `race-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.hit(key, 10, 60)));
    assert.equal(results.filter(r => r.allowed).length, 10);
    assert.equal(await RateLimitModel.countDocuments({ key }), 1, "one document per key");
    assert.equal((await RateLimitModel.findOne({ key }).lean()).count, 50);
  });

  test("the window really ends: a short window on the real clock lets the key through again", async t => {
    if (!connected) return t.skip(unavailable);
    const limiter = new MongoRateLimiter();
    const key = `real-${randomUUID()}`;
    await limiter.hit(key, 1, 1);
    assert.equal((await limiter.hit(key, 1, 1)).allowed, false);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal((await limiter.hit(key, 1, 1)).allowed, true);
  });

  test("two limiter instances (two servers) share one count", async t => {
    if (!connected) return t.skip(unavailable);
    const [a, b] = [new MongoRateLimiter(), new MongoRateLimiter()];
    const key = `shared-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).hit(key, 5, 60)));
    assert.equal(results.filter(r => r.allowed).length, 5);
  });

  test("the collection has a unique key index and a TTL index on resetAt", async t => {
    if (!connected) return t.skip(unavailable);
    const indexes = await RateLimitModel.collection.indexes();
    assert.ok(indexes.some(i => i.key.key === 1 && i.unique === true), "unique key");
    assert.ok(indexes.some(i => i.key.resetAt === 1 && i.expireAfterSeconds === 0), "TTL on resetAt");
  });
});
