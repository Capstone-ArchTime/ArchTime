import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { teamRows, filterTeamRows } = await import('../src/pages/project-maintainer/team-rows.ts');
const { updateMemberRole, removeMember } = await import('../src/features/pm-api.ts');

Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });

const owner = {
  id: 'm-own-a', name: 'Olivia', email: 'olivia@test', role: 'owner', status: 'active', projects: ['a', 'b'],
  memberships: [
    { projectId: 'a', memberId: 'm-own-a', role: 'owner', status: 'active' },
    { projectId: 'b', memberId: 'm-own-b', role: 'owner', status: 'active' },
  ],
};
const sam = {
  id: 'm-sam-a', name: 'Sam', email: 'sam@test', role: 'developer-analyst', status: 'active', projects: ['a', 'b'],
  memberships: [
    { projectId: 'a', memberId: 'm-sam-a', role: 'developer-analyst', status: 'active' },
    { projectId: 'b', memberId: 'm-sam-b', role: 'project-maintainer', status: 'invited' },
  ],
};

test('a member of two workspaces gets one row per workspace, each with that membership', () => {
  const rows = teamRows([sam]);
  assert.deepEqual(rows.map(r => [r.projectId, r.memberId, r.role, r.status]), [
    ['a', 'm-sam-a', 'developer-analyst', 'active'],
    ['b', 'm-sam-b', 'project-maintainer', 'invited'],
  ]);
  assert.equal(new Set(rows.map(r => r.key)).size, 2);
});

test("the owner's rows are marked so the page shows Owner and offers no role change or removal", () => {
  const rows = teamRows([owner, sam]);
  assert.deepEqual(rows.filter(r => r.isOwner).map(r => r.memberId), ['m-own-a', 'm-own-b']);
  assert.ok(rows.filter(r => r.email === 'sam@test').every(r => !r.isOwner));
});

test('filtering by workspace keeps only that workspace’s rows; search matches name or email', () => {
  const rows = teamRows([owner, sam]);
  assert.deepEqual(filterTeamRows(rows, '', 'b').map(r => r.memberId), ['m-own-b', 'm-sam-b']);
  assert.deepEqual(filterTeamRows(rows, ' SAM ', 'all').map(r => r.memberId), ['m-sam-a', 'm-sam-b']);
  assert.deepEqual(filterTeamRows(rows, 'olivia@', 'a').map(r => r.memberId), ['m-own-a']);
  assert.deepEqual(teamRows([{ ...sam, memberships: undefined }]), []);
});

test('role changes and removals go to the member route of the chosen workspace', async t => {
  t.mock.property(globalThis, 'sessionStorage', { getItem: () => 'token', setItem() {} });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([init?.method, String(url).replace(/^.*\/api/, '')]);
    return Response.json({ success: true, data: { member: {} } });
  });
  await updateMemberRole('b', 'm-sam-b', 'developer-analyst');
  await removeMember('b', 'm-sam-b');
  assert.deepEqual(calls, [['PATCH', '/projects/b/members/m-sam-b'], ['DELETE', '/projects/b/members/m-sam-b']]);
});
