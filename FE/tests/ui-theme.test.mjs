import test from 'node:test';
import assert from 'node:assert/strict';
import { themeFor } from '../src/features/ui-theme.ts';

test('the developer-analyst workspace wears the frost look', () => {
  for (const path of ['/dashboard', '/projects', '/learning', '/workspace/p1', '/profile', '/project-maintainer/team', '/reports']) {
    assert.equal(themeFor('developer-analyst', path), 'frost', path);
  }
});

test('the public pages (landing, sign-in, sign-up and their follow-ups) wear the frost look for everyone', () => {
  const publicPaths = ['/', '', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/invitations/accept', '/auth/github/callback', '/login/'];
  for (const role of [undefined, 'developer-analyst', 'system-administrator']) {
    for (const path of publicPaths) assert.equal(themeFor(role, path), 'frost', `${String(role)} ${path}`);
  }
});

test("the administrators' console wears the frost look too", () => {
  for (const path of ['/system-administrator', '/system-administrator/users', '/system-administrator/ai-metrics', '/profile']) {
    assert.equal(themeFor('system-administrator', path), 'frost', path);
  }
});

test('a guarded page before the session is known keeps the default look', () => {
  assert.equal(themeFor(undefined, '/dashboard'), 'default');
  assert.equal(themeFor(undefined, '/system-administrator'), 'default');
});
