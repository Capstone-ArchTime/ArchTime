import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { countManagedProjects, getManagedProjects } = await import('../src/features/project-data.ts');
const { ApiError } = await import('../src/api/client.ts');
const { describeAccessError, pickWorkspace } = await import('../src/pages/project-maintainer/managed-access.ts');

Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
function storage() {
  const values = new Map([['accessToken', 'token']]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function serve(t, body, status = 200) {
  t.mock.property(globalThis, 'sessionStorage', storage());
  t.mock.property(globalThis, 'localStorage', storage());
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return Response.json(body, { status }); });
  return urls;
}

test('the maintainer pages list only the workspaces the account manages', async t => {
  const urls = serve(t, { success: true, data: { projects: [{ id: 'a', name: 'Alpha', extra: 1 }] } });
  assert.deepEqual(await getManagedProjects(), [{ id: 'a', name: 'Alpha' }]);
  assert.match(urls[0], /\/projects\?scope=managed&limit=100$/);
});

test('whether to show the Maintain group asks for one managed workspace and reads the total', async t => {
  const urls = serve(t, { success: true, data: { projects: [{ id: 'a', name: 'Alpha' }] }, meta: { total: 3 } });
  assert.equal(await countManagedProjects(), 3);
  assert.match(urls[0], /\/projects\?scope=managed&limit=1$/);
});

test('an empty or total-less answer still counts the rows, and nonsense is rejected', async t => {
  serve(t, { success: true, data: { projects: [] }, meta: { total: 0 } });
  assert.equal(await countManagedProjects(), 0);
  t.mock.restoreAll();
  serve(t, { success: true, data: { projects: [{ id: 'a', name: 'A' }] } });
  assert.equal(await countManagedProjects(), 1);
  t.mock.restoreAll();
  serve(t, { success: true, data: {} });
  await assert.rejects(countManagedProjects(), /invalid list/);
  await assert.rejects(getManagedProjects(), /invalid list/);
});

test('a 403 from the server reads as "you do not maintain this workspace"', async t => {
  serve(t, { success: false, error: { message: 'Forbidden: only project maintainers can perform this action.' } }, 403);
  const error = await getManagedProjects().catch(e => e);
  assert.ok(error instanceof ApiError);
  assert.match(describeAccessError(error, 'fallback'), /do not maintain this workspace/);
  assert.equal(describeAccessError(new ApiError('Server down', 500), 'fallback'), 'Server down');
  assert.equal(describeAccessError('odd', 'fallback'), 'fallback');
});

test('a page opens the linked workspace only when the account maintains it', () => {
  const projects = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  assert.equal(pickWorkspace(projects, 'b'), 'b');
  assert.equal(pickWorkspace(projects, 'not-mine'), 'a');
  assert.equal(pickWorkspace(projects), 'a');
  assert.equal(pickWorkspace([], 'b'), '');
});

test('the maintainer overview reads the summary the server actually sends', async () => {
  const { toProjectDashboard } = await import('../src/features/pm-api.ts');
  const server = {
    project: { id: 'p1', name: 'Alpha', description: 'Demo', repoUrl: 'x' },
    architecture: { revision: 4, componentsCount: 9, dependenciesCount: 3, isConfirmed: true, confirmedAt: '2026-10-01T00:00:00.000Z' },
    rules: { total: 5, active: 3, compliancePercent: 80, violationsCount: 2, warningsCount: 0 },
    decisions: { total: 7, accepted: 5, proposed: 2 },
    approvals: { pendingCount: 1, totalCount: 4 },
    team: { totalMembers: 3, maintainersCount: 1, membersCount: 2 },
  };
  assert.deepEqual(toProjectDashboard(server), {
    project: { id: 'p1', name: 'Alpha', description: 'Demo' },
    diagram: { componentsCount: 9, revision: 4, confirmedAt: '2026-10-01T00:00:00.000Z' },
    rules: { total: 5, enabled: 3, violations: 2 },
    decisions: { total: 7 },
    approvals: { pending: 1 },
    team: { active: 3, invited: 0 },
  });
  assert.equal(toProjectDashboard({ project: { id: 'p1', name: 'Alpha' }, architecture: { confirmedAt: null } }).diagram.confirmedAt, undefined);
  assert.throws(() => toProjectDashboard(undefined), /invalid workspace summary/);
  assert.throws(() => toProjectDashboard({ dashboard: {} }), /invalid workspace summary/);
});
