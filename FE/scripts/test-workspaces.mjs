// Usage: node scripts/test-workspaces.mjs [path to an installed playwright package]
// Run the FE dev server first. All backend traffic is intercepted with test fixtures.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2], 'index.mjs')).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const origin = process.env.FE_TEST_URL || 'http://127.0.0.1:5173';
await mkdir('test-results/workspaces', { recursive: true });
const errors = [];
async function workspace(role) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(() => { sessionStorage.setItem('accessToken', 'fixture-access'); sessionStorage.setItem('refreshToken', 'fixture-refresh'); });
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) { await route.continue(); return; }
    let body;
    if (path.endsWith('/auth/me')) body = { user: { id: `fixture-${role}`, name: 'Workspace Tester', email: 'tester@example.com', role } };
    else if (path.endsWith('/health')) body = { status: 'ok', timestamp: new Date().toISOString() };
    else if (path.endsWith('/projects/jobs')) body = { data: { jobs: [{ _id: 'job-1', projectId: { name: 'Fixture repository' }, requestedBy: { name: 'Workspace Tester' }, status: 'queued', stage: 'Waiting for worker', progress: 0, createdAt: new Date().toISOString() }] } };
    else if (path.endsWith('/snapshots')) body = { data: { snapshots: [
      { id: 'snapshot-b', hash: 'bbbbbbb', title: 'New service', date: '2026-10-02', nodes: [{ id: 'new', name: 'Notifications', type: 'Service' }], edges: [] },
      { id: 'snapshot-a', hash: 'aaaaaaa', title: 'Baseline', date: '2026-10-01', nodes: [{ id: 'old', name: 'Monolith', type: 'Service' }], edges: [] },
    ] } };
    else if (path.endsWith('/projects')) body = { data: { projects: [{ id: 'project-1', name: 'Fixture repository' }] } };
    else { await route.fulfill({ status: 404, json: { message: `Unmocked API: ${path}` } }); return; }
    await route.fulfill({ json: body });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { page, context };
}
try {
  for (const role of ['system-administrator', 'project-maintainer']) {
    const { page, context } = await workspace(role);
    const routes = role === 'system-administrator' ? ['', '/users', '/settings', '/audit-log', '/mining-jobs'] : ['', '/team', '/approvals', '/component-diagram', '/architecture-rules', '/design-decisions', '/reports'];
    for (const suffix of routes) {
      await page.goto(`${origin}/${role}${suffix}`);
      await page.waitForLoadState('networkidle');
      await page.locator('main h2').waitFor({ timeout: 15000 }).catch(async error => { console.log(await page.locator('body').innerText()); console.log(errors); throw error; });
      console.log(`${role}${suffix}: ${await page.locator('main h2').allTextContents()}`);
      assert.equal(await page.locator('main h2').count(), 1);
      await page.screenshot({ path: `test-results/workspaces/${role}${suffix.replace('/', '-') || '-dashboard'}.png`, fullPage: true });
    }
    if (role === 'system-administrator') {
      await page.goto(`${origin}/${role}/users`);
      await page.getByRole('button', { name: 'Invite user', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill('QA Member');
      await page.getByLabel('Email', { exact: true }).fill('qa@example.com');
      await page.getByRole('button', { name: 'Create demo invitation' }).click();
      await page.getByRole('cell', { name: 'QA Member qa@example.com' }).waitFor();
      await page.reload(); await page.getByText('qa@example.com', { exact: true }).waitFor();
      await page.goto(`${origin}/${role}/audit-log`);
      await page.getByText('Demo invitation created for qa@example.com').waitFor();
      await page.goto(`${origin}/${role}/settings`);
      await page.getByLabel('Max concurrent analysis jobs').fill('6');
      await page.getByRole('button', { name: 'Save demo settings' }).click();
      await page.reload(); assert.equal(await page.getByLabel('Max concurrent analysis jobs').inputValue(), '6');
    } else {
      await page.goto(`${origin}/${role}/approvals`);
      await page.getByRole('button', { name: 'Reject', exact: true }).click();
      await page.getByLabel('Reason for rejection').fill('Please document failure recovery.');
      await page.getByRole('button', { name: 'Record decision' }).click();
      await page.getByText('rejected', { exact: true }).waitFor();
      await page.reload(); await page.getByText('rejected', { exact: true }).waitFor();
      await page.goto(`${origin}/${role}/component-diagram`);
      await page.getByRole('button', { name: 'Add component', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill('QA Service');
      await page.getByRole('button', { name: 'Apply changes' }).click();
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.reload(); await page.getByRole('button', { name: 'Edit QA Service', exact: true }).waitFor();
      await page.goto(`${origin}/${role}/reports`);
      await page.getByRole('button', { name: 'Preview report' }).click();
      const report = page.frameLocator('iframe[title="Evolution report"]');
      await report.getByRole('heading', { name: 'Components added (1)' }).waitFor();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download HTML' }).click();
      assert.ok((await downloaded).suggestedFilename().endsWith('.html'));
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
      await page.getByRole('button', { name: 'Open report' }).waitFor();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/${role}`); await page.waitForLoadState('networkidle');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${role} overflows on mobile`);
    await page.screenshot({ path: `test-results/workspaces/${role}-mobile.png`, fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: all workspace routes, persistence, audit, approval, diagram, reports, and mobile widths.');
} finally { await browser.close(); }
