import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess } from '../src/auth/permissions.ts';
import { getAdminOrganization, listAdminOrganizations, personLabel, toAdminOrganizationDetail } from '../src/features/admin-organizations.ts';
import { mockGlobal } from './mock-global.mjs';

const storage = (initial = {}) => { const v = new Map(Object.entries(initial)); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, x), removeItem: k => v.delete(k) }; };
const signedIn = t => { mockGlobal(t, 'sessionStorage', storage({ accessToken: 'token' })); mockGlobal(t, 'localStorage', storage()); };

test('only System Administrators reach the organizations page', () => {
  assert.equal(canAccess('system-administrator', '/system-administrator/organizations'), true);
  assert.equal(canAccess('developer-analyst', '/system-administrator/organizations'), false);
});

test('the list asks the admin route with paging and search, and reads the envelope', async (t) => {
  signedIn(t);
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    asked.push(String(url));
    return Response.json({ success: true, data: { organizations: [{ id: 'o1', name: 'Acme', owners: [{ userId: 'u1', name: 'Olivia', email: 'o@x.io' }], memberCount: 3, projectCount: 2, createdBy: { userId: 'u1' }, createdAt: '2026-01-01T00:00:00Z' }] }, meta: { total: 11, page: 2, limit: 10 } });
  });
  const page = await listAdminOrganizations({ search: ' acme ', page: 2, limit: 10 });
  assert.match(asked[0], /\/admin\/organizations\?page=2&limit=10&search=acme$/);
  assert.equal(page.total, 11);
  assert.equal(page.items[0].memberCount, 3);
  assert.equal(personLabel(page.items[0].owners[0]), 'Olivia <o@x.io>');
});

test('a project keeps only its metadata, whatever else a response carries', () => {
  const detail = toAdminOrganizationDetail({
    id: 'o1', name: 'Acme', members: [{ userId: 'u1', name: 'Olivia', role: 'owner', joinedAt: '2026-01-01' }],
    projects: [{ id: 'p1', name: 'api', status: 'PARTIAL', visibility: 'private', totalCommits: 42, createdAt: '2026-01-02', repoUrl: 'https://x/secret.git', description: 'secret' }],
  });
  assert.deepEqual(Object.keys(detail.projects[0]).sort(), ['createdAt', 'id', 'name', 'status', 'totalCommits', 'visibility']);
  assert.equal(detail.members[0].role, 'owner');
  assert.equal(personLabel({ userId: 'gone', name: null, email: null }), 'Deleted account');
});

test('a malformed answer is an error, not an empty page', async (t) => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: {} }));
  await assert.rejects(listAdminOrganizations({ page: 1, limit: 10 }), /invalid organization list/);
  await assert.rejects(getAdminOrganization('o1'), /invalid organization/);
});
