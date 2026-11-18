import test from 'node:test';
import assert from 'node:assert/strict';
import { endedJobs, jobLink, jobNotice, kindLabel, parseTrackedJobs } from '../src/features/background-jobs.ts';
import { isRunning, startProblem } from '../src/features/conformance.ts';

const body = { data: { jobs: [
  { id: 'j1', kind: 'conformance', status: 'running', stage: 'Checked 1 of 3 commits', progress: 33, projectId: { _id: 'p1', name: 'Shop' }, requestedBy: { _id: 'u1', name: 'Bob' } },
  { _id: 'j2', kind: 'mine', status: 'queued', progress: 140, projectId: 'p2', requestedBy: 'u2' },
  { kind: 'scan', status: 'running' },
  null,
] } };

test('jobs from the server are read with their workspace, and only the signed-in person\'s are theirs', () => {
  const jobs = parseTrackedJobs(body, 'u1');
  assert.deepEqual(jobs.map(j => [j.id, j.projectId, j.project, j.kind, j.progress, j.mine]), [
    ['j1', 'p1', 'Shop', 'conformance', 33, true],
    ['j2', 'p2', 'a workspace', 'mine', 100, false],
  ]);
  assert.deepEqual(parseTrackedJobs({}, 'u1'), []);
  assert.equal(parseTrackedJobs(body, undefined).some(j => j.mine), false);
});

test('a notice comes only for the person\'s own jobs that were running and have ended', () => {
  const before = parseTrackedJobs(body, 'u1');
  const now = before.map(j => ({ ...j, status: 'completed' }));
  assert.deepEqual(endedJobs(before, now).map(j => j.id), ['j1']);
  assert.deepEqual(endedJobs([], now), [], 'a job first seen already finished brings no notice');
  assert.deepEqual(endedJobs(before, before), []);
  assert.deepEqual(endedJobs([], now, new Set(['j1'])).map(j => j.id), ['j1'], 'a job just started here is told even if it ended before it was seen running');
  assert.deepEqual(endedJobs([], before, new Set(['j1'])), [], 'not while it still runs');
});

test('each kind of job opens where its result is, and its notice says how it ended', () => {
  assert.equal(jobLink({ kind: 'conformance', projectId: 'p 1' }), '/project-maintainer/conformance?project=p%201');
  assert.equal(jobLink({ kind: 'abstract', projectId: 'p1' }), '/workspace/p1');
  assert.equal(jobLink({ kind: 'mine', projectId: 'p1' }), '/projects');
  assert.equal(kindLabel('other'), 'Background job');
  const job = { id: 'j', projectId: 'p', project: 'Shop', kind: 'conformance', progress: 100, mine: true };
  assert.deepEqual(jobNotice({ ...job, status: 'completed', stage: 'Checked 2 commits: 3 findings' }), { kind: 'success', title: 'Conformance check · Shop: done', description: 'Checked 2 commits: 3 findings' });
  assert.equal(jobNotice({ ...job, status: 'cancelled', stage: '' }).kind, 'warning');
  assert.deepEqual(jobNotice({ ...job, status: 'failed', stage: 'Failed: no diagram' }), { kind: 'error', title: 'Conformance check · Shop: failed', description: 'no diagram' });
});

test('a check is running while queued or running, and a busy workspace is explained', () => {
  assert.equal(isRunning({ status: 'queued' }), true);
  assert.equal(isRunning({ status: 'running' }), true);
  assert.equal(isRunning({ status: 'completed' }), false);
  assert.equal(isRunning(null), false);
  const busy = Object.assign(new Error('A job is already queued or running for this workspace'), { status: 409 });
  assert.match(startProblem(busy), /Another job \(mining, a scan or a check\)/);
  assert.equal(startProblem(new Error('Confirm the diagram first')), 'Confirm the diagram first');
  assert.equal(startProblem('x'), 'The check could not start.');
});
