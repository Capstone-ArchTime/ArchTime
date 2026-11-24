import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapRatio, bootstrapRatioDifference, holm, seededRandom } from '../src/domain/evaluation/stats.ts';

// RQ2 (paper Sect. 4, rq2-protocol §5): rates with 95% intervals from a cluster bootstrap that resamples questions, and
// paired differences between conditions with Holm correction.

test('the seeded generator repeats for the same seed and stays in [0, 1)', () => {
  const a = seededRandom(7), b = seededRandom(7), c = seededRandom(8);
  const xs = Array.from({ length: 5 }, a);
  assert.deepEqual(xs, Array.from({ length: 5 }, b));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, c));
  assert.ok(xs.every(x => x >= 0 && x < 1));
});

test('bootstrapRatio pools the clusters: the estimate is sum(num) / sum(den), not a mean of cluster rates', () => {
  // Cluster rates 1/1 and 0/9: the pooled rate is 1/10, the mean of the two rates would be 0.5.
  const r = bootstrapRatio([{ num: 1, den: 1 }, { num: 0, den: 9 }], { resamples: 2000, seed: 1 });
  assert.equal(r.estimate, 0.1);
  assert.ok(r.low <= r.estimate && r.estimate <= r.high);
  assert.ok(r.low >= 0 && r.high <= 1);
});

test('bootstrapRatio: identical clusters give a zero-width interval; the same seed gives the same interval', () => {
  const same = Array.from({ length: 6 }, () => ({ num: 2, den: 5 }));
  assert.deepEqual(bootstrapRatio(same, { resamples: 500, seed: 3 }), { estimate: 0.4, low: 0.4, high: 0.4 });
  const mixed = [{ num: 0, den: 4 }, { num: 4, den: 4 }, { num: 1, den: 4 }, { num: 3, den: 4 }, { num: 2, den: 4 }];
  assert.deepEqual(bootstrapRatio(mixed, { resamples: 1000, seed: 9 }), bootstrapRatio(mixed, { resamples: 1000, seed: 9 }));
  const r = bootstrapRatio(mixed, { resamples: 4000, seed: 9 });
  assert.ok(r.low < 0.5 && r.high > 0.5 && r.high - r.low < 0.8);
});

test('bootstrapRatio: no data gives no interval', () => {
  assert.deepEqual(bootstrapRatio([]), { estimate: null, low: null, high: null });
  assert.deepEqual(bootstrapRatio([{ num: 0, den: 0 }]), { estimate: null, low: null, high: null });
});

test('bootstrapRatioDifference: a clear gap in every cluster excludes zero; no gap gives p = 1', () => {
  const clear = Array.from({ length: 10 }, (_, i) => ({ a: { num: 8 + (i % 2), den: 10 }, b: { num: 1 + (i % 3), den: 10 } }));
  const d = bootstrapRatioDifference(clear, { resamples: 3000, seed: 5 });
  // a pools 85 / 100, b pools 19 / 100.
  assert.ok(Math.abs(d.estimate - 0.66) < 1e-9);
  assert.ok(d.low > 0, 'interval excludes zero');
  assert.ok(d.p < 0.01);
  const none = Array.from({ length: 8 }, () => ({ a: { num: 3, den: 6 }, b: { num: 3, den: 6 } }));
  const z = bootstrapRatioDifference(none, { resamples: 500, seed: 5 });
  assert.equal(z.estimate, 0);
  assert.equal(z.p, 1);
});

test('bootstrapRatioDifference keeps clusters paired: the same question is drawn for both conditions', () => {
  // Rates vary a lot between questions but a - b is always 0.1: a paired bootstrap sees a tight difference.
  const pairs = [0.1, 0.5, 0.9, 0.3, 0.7].map(x => ({ a: { num: Math.round((x + 0.1) * 100), den: 100 }, b: { num: Math.round(x * 100), den: 100 } }));
  const d = bootstrapRatioDifference(pairs, { resamples: 3000, seed: 2 });
  assert.ok(Math.abs(d.estimate - 0.1) < 1e-9);
  assert.ok(d.low > 0.09 && d.high < 0.11);
});

test('holm adjusts in order of the p-values and keeps them monotone; null stays null', () => {
  assert.deepEqual(holm([0.01, 0.04]), [0.02, 0.04]);
  assert.deepEqual(holm([0.03, 0.02]), [0.04, 0.04]);
  assert.deepEqual(holm([0.6, null, 0.01]), [0.6, null, 0.02]);
  assert.deepEqual(holm([0.7, 0.8]), [1, 1]);
});
