import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, isAuthUser, loginDestination, roles, roleHome } from '../src/auth/permissions.ts';

const paths = {
  'developer-analyst': ['/dashboard', '/projects', '/project', '/history', '/compare', '/evidence', '/insights', '/reports'],
  'project-maintainer': ['/project-maintainer', '/project-maintainer/approvals', '/project-maintainer/team', '/project-maintainer/reports', '/project-maintainer/component-diagram', '/project-maintainer/architecture-rules', '/project-maintainer/design-decisions'],
  'system-administrator': ['/system-administrator', '/system-administrator/users', '/system-administrator/audit-log', '/system-administrator/settings', '/system-administrator/mining-jobs'],
};

test('every workspace route is restricted to its assigned role', () => {
  for (const role of roles) for (const [owner, routes] of Object.entries(paths)) for (const path of routes) {
    assert.equal(canAccess(role, path), owner === role, `${role}: ${path}`);
  }
});
test('unknown roles, external URLs, and route-prefix lookalikes are denied', () => {
  assert.equal(canAccess('unknown', '/dashboard'), false);
  assert.equal(canAccess('__proto__', '/dashboard'), false);
  assert.equal(canAccess('constructor', '/dashboard'), false);
  for (const path of ['https://example.com', '//example.com', '/project-maintainer-admin', '/project-maintainer/unknown', '/dashboard/../system-administrator']) {
    assert.equal(canAccess('project-maintainer', path), false);
  }
});
test('login restores only authorized destinations, including query and fragment', () => {
  assert.equal(loginDestination('project-maintainer', '/project-maintainer/design-decisions?q=test#adr'), '/project-maintainer/design-decisions?q=test#adr');
  for (const role of roles) {
    assert.equal(loginDestination(role, 'https://example.com'), roleHome[role]);
    assert.equal(loginDestination(role), roleHome[role]);
  }
  assert.equal(loginDestination('developer-analyst', '/system-administrator'), '/dashboard');
  assert.equal(canAccess('project-maintainer', '/project-maintainer/'), true);
});
test('unsupported and malformed server identities are rejected', () => {
  const user = { id: '1', name: 'Test', email: 'test@example.com', role: 'project-maintainer' };
  assert.equal(isAuthUser(user), true);
  for (const value of [null, {}, { ...user, id: undefined }, { ...user, id: '' }, { ...user, role: 'admin' }]) assert.equal(isAuthUser(value), false);
});
