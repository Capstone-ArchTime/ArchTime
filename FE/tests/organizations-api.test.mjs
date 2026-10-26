import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMember, buildRegistration, checkCredentialName, checkEmail, checkOrganizationName, checkToken, createCredential, isLastOwner,
  listCredentials, listOrganizations, memberActions, removeMember, workspaceSpaces,
} from '../src/features/organizations-api.ts';
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
const member = (id, role, userId = `u-${id}`) => ({ id, userId, name: id, email: `${id}@x.test`, role, createdAt: null });

test('form checks match the server limits', () => {
  assert.equal(checkOrganizationName(' A '), 'Use 2 to 100 characters.');
  assert.equal(checkOrganizationName('Acme'), null);
  assert.equal(checkEmail('nope'), 'Enter a valid email address.');
  assert.equal(checkEmail(' a@b.co '), null);
  assert.equal(checkCredentialName(''), 'Use 1 to 80 characters.');
  assert.equal(checkToken('short'), 'Use 8 to 1024 characters.');
  assert.equal(checkToken('ghp_abc def'), 'A token has no spaces.');
  assert.equal(checkToken('ghp_1234567890'), null);
});

test('the last owner can be neither demoted nor removed, and cannot leave', () => {
  const owner = member('o', 'owner', 'me'), m = member('m', 'member');
  const members = [owner, m];
  assert.equal(isLastOwner(members, owner), true);
  assert.deepEqual(memberActions(members, owner, { userId: 'me', role: 'owner' }), {
    changeRole: false, remove: false, leave: false, reason: 'An organization needs at least one owner. Make someone else an owner first.',
  });
  assert.deepEqual(memberActions(members, m, { userId: 'me', role: 'owner' }), { changeRole: true, remove: true, leave: false });
});

test('a member can only leave; an owner with a co-owner can step down or leave', () => {
  const a = member('a', 'owner', 'me'), b = member('b', 'owner'), c = member('c', 'member', 'c-user');
  const members = [a, b, c];
  assert.deepEqual(memberActions(members, c, { userId: 'c-user', role: 'member' }), { changeRole: false, remove: false, leave: true });
  assert.deepEqual(memberActions(members, b, { userId: 'c-user', role: 'member' }), { changeRole: false, remove: false, leave: false });
  assert.deepEqual(memberActions(members, a, { userId: 'me', role: 'owner' }), { changeRole: true, remove: false, leave: true });
});

test('new workspaces go to the personal space or an organization the account owns', () => {
  const orgs = [
    { id: 'z', name: 'Zeta', description: '', myRole: 'owner', memberCount: 1, createdAt: null },
    { id: 'm', name: 'Member Only', description: '', myRole: 'member', memberCount: 3, createdAt: null },
    { id: 'a', name: 'Acme', description: '', myRole: 'owner', memberCount: 2, createdAt: null },
  ];
  assert.deepEqual(workspaceSpaces(orgs), [{ value: '', label: 'Personal space' }, { value: 'a', label: 'Acme' }, { value: 'z', label: 'Zeta' }]);
});

test('the registration body follows the server rules for tokens and credentials', () => {
  const base = { name: ' Shop ', description: '', repoUrl: 'https://github.com/a/b', visibility: 'public', organizationId: '', access: 'token', token: '', credentialId: '' };
  assert.deepEqual(buildRegistration(base), { body: { name: 'Shop', description: '', repoUrl: 'https://github.com/a/b', visibility: 'public' } });
  assert.deepEqual(buildRegistration({ ...base, name: '' }), { problem: 'Workspace name and repository URL are required.' });
  assert.match(buildRegistration({ ...base, visibility: 'private' }).problem, /personal access token/);
  assert.equal(buildRegistration({ ...base, visibility: 'private', token: ' ghp_x ' }).body.token, 'ghp_x');
  // A credential is only for organization workspaces, and replaces the token.
  const org = { ...base, visibility: 'private', organizationId: 'o1', access: 'credential', token: 'leftover' };
  assert.match(buildRegistration(org).problem, /Choose one of the organization/);
  assert.deepEqual(buildRegistration({ ...org, credentialId: 'c1' }).body, { name: 'Shop', description: '', repoUrl: 'https://github.com/a/b', visibility: 'private', organizationId: 'o1', credentialId: 'c1' });
  assert.equal(buildRegistration({ ...base, visibility: 'private', access: 'credential', credentialId: 'c1', token: 'ghp_y' }).body.credentialId, undefined, 'personal space ignores credentials');
  // A public organization workspace needs neither.
  assert.deepEqual(buildRegistration({ ...base, organizationId: 'o1', access: 'credential', credentialId: 'c1' }).body.credentialId, undefined);
});

test('API calls use the organization routes and read their envelopes', async t => {
  signedIn(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(`${options.method ?? 'GET'} ${new URL(url).pathname}${options.body ? ' ' + options.body : ''}`);
    if (url.endsWith('/organizations')) return Response.json({ success: true, data: { organizations: [{ id: 'o1', name: 'Acme', myRole: 'owner', memberCount: 2 }] } });
    if (url.endsWith('/members') && options.method === 'POST') return Response.json({ success: true, data: { member: { id: 'm9', userId: 'u9', name: 'Lan', email: 'lan@x.test', role: 'member' } } });
    if (url.endsWith('/credentials') && options.method === 'POST') return Response.json({ success: true, data: { credential: { id: 'c1', name: 'CI', provider: 'github', last4: 'abcd', usedBy: 0 } } });
    if (url.endsWith('/credentials')) return Response.json({ success: true, data: { credentials: [{ id: 'c1', name: 'CI', provider: 'weird', last4: 'abcd', usedBy: 2 }] } });
    return Response.json({ success: true, data: { removedProjectMemberships: 3 } });
  });
  assert.equal((await listOrganizations())[0].myRole, 'owner');
  assert.equal((await addMember('o1', { email: 'lan@x.test', role: 'member' })).name, 'Lan');
  const created = await createCredential('o1', { name: 'CI', provider: 'github', token: 'ghp_secret123' });
  assert.equal(created.last4, 'abcd');
  assert.equal('token' in created, false, 'the token never comes back');
  assert.equal((await listCredentials('o1'))[0].provider, 'other', 'unknown providers are shown as Other');
  assert.deepEqual(await removeMember('o1', 'm9'), { removedProjectMemberships: 3 });
  assert.deepEqual(calls.map(c => c.split(' ').slice(0, 2).join(' ')), [
    'GET /api/organizations', 'POST /api/organizations/o1/members', 'POST /api/organizations/o1/credentials',
    'GET /api/organizations/o1/credentials', 'DELETE /api/organizations/o1/members/m9',
  ]);
});

test('server problems surface with their message', async t => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'No account uses this email. Ask the person to register first.' } }, { status: 404 }));
  await assert.rejects(addMember('o1', { email: 'x@y.co', role: 'member' }), /Ask the person to register first/);
});
