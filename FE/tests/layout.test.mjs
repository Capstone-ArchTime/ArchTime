import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
const { AuthContext } = await import('../src/auth/auth-context.ts');
const { canAccess, roles, roleHome } = await import('../src/auth/permissions.ts');
const { navItemsByRole } = await import('../src/components/layout/navigation.ts');
const { default: DashboardLayout } = await import('../src/components/layout/DashboardLayout.tsx');

test('all navigation destinations are authorized for their displayed role', () => {
  for (const role of roles) for (const item of navItemsByRole[role]) assert.ok(canAccess(role, item.path), `${role}: ${item.path}`);
});

for (const role of roles) test(`${role} layout renders a main landmark, skip link, and current navigation`, () => {
  const auth = { user: { id: 'test', name: 'Test Account', email: 'test@example.com', role }, signOut() {} };
  const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [roleHome[role]] },
    h(App, null, h(AuthContext.Provider, { value: auth }, h(DashboardLayout, null, h('p', null, 'Workspace content'))))));
  assert.match(html, /href="#main-content"/);
  assert.match(html, /<main[^>]*id="main-content"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-label="Open navigation"/);
  assert.match(html, /Workspace content/);
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]).filter(link => link.startsWith('/'));
  assert.ok(links.every(link => canAccess(role, link)));
});
