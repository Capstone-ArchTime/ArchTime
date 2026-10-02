import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageRows, describeBatchProgress, monthBounds } from '../src/features/mining-coverage.ts';
import { parseMiningJobs } from '../src/features/mining-jobs.ts';

test('coverage rows merge history with mined counts and never exceed the total', () => {
  const rows = coverageRows([{ month: '2024-02', commits: 3 }, { month: '2024-01', commits: 5 }], [{ month: '2024-01', commits: 9 }, { month: '2023-12', commits: 2 }, { month: 'bad', commits: 1 }]);
  assert.deepEqual(rows, [{ month: '2023-12', total: 2, mined: 2 }, { month: '2024-01', total: 5, mined: 5 }, { month: '2024-02', total: 3, mined: 0 }]);
});

test('month bounds handle leap years and reject bad input', () => {
  assert.deepEqual(monthBounds('2024-02'), { since: '2024-02-01', until: '2024-02-29' });
  assert.deepEqual(monthBounds('2023-12'), { since: '2023-12-01', until: '2023-12-31' });
  assert.throws(() => monthBounds('2024-13'));
});

test('batch progress text', () => {
  assert.equal(describeBatchProgress({ processed: 0, total: 0, batchIndex: 0, batchCount: 0 }), 'Preparing');
  assert.equal(describeBatchProgress({ processed: 120, total: 400, batchIndex: 3, batchCount: 8 }), 'Batch 3/8 · 120/400 commits');
});

test('job parsing keeps batch counters and tolerates older servers without them', () => {
  const [a, b] = parseMiningJobs({ data: { jobs: [{ _id: 'a', status: 'running', kind: 'mine', total: 400, processed: 120, batchIndex: 3, batchCount: 8 }, { _id: 'b', status: 'completed' }] } });
  assert.deepEqual([a.total, a.processed, a.batchIndex, a.batchCount, a.kind], [400, 120, 3, 8, 'mine']);
  assert.deepEqual([b.total, b.processed, b.kind], [0, 0, 'mine']);
});

import { formatMissing, missingRanges, summarizeCoverage, unminedBetween } from '../src/features/mining-coverage.ts';

const rows = [
  { month: '2024-01', total: 10, mined: 10 }, { month: '2024-02', total: 10, mined: 4 }, { month: '2024-03', total: 5, mined: 0 },
  { month: '2024-04', total: 8, mined: 8 }, { month: '2024-06', total: 3, mined: 1 },
];

test('missing ranges merge neighbouring months and split on gaps in the calendar', () => {
  assert.deepEqual(missingRanges(rows), [{ from: '2024-02', to: '2024-03', commits: 11 }, { from: '2024-06', to: '2024-06', commits: 2 }]);
  assert.equal(formatMissing(missingRanges(rows)), '2024-02 to 2024-03 (11), 2024-06 (2)');
  assert.equal(formatMissing([1, 2, 3, 4].map(n => ({ from: `2024-0${n}`, to: `2024-0${n}`, commits: n }))), '2024-01 (1), 2024-02 (2), 2024-03 (3) and 1 more');
});

test('year boundaries are contiguous', () => {
  const r = [{ month: '2023-12', total: 2, mined: 0 }, { month: '2024-01', total: 2, mined: 0 }];
  assert.deepEqual(missingRanges(r), [{ from: '2023-12', to: '2024-01', commits: 4 }]);
});

test('coverage summary distinguishes empty, unknown, partial and complete', () => {
  const mined = (count, monthly = []) => ({ count, firstDate: '2024-01-05', lastDate: '2024-04-20', monthly });
  assert.equal(summarizeCoverage({ history: null, mined: mined(0), remaining: null }).kind, 'empty');
  assert.equal(summarizeCoverage({ history: null, mined: mined(7), remaining: null }).kind, 'unknown');
  assert.equal(summarizeCoverage({ history: { totalCommits: 7, monthly: [] }, mined: mined(7), remaining: 0 }).kind, 'complete');
  const partial = summarizeCoverage({ history: { totalCommits: 20, monthly: [{ month: '2024-01', commits: 20 }] }, mined: mined(5, [{ month: '2024-01', commits: 5 }]), remaining: 15 });
  assert.equal(partial.kind, 'partial');
  assert.deepEqual(partial.missing, [{ from: '2024-01', to: '2024-01', commits: 15 }]);
});

test('unmined commits between two revisions count whole months in either order', () => {
  assert.equal(unminedBetween(rows, '2024-01-20T00:00:00Z', '2024-03-02T00:00:00Z'), 11);
  assert.equal(unminedBetween(rows, '2024-03-02T00:00:00Z', '2024-01-20T00:00:00Z'), 11);
  assert.equal(unminedBetween(rows, '2024-04-01T00:00:00Z', '2024-04-30T00:00:00Z'), 0);
});
