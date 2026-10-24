import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, isAuthUser, loginDestination, maintainerRoutes, roles, roleHome } from '../src/auth/permissions.ts';

const paths = {
  'developer-analyst': ['/dashboard', '/projects', '/project', '/history', '/compare', '/evidence', '/insights', '/reports', ...maintainerRoutes],
  'system-administrator': ['/system-administrator', '/system-administrator/users', '/system-administrator/audit-log', '/system-administrator/settings', '/system-administrator/mining-jobs'],
};

test('the server hands out two system roles; maintaining a project is not one of them', () => {
  assert.deepEqual([...roles], ['developer-analyst', 'system-administrator']);
  assert.equal(Object.hasOwn(roleHome, 'project-maintainer'), false);
});
test('every workspace route is restricted to its assigned role', () => {
  for (const role of roles) for (const [owner, routes] of Object.entries(paths)) for (const path of routes) {
    assert.equal(canAccess(role, path), owner === role, `${role}: ${path}`);
  }
});
test('the maintainer pages are open to developer-analysts (the server decides which workspaces they maintain)', () => {
  assert.deepEqual(maintainerRoutes, ['/project-maintainer', '/project-maintainer/approvals', '/project-maintainer/team', '/project-maintainer/reports', '/project-maintainer/component-diagram', '/project-maintainer/architecture-rules', '/project-maintainer/design-decisions']);
  for (const path of maintainerRoutes) {
    assert.equal(canAccess('developer-analyst', path), true, path);
    assert.equal(canAccess('system-administrator', path), false, path);
    assert.equal(canAccess('project-maintainer', path), false, `the retired role: ${path}`);
  }
});
test('unknown roles, external URLs, and route-prefix lookalikes are denied', () => {
  assert.equal(canAccess('unknown', '/dashboard'), false);
  assert.equal(canAccess('__proto__', '/dashboard'), false);
  assert.equal(canAccess('constructor', '/dashboard'), false);
  for (const path of ['https://example.com', '//example.com', '/project-maintainer-admin', '/project-maintainer/unknown', '/dashboard/../system-administrator']) {
    assert.equal(canAccess('developer-analyst', path), false, path);
  }
});
test('login restores only authorized destinations, including query and fragment', () => {
  assert.equal(loginDestination('developer-analyst', '/project-maintainer/design-decisions?project=abc#adr'), '/project-maintainer/design-decisions?project=abc#adr');
  for (const role of roles) {
    assert.equal(loginDestination(role, 'https://example.com'), roleHome[role]);
    assert.equal(loginDestination(role), roleHome[role]);
  }
  assert.equal(loginDestination('developer-analyst', '/system-administrator'), '/dashboard');
  assert.equal(loginDestination('system-administrator', '/project-maintainer/team'), '/system-administrator');
  assert.equal(canAccess('developer-analyst', '/project-maintainer/'), true);
});
test('unsupported and malformed server identities are rejected', () => {
  const user = { id: '1', name: 'Test', email: 'test@example.com', role: 'developer-analyst' };
  assert.equal(isAuthUser(user), true);
  assert.equal(isAuthUser({ ...user, role: 'system-administrator' }), true);
  for (const value of [null, {}, { ...user, id: undefined }, { ...user, id: '' }, { ...user, role: 'admin' }, { ...user, role: 'project-maintainer' }]) assert.equal(isAuthUser(value), false);
});

test('the architecture workspace of one project or sample is for developer-analysts only', () => {
  assert.equal(canAccess('developer-analyst', '/workspace/6ac6c4668caa9b250e2b1213'), true);
  assert.equal(canAccess('developer-analyst', '/workspace/sample/shophub#focus=web'), true);
  assert.equal(canAccess('developer-analyst', '/workspace'), false, 'the bare prefix is not a page');
  assert.equal(canAccess('system-administrator', '/workspace/abc'), false);
  assert.equal(canAccess('__proto__', '/workspace/abc'), false);
});

test('the profile page belongs to every signed-in account, and only that exact path', () => {
  for (const role of roles) {
    assert.equal(canAccess(role, '/profile'), true, role);
    assert.equal(canAccess(role, '/profile/'), true, `${role} with a trailing slash`);
    assert.equal(canAccess(role, '/profile/x'), false, role);
    assert.equal(canAccess(role, '/profiles'), false, role);
  }
  for (const unknown of ['unknown', '__proto__', 'constructor']) assert.equal(canAccess(unknown, '/profile'), false, unknown);
  assert.equal(loginDestination('system-administrator', '/profile'), '/profile');
});
