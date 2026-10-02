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
