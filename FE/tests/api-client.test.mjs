import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../src/api/client.ts';
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('concurrent unauthorized requests share a single token refresh', async t => {
  t.mock.property(globalThis, 'sessionStorage', storage({ accessToken: 'old', refreshToken: 'refresh' }));
  t.mock.property(globalThis, 'localStorage', storage());
  let refreshes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return Response.json({ accessToken: 'new' }); }
    if (options.headers.Authorization === 'Bearer old') return Response.json({}, { status: 401 });
    if (url.endsWith('/auth/me')) return Response.json({ user: { id: 'u', name: 'Tester', email: 'test@example.com', role: 'system-administrator' } });
    return Response.json({ success: true });
  });
  const results = await Promise.all([apiRequest('/projects'), apiRequest('/projects/jobs')]);
  assert.equal(refreshes, 1); assert.ok(results.every(result => result.success));
  assert.equal(sessionStorage.getItem('accessToken'), 'new');
});
test('API errors preserve permission feedback and do not turn HTML errors into parser messages', async t => {
  t.mock.property(globalThis, 'sessionStorage', storage());
  t.mock.property(globalThis, 'localStorage', storage());
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Forbidden</html>', { status: 403 }));
  await assert.rejects(apiRequest('/projects'), error => error.status === 403 && error.message.includes('permission'));
});
