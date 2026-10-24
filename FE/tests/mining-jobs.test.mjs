import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMiningJobs } from '../src/features/mining-jobs.ts';
test('jobs accept lean Mongo IDs, missing relations and future statuses', () => {
  const [job] = parseMiningJobs({ data: { jobs: [{ _id: 'job', status: 'cancelled', projectId: null, progress: 120 }] } });
  assert.equal(job.id, 'job'); assert.equal(job.status, 'cancelled'); assert.equal(job.progress, 100);
  assert.equal(job.project, 'Unknown workspace'); assert.equal(job.requestedBy, 'Not provided');
});
test('the requester shows by name, never as a raw account id', () => {
  const [named, unresolved] = parseMiningJobs({ data: { jobs: [
    { _id: 'a', status: 'completed', requestedBy: { _id: 'u1', name: 'Owner Tester' } },
    { _id: 'b', status: 'completed', requestedBy: '6add01a769426f6c22ee7bdb' },
  ] } });
  assert.equal(named.requestedBy, 'Owner Tester');
  assert.equal(unresolved.requestedBy, 'Unknown account');
});
test('malformed job responses fail visibly instead of becoming an empty list', () => {
  assert.throws(() => parseMiningJobs({ data: {} }), /invalid jobs list/);
  assert.throws(() => parseMiningJobs({ data: { jobs: [null] } }), /invalid job/);
});
