import test from 'node:test';
import assert from 'node:assert/strict';
import { getMyOrganizations, getMyWorkspaces, groupWorkspaces, orderPaths, statusView, summarizeLearning, workspaceRoleBreakdown, workspacesPerOrganization } from '../src/features/my-work.ts';
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const signedIn = t => {
  t.mock.property(globalThis, 'sessionStorage', storage({ accessToken: 'token' }));
  t.mock.property(globalThis, 'localStorage', storage());
};

const ws = (id, extra = {}) => ({ id, name: id, description: '', status: 'COMPLETED', userRole: 'developer-analyst', organizationId: null, totalCommits: 1, lastCommitDate: null, updatedAt: null, ...extra });
const org = (id, name, myRole = 'member') => ({ id, name, description: '', myRole, memberCount: 3 });

test('workspaces are grouped by space: personal first, then organizations by name, unknown organizations last', () => {
  const groups = groupWorkspaces(
    [ws('zeta', { organizationId: 'o2' }), ws('mine', { userRole: 'owner' }), ws('alpha', { organizationId: 'o1' }), ws('ghost', { organizationId: 'o9' }), ws('spook', { organizationId: 'o8' }), ws('joined')],
    [org('o1', 'Beta Corp'), org('o2', 'Acme', 'owner')],
  );
  assert.deepEqual(groups.map(g => g.title), ['Personal space', 'Acme', 'Beta Corp', 'Other organizations']);
  assert.deepEqual(groups[0].workspaces.map(w => w.id), ['mine', 'joined']);
  assert.equal(groups[1].organization.myRole, 'owner');
  assert.equal(groups[3].organization, null);
  assert.deepEqual(groups[3].workspaces.map(w => w.id), ['ghost', 'spook']);
});

test('workspaces per organization count only organization workspaces', () => {
  const counts = workspacesPerOrganization([ws('a', { organizationId: 'o1' }), ws('b', { organizationId: 'o1' }), ws('c')]);
  assert.deepEqual([...counts], [['o1', 2]]);
});

test('the role breakdown names every role present, so it adds up to the total', () => {
  assert.equal(workspaceRoleBreakdown([ws('a', { userRole: 'owner' }), ws('b', { userRole: 'viewer' }), ws('c', { userRole: 'owner' })]), '2 owned · 1 view only');
  assert.equal(workspaceRoleBreakdown([]), 'none yet');
});

test('learning summary counts finished, started and untouched paths, and overall step progress', () => {
  const s = summarizeLearning([{ done: 4, total: 4 }, { done: 1, total: 4 }, { done: 0, total: 2 }]);
  assert.deepEqual(s, { assigned: 3, finished: 1, inProgress: 1, notStarted: 1, percent: 50 });
  assert.deepEqual(summarizeLearning([]), { assigned: 0, finished: 0, inProgress: 0, notStarted: 0, percent: 0 });
});

test('unfinished paths come first, most recent activity first', () => {
  const ordered = orderPaths([
    { id: 'done', done: 2, total: 2, lastActivityAt: '2026-10-20' },
    { id: 'old', done: 1, total: 3, lastActivityAt: '2026-09-01' },
    { id: 'recent', done: 0, total: 3, lastActivityAt: '2026-10-21' },
  ]);
  assert.deepEqual(ordered.map(p => p.id), ['recent', 'old', 'done']);
});

test('unknown statuses are shown as they are instead of breaking the page', () => {
  assert.equal(statusView('PARTIAL').label, 'Partly mined');
  assert.deepEqual(statusView('SOMETHING_NEW'), { label: 'SOMETHING_NEW', color: 'default' });
});

test('workspaces are read page by page until the total is reached', async t => {
  signedIn(t);
  const urls = [];
  const all = Array.from({ length: 130 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, status: 'COMPLETED', userRole: 'owner', history: { totalCommits: i } }));
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return Response.json({ success: true, data: { projects: all.slice((page - 1) * 100, page * 100) }, meta: { total: 130 } });
  });
  const { workspaces, total } = await getMyWorkspaces();
  assert.equal(urls.length, 2);
  assert.match(urls[0], /scope=all&limit=100&page=1$/);
  assert.equal(total, 130);
  assert.equal(workspaces.length, 130);
  assert.equal(workspaces[5].totalCommits, 5);
  assert.equal(workspaces[5].organizationId, null);
});

test('organizations are read with the account role, and a bad response is an error', async t => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: { organizations: [{ id: 'o1', name: 'Acme', myRole: 'owner', memberCount: 4 }] } }));
  assert.deepEqual(await getMyOrganizations(), [{ id: 'o1', name: 'Acme', description: '', myRole: 'owner', memberCount: 4 }]);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: {} }));
  await assert.rejects(getMyOrganizations(), /invalid list of organizations/);
});
