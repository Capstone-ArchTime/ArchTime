import test from 'node:test';
import assert from 'node:assert/strict';
import { themeFor } from '../src/features/ui-theme.ts';

test('the developer-analyst workspace wears the frost look', () => {
  for (const path of ['/dashboard', '/projects', '/learning', '/workspace/p1', '/profile', '/project-maintainer/team', '/reports']) {
    assert.equal(themeFor('developer-analyst', path), 'frost', path);
  }
});

test('administrators, signed-out visitors and the public pages keep the default look', () => {
  assert.equal(themeFor('system-administrator', '/system-administrator'), 'default');
  assert.equal(themeFor('system-administrator', '/profile'), 'default');
  assert.equal(themeFor(undefined, '/dashboard'), 'default');
  for (const path of ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/invitations/accept', '/auth/github/callback', '/login/']) {
    assert.equal(themeFor('developer-analyst', path), 'default', path);
  }
});
