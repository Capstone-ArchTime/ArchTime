import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const { AuthContext } = await import('../src/auth/auth-context.ts');
const { default: ThemeSwitch } = await import('../src/components/ThemeSwitch.tsx');
const { default: HomePage } = await import('../src/pages/HomePage.tsx');

// A signed-out visitor picks the look on the landing and sign-in pages, beside the language switch: the account menu,
// where signed-in people pick it, cannot be reached before signing in.

const signedOut = { user: null, loading: false, signOut() {}, updateUser() {} };
const render = element => renderToStaticMarkup(h(MemoryRouter, null, h(AuthContext.Provider, { value: signedOut }, element)));

test('the theme switch is a closed menu button until pressed', () => {
  const html = render(h(ThemeSwitch));
  assert.match(html, /<button[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(html, /aria-label="Theme"/);
  assert.doesNotMatch(html, /role="menu"/, 'the list opens only when asked');
});

test('the landing page offers the theme switch to a signed-out visitor, next to the language switch', () => {
  const html = render(h(HomePage));
  assert.match(html, /aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-label="Theme"/);
  assert.match(html, /aria-label="Change language"/);
});
