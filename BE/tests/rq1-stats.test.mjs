import test from 'node:test';
import assert from 'node:assert/strict';
import { cohenKappa, normalCdf, wilcoxonSignedRank } from '../src/domain/evaluation/stats.ts';

test('the normal CDF matches known values', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-4);
});

test('Wilcoxon signed-rank, exact: all positive differences', () => {
  // 8 positive differences with distinct sizes: W- = 0, exact two-sided p = 2 / 2^8.
  const x = [11, 12, 13, 14, 15, 16, 17, 18], y = [10, 10, 10, 10, 10, 10, 10, 10];
  const r = wilcoxonSignedRank(x, y);
  assert.deepEqual([r.n, r.wPlus, r.wMinus, r.exact, r.effect], [8, 36, 0, true, 1]);
  assert.equal(r.p, 0.0078);
});

test('Wilcoxon signed-rank, exact: a textbook example', () => {
  // Differences 1, -2, 3, 4, -5, 6 -> W+ = 1+3+4+6 = 14, W- = 7; 18 of the 64 sign patterns give W <= 7 -> p = 2 x 18/64.
  const r = wilcoxonSignedRank([1, -2, 3, 4, -5, 6], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([r.wPlus, r.wMinus], [14, 7]);
  assert.equal(r.p, 0.5625);
  assert.equal(r.effect, 0.3333);
});

test('Wilcoxon signed-rank drops zero differences and missing values, and uses the normal approximation with ties', () => {
  const r = wilcoxonSignedRank([5, 5, 6, null, 7, 8], [5, 4, 4, 1, 4, 4]);
  assert.equal(r.n, 4, 'one zero difference and one missing value dropped');
  const tied = wilcoxonSignedRank([2, 2, 3, 3], [1, 1, 1, 1]);
  assert.equal(tied.exact, false);
  assert.ok(tied.p > 0 && tied.p <= 1);
  assert.equal(wilcoxonSignedRank([1, 2], [1, 2]), null, 'no difference, no test');
});

test("Cohen's kappa", () => {
  // 10 items: 7 agreements; marginals A: 6 yes / 4 no, B: 5 yes / 5 no -> chance 0.5, kappa 0.4.
  const pairs = [['y', 'y'], ['y', 'y'], ['y', 'y'], ['y', 'y'], ['y', 'n'], ['y', 'n'], ['n', 'n'], ['n', 'n'], ['n', 'n'], ['n', 'y']];
  assert.deepEqual(cohenKappa(pairs), { n: 10, agreement: 0.7, kappa: 0.4 });
  assert.deepEqual(cohenKappa([['y', 'y'], ['y', 'y']]), { n: 2, agreement: 1, kappa: null }, 'one category only: kappa is undefined');
  assert.equal(cohenKappa([]), null);
});
