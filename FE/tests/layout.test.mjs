import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
const { AuthContext } = await import('../src/auth/auth-context.ts');
const { canAccess, maintainerRoutes, roles, roleHome } = await import('../src/auth/permissions.ts');
const { accountMenuItems, analyzeNavItems, maintainNavItems, navGroupsFor } = await import('../src/components/layout/navigation.ts');
const { rememberMaintains } = await import('../src/hooks/useMaintainsWorkspaces.ts');
const { default: DashboardLayout } = await import('../src/components/layout/DashboardLayout.tsx');

function render(role, path, id = 'test') {
  const auth = { user: { id, name: 'Test Account', email: 'test@example.com', role }, signOut() {} };
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] },
    h(App, null, h(AuthContext.Provider, { value: auth }, h(DashboardLayout, null, h('p', null, 'Workspace content'))))));
}
const links = html => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]).filter(link => link.startsWith('/'));
/** What sits at the top level of the sidebar: plain links by label, folded groups by their label. */
const topLevel = groups => groups.flatMap(group => (group.label ? [group.label] : group.items.map(item => item.label)));

test('all navigation destinations are authorized for their displayed role', () => {
  for (const role of roles) {
    for (const maintains of [false, true]) for (const group of navGroupsFor(role, { maintains })) for (const item of group.items) {
      assert.ok(canAccess(role, item.path), `${role}: ${item.path}`);
    }
    for (const item of accountMenuItems[role]) assert.ok(canAccess(role, item.path), `${role} account menu: ${item.path}`);
  }
});

test('the sidebar of a developer-analyst has six entries, seven with the Maintain group', () => {
  assert.deepEqual(topLevel(navGroupsFor('developer-analyst', { maintains: false })), ['Dashboard', 'Workspaces', 'Organizations', 'Analyze', 'Learning', 'Reports']);
  assert.deepEqual(topLevel(navGroupsFor('developer-analyst', { maintains: true })), ['Dashboard', 'Workspaces', 'Organizations', 'Analyze', 'Learning', 'Reports', 'Maintain']);
  assert.deepEqual(analyzeNavItems.map(item => item.path), ['/history', '/architecture', '/compare', '/evidence', '/insights']);
  assert.equal(topLevel(navGroupsFor('system-administrator', { maintains: true })).length, 7, 'administrators keep their own seven pages');
});

test('every page still has a way in: the sidebar, the account menu, or (old maintainer reports) a redirect', () => {
  const reachable = new Set([...navGroupsFor('developer-analyst', { maintains: true }).flatMap(group => group.items), ...accountMenuItems['developer-analyst']].map(item => item.path));
  for (const path of ['/dashboard', '/projects', '/history', '/architecture', '/compare', '/evidence', '/insights', '/learning', '/reports', '/ai-usage', '/profile']) assert.ok(reachable.has(path), path);
  assert.deepEqual(maintainerRoutes.filter(path => !reachable.has(path)), ['/project-maintainer/reports'], 'only the old reports page, which now redirects to /reports');
  assert.deepEqual(accountMenuItems['developer-analyst'].map(item => item.path), ['/profile', '/ai-usage']);
});

test('the Maintain group is only for developer-analysts who maintain a workspace', () => {
  const group = navGroupsFor('developer-analyst', { maintains: true }).at(-1);
  assert.equal(group.label, 'Maintain');
  assert.equal(group.items, maintainNavItems);
  assert.equal(navGroupsFor('developer-analyst', { pathname: '/project-maintainer/team' }).at(-1).label, 'Maintain', 'shown while the server has not answered');
  assert.notEqual(navGroupsFor('developer-analyst', { maintains: false, pathname: '/project-maintainer/team' }).at(-1).label, 'Maintain', 'gone once the server says no');
  assert.notEqual(navGroupsFor('developer-analyst', { pathname: '/project-maintainers' }).at(-1).label, 'Maintain');
});

for (const role of roles) test(`${role} layout renders a main landmark, skip link, and current navigation`, () => {
  const html = render(role, roleHome[role]);
  assert.match(html, /href="#main-content"/);
  assert.match(html, /<main[^>]*id="main-content"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-label="Open navigation"/);
  assert.match(html, /aria-label="Account menu"/);
  assert.match(html, /Workspace content/);
  assert.ok(links(html).every(link => canAccess(role, link)));
  assert.ok(!links(html).includes('/profile'), 'My profile moved to the account menu');
});

test('Analyze is folded until it holds the current page', () => {
  const onDashboard = render('developer-analyst', '/dashboard');
  assert.match(onDashboard, /role="group" aria-label="Analyze"[^>]*><button type="button" aria-expanded="false"/);
  assert.ok(!links(onDashboard).includes('/history'));
  const onHistory = render('developer-analyst', '/history');
  assert.match(onHistory, /role="group" aria-label="Analyze"[^>]*><button type="button" aria-expanded="true"/);
  assert.match(onHistory, /<a(?=[^>]*href="\/history")(?=[^>]*aria-current="page")/);
});

test('pages in the account menu still get their own title', () => {
  assert.match(render('developer-analyst', '/ai-usage'), /<h1 class="sr-only">AI Usage<\/h1>/);
  assert.match(render('system-administrator', '/profile'), /<h1 class="sr-only">My profile<\/h1>/);
});

test('a developer-analyst who maintains nothing gets no maintainer links', () => {
  rememberMaintains('analyst-only', false);
  const html = render('developer-analyst', '/dashboard', 'analyst-only');
  assert.ok(!links(html).some(link => link.startsWith('/project-maintainer')));
  assert.doesNotMatch(html, /aria-label="Maintain"/);
  assert.ok(!links(render('developer-analyst', '/dashboard', 'not-asked-yet')).some(link => link.startsWith('/project-maintainer')), 'nothing shown before the server answers');
  assert.ok(!links(render('developer-analyst', '/project-maintainer/team', 'analyst-only')).some(link => link.startsWith('/project-maintainer')), 'not even on a maintainer page reached by a link');
});

test('a developer-analyst who maintains a workspace gets the Maintain group, open on its pages', () => {
  rememberMaintains('maintainer', true);
  const html = render('developer-analyst', '/project-maintainer/team', 'maintainer');
  assert.match(html, /role="group" aria-label="Maintain"[^>]*><button type="button" aria-expanded="true"/);
  for (const item of maintainNavItems) assert.ok(links(html).includes(item.path), item.path);
  assert.match(html, /aria-current="page"[^>]*>.*?<span>Team<\/span>/);
  assert.match(render('developer-analyst', '/dashboard', 'maintainer'), /role="group" aria-label="Maintain"[^>]*><button type="button" aria-expanded="false"/, 'folded elsewhere');
});
