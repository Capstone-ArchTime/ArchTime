import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMiningJobs } from '../src/features/mining-jobs.ts';
test('jobs accept lean Mongo IDs, missing relations and future statuses', () => {
  const [job] = parseMiningJobs({ data: { jobs: [{ _id: 'job', status: 'cancelled', projectId: null, progress: 120 }] } });
  assert.equal(job.id, 'job'); assert.equal(job.status, 'cancelled'); assert.equal(job.progress, 100);
  assert.equal(job.project, 'Unknown project'); assert.equal(job.requestedBy, 'Not provided');
});
test('malformed job responses fail visibly instead of becoming an empty list', () => {
  assert.throws(() => parseMiningJobs({ data: {} }), /invalid jobs list/);
  assert.throws(() => parseMiningJobs({ data: { jobs: [null] } }), /invalid job/);
});
