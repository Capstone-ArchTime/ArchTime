import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const { AuthContext } = await import('../src/auth/auth-context.ts');
const { default: ThemeSwitch } = await import('../src/components/ThemeSwitch.tsx');
const { default: HomePage } = await import('../src/pages/HomePage.tsx');
const { default: DashboardLayout } = await import('../src/components/layout/DashboardLayout.tsx');
const { App } = await import('antd');

// The look has one picker everywhere, its own button: beside the language switch on the landing and sign-in pages,
// beside the account menu in the app's header.

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

test('in the app the theme switch is its own header button, not a group inside the account menu', () => {
  const auth = { user: { id: 'theme-test', name: 'Test Account', email: 'test@example.com', role: 'developer-analyst' }, signOut() {} };
  const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: ['/dashboard'] },
    h(App, null, h(AuthContext.Provider, { value: auth }, h(DashboardLayout, null, h('p', null, 'Workspace content'))))));
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.match(header, /aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-label="Theme"/);
  assert.ok(header.indexOf('aria-label="Theme"') < header.indexOf('aria-label="Account menu"'), 'the theme button sits before the account menu');
});
