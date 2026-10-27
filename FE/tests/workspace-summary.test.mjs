import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { parseWorkspace, parseWorkspaceList, nextStep, workspaceStats, mayHaveSnapshots, hasMinedHistory, byRecent, parseSnapshotPage, structuralChanges } = await import('../src/features/workspace-summary.ts');

const project = (over = {}) => ({ id: 'p1', name: 'cors', repoUrl: 'https://github.com/expressjs/cors', status: 'PENDING', userRole: 'owner', ...over });

test('a workspace keeps only real fields: no description or commit count is invented', () => {
  const w = parseWorkspace(project());
  assert.equal(w.description, '');
  assert.equal(w.totalCommits, null);
  assert.equal(w.role, 'owner');
  assert.equal(parseWorkspace(project({ history: { totalCommits: 37, lastCommitDate: '2024-01-02T00:00:00Z' } })).totalCommits, 37);
});

test('statuses are read case-insensitively and unknown ones do not crash', () => {
  assert.equal(parseWorkspace(project({ status: 'partial' })).status, 'PARTIAL');
  assert.equal(parseWorkspace(project({ status: 'archived' })).status, 'UNKNOWN');
  assert.equal(parseWorkspace({ name: 'no id' }), null);
});

test('the list total comes from the server, falling back to the rows', () => {
  assert.equal(parseWorkspaceList({ data: { projects: [project()] }, meta: { total: 140 } }).total, 140);
  assert.equal(parseWorkspaceList({ data: { projects: [] } }).total, 0);
  assert.throws(() => parseWorkspaceList({ data: {} }), /invalid list/);
  assert.throws(() => parseWorkspaceList({ data: { projects: [null] } }), /invalid workspace/);
});

test('PARTIAL workspaces count as having history, not only COMPLETED ones', () => {
  assert.ok(hasMinedHistory({ status: 'PARTIAL' }));
  assert.ok(hasMinedHistory({ status: 'COMPLETED' }));
  assert.ok(mayHaveSnapshots({ status: 'ANALYZING' }));
  assert.ok(!mayHaveSnapshots({ status: 'PENDING' }));
  assert.ok(!mayHaveSnapshots({ status: 'FAILED' }));
});

test('the next step follows create, scan, mine, group into components', () => {
  assert.equal(nextStep({ id: 'p1', status: 'PENDING', totalCommits: null }).action, 'scan');
  const mine = nextStep({ id: 'p1', status: 'PENDING', totalCommits: 37 });
  assert.equal(mine.action, 'mine'); assert.match(mine.hint, /37 commits/);
  assert.equal(nextStep({ id: 'p1', status: 'ANALYZING', totalCommits: 37 }).action, 'wait');
  assert.equal(nextStep({ id: 'p1', status: 'FAILED', totalCommits: 37 }).action, 'mine');
  const open = nextStep({ id: 'a/b', status: 'PARTIAL', totalCommits: 37 });
  assert.equal(open.action, 'open'); assert.equal(open.to, '/workspace/a%2Fb');
});

test('stats add up real values and are all zero for a new account', () => {
  const empty = workspaceStats({ workspaces: [], total: 0 }, { jobs: [], total: 0 });
  assert.deepEqual(empty, { workspaces: 0, commitsFound: 0, mined: 0, jobs: 0, activeJobs: 0 });
  const list = parseWorkspaceList({ data: { projects: [
    project({ status: 'PARTIAL', history: { totalCommits: 37 } }),
    project({ id: 'p2', history: { totalCommits: 5 } }),
    project({ id: 'p3' }),
  ] }, meta: { total: 3 } });
  const jobs = [{ status: 'running' }, { status: 'completed' }, { status: 'queued' }];
  assert.deepEqual(workspaceStats(list, { jobs, total: 12 }), { workspaces: 3, commitsFound: 42, mined: 1, jobs: 12, activeJobs: 2 });
});

test('recent workspaces come first and undated ones last', () => {
  const rows = [parseWorkspace(project({ id: 'old', updatedAt: '2024-01-01T00:00:00Z' })), parseWorkspace(project({ id: 'none' })), parseWorkspace(project({ id: 'new', updatedAt: '2025-01-01T00:00:00Z' }))];
  assert.deepEqual(rows.sort(byRecent).map(r => r.id), ['new', 'old', 'none']);
});

test('mined commits keep their real counts and only structural ones count as changes', () => {
  const { rows, total } = parseSnapshotPage({ data: { snapshots: [
    { id: 's1', hash: 'abcdef1234', title: 'docs', author: 'A', date: '2024-01-01T00:00:00Z', archChanges: 0 },
    { id: 's2', hash: '1234567890', title: 'split router', author: 'B', date: '2024-02-01T00:00:00Z', depAdded: 2, nodes: [{}, {}], edges: [{}] },
    { id: 's3', hash: 'fedcba9876', title: '', author: 'C', date: '2024-03-01T00:00:00Z', archChanges: 1 },
  ] }, meta: { total: 37 } });
  assert.equal(total, 37);
  assert.equal(rows[0].hash, 'abcdef1');
  assert.equal(rows[1].modules, 2); assert.equal(rows[1].dependencies, 1);
  assert.equal(rows[2].title, 'No commit message');
  assert.deepEqual(structuralChanges(rows).map(r => r.id), ['s3', 's2']);
  assert.throws(() => parseSnapshotPage({ data: { snapshots: [{ id: 'x', hash: 'y', date: 'not a date' }] } }), /invalid mined commit/);
});

test('members who only read a workspace are not sent to scan or mine it', () => {
  assert.equal(parseWorkspace(project({ isMaintainer: true })).canMaintain, true);
  assert.equal(parseWorkspace(project()).canMaintain, false, 'not said by the server means read only');
  for (const w of [{ status: 'PENDING', totalCommits: null }, { status: 'PENDING', totalCommits: 37 }, { status: 'FAILED', totalCommits: 37 }]) {
    const step = nextStep({ id: 'p1', ...w, canMaintain: false });
    assert.equal(step.action, 'wait', w.status);
    assert.match(step.hint, /maintainers/);
  }
  const open = nextStep({ id: 'p1', status: 'COMPLETED', totalCommits: 37, canMaintain: false });
  assert.equal(open.action, 'open'); assert.doesNotMatch(open.label, /Group/);
  assert.equal(nextStep({ id: 'p1', status: 'PENDING', totalCommits: 37, canMaintain: true }).action, 'mine');
});
