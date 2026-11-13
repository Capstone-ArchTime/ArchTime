import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockGlobal } from './mock-global.mjs';
// Imported after register-tsx.mjs has hooked in, because admin-api.ts imports through the @/ alias.
const { getAdminSettings, updateAdminSettings } = await import('../src/features/admin-api.ts');

// Defect #8: the System Settings page read `data` instead of `data.settings` (empty fields) and saved `maxRepoSizeGb`,
// a field the server does not know, so the repository limit never changed.
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const signedIn = t => {
  mockGlobal(t, 'sessionStorage', storage({ accessToken: 'token' }));
  mockGlobal(t, 'localStorage', storage());
};
const stored = { maxConcurrentJobs: 5, maxRepoSizeMb: 500, updatedAt: '2026-11-13T00:00:00.000Z' };

test('the settings are read from data.settings, as the server sends them', async t => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: { settings: stored } }));
  const res = await getAdminSettings();
  assert.equal(res.data.settings.maxConcurrentJobs, 5);
  assert.equal(res.data.settings.maxRepoSizeMb, 500);
});

test('saving sends maxRepoSizeMb, the field the server stores', async t => {
  signedIn(t);
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    bodies.push({ method: options.method, path: new URL(url).pathname, body: JSON.parse(options.body) });
    return Response.json({ success: true, data: { settings: { ...stored, maxRepoSizeMb: 1024 } } });
  });
  const res = await updateAdminSettings({ maxConcurrentJobs: 5, maxRepoSizeMb: 1024 });
  assert.deepEqual(bodies, [{ method: 'PUT', path: '/api/admin/settings', body: { maxConcurrentJobs: 5, maxRepoSizeMb: 1024 } }]);
  assert.equal(res.data.settings.maxRepoSizeMb, 1024);
});
