import test from 'node:test';
import assert from 'node:assert/strict';
import { parseThemeChoice, themeFor } from '../src/features/ui-theme.ts';
import { BASE_THEME, DEFAULT_CHOICE, SELECTABLE_THEMES } from '../src/theme/registry.ts';

test('frost is the default choice', () => {
  assert.equal(DEFAULT_CHOICE, 'frost');
});

test('signed-in roles wear the chosen look, frost by default', () => {
  for (const path of ['/dashboard', '/projects', '/workspace/p1', '/profile', '/reports']) assert.equal(themeFor('developer-analyst', path), 'frost', path);
  for (const path of ['/system-administrator', '/system-administrator/users', '/profile']) assert.equal(themeFor('system-administrator', path), 'frost', path);
  assert.equal(themeFor('developer-analyst', '/dashboard', 'ink'), 'ink');
  assert.equal(themeFor('system-administrator', '/system-administrator/users', 'ink'), 'ink');
});

test('the public pages wear the chosen look for everyone', () => {
  const publicPaths = ['/', '', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/invitations/accept', '/auth/github/callback', '/login/'];
  for (const role of [undefined, 'developer-analyst', 'system-administrator']) {
    for (const path of publicPaths) {
      assert.equal(themeFor(role, path), 'frost', `${String(role)} ${path}`);
      assert.equal(themeFor(role, path, 'ink'), 'ink', `${String(role)} ${path}`);
    }
  }
});

test('a guarded page before the session is known keeps the base look, whatever was picked', () => {
  assert.equal(themeFor(undefined, '/dashboard'), BASE_THEME.id);
  assert.equal(themeFor(undefined, '/system-administrator', 'ink'), BASE_THEME.id);
});

test('a stored choice must name a selectable theme', () => {
  for (const theme of SELECTABLE_THEMES) assert.equal(parseThemeChoice(theme.id), theme.id);
  for (const value of [BASE_THEME.id, null, undefined, '', 'neon', 42]) assert.equal(parseThemeChoice(value), 'frost', String(value));
});
