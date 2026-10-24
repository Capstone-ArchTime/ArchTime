import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
const { systemRoleLabel, projectRoleLabel } = await import('../src/features/role-labels.ts');
const { AuthContext } = await import('../src/auth/auth-context.ts');
const { roles, roleHome } = await import('../src/auth/permissions.ts');
const { default: FeaturePage } = await import('../src/components/FeaturePage.tsx');
const { default: DashboardLayout } = await import('../src/components/layout/DashboardLayout.tsx');

test('role ids get plain names', () => {
  assert.equal(systemRoleLabel('developer-analyst'), 'User');
  assert.equal(systemRoleLabel('system-administrator'), 'System administrator');
  assert.equal(projectRoleLabel('project-maintainer'), 'Maintainer');
  assert.equal(projectRoleLabel('developer-analyst'), 'Member');
  assert.equal(projectRoleLabel('owner'), 'Owner');
  assert.equal(systemRoleLabel('some-new-role'), 'Some new role', 'an unknown id still reads as words');
  assert.equal(systemRoleLabel('__proto__'), '__proto__');
});

const render = (role, path, children) => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] },
  h(App, null, h(AuthContext.Provider, { value: { user: { id: 'u', name: 'Test', email: 't@example.com', role }, signOut() {} } }, children))));

test('pages backed by the server no longer claim to be a local demo', () => {
  const html = render('system-administrator', '/system-administrator/users', h(FeaturePage, { title: 'User Management', description: 'd' }, 'rows'));
  assert.doesNotMatch(html, /Local demo/);
  assert.match(render('system-administrator', '/system-administrator/users', h(FeaturePage, { title: 'T', description: 'd', demo: true }, 'x')), /Local demo/, 'still available on request');
});

test('the layout shows an area name instead of the raw role id', () => {
  for (const role of roles) {
    const html = render(role, roleHome[role], h(DashboardLayout, null, 'x'));
    assert.doesNotMatch(html, new RegExp(`>${role.replaceAll('-', ' ')}<`, 'i'), role);
  }
});

test('a page without its own menu item can name itself', () => {
  const html = render('developer-analyst', '/project', h(DashboardLayout, { title: 'cors (expressjs)' }, 'x'));
  assert.match(html, /<h1 class="sr-only">cors \(expressjs\)<\/h1>/);
  assert.doesNotMatch(html, /Workspace detail/);
});
