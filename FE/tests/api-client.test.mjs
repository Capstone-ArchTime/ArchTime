import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, onSessionEnded } from '../src/api/client.ts';
import { InvalidSessionError } from '../src/auth/session.ts';
import { mockGlobal } from './mock-global.mjs';
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('concurrent unauthorized requests share a single token refresh', async t => {
  mockGlobal(t, 'sessionStorage', storage({ accessToken: 'old', refreshToken: 'refresh' }));
  mockGlobal(t, 'localStorage', storage());
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
  mockGlobal(t, 'sessionStorage', storage());
  mockGlobal(t, 'localStorage', storage());
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Forbidden</html>', { status: 403 }));
  await assert.rejects(apiRequest('/projects'), error => error.status === 403 && error.message.includes('permission'));
});
test('a write retried after a token refresh keeps its method, body and headers', async t => {
  mockGlobal(t, 'sessionStorage', storage({ accessToken: 'old', refreshToken: 'refresh' }));
  mockGlobal(t, 'localStorage', storage());
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/refresh')) return Response.json({ data: { accessToken: 'new' } });
    if (url.endsWith('/auth/me')) return options.headers.Authorization === 'Bearer old' ? Response.json({}, { status: 401 }) : Response.json({ data: { user: { id: 'u', name: 'Tester', email: 'test@example.com', role: 'developer-analyst' } } });
    sent.push({ method: options.method, body: options.body, type: options.headers['content-type'] ?? options.headers['Content-Type'], auth: options.headers.Authorization });
    if (options.headers.Authorization === 'Bearer old') return Response.json({}, { status: 401 });
    return Response.json({ data: { project: { id: 'p1' } } }, { status: 201 });
  });
  const result = await apiRequest('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"demo"}' });
  assert.equal(result.data.project.id, 'p1');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], { method: 'POST', body: '{"name":"demo"}', type: 'application/json', auth: 'Bearer new' });
});
test('an expired refresh token rejects the request and tells the app the session ended', async t => {
  mockGlobal(t, 'sessionStorage', storage({ accessToken: 'old', refreshToken: 'expired' }));
  mockGlobal(t, 'localStorage', storage());
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/auth/refresh')) return Response.json({ error: { message: 'expired' } }, { status: 401 });
    return Response.json({}, { status: 401 });
  });
  let ended = 0;
  const stop = onSessionEnded(() => { ended++; });
  t.after(stop);
  await assert.rejects(apiRequest('/projects'), error => error instanceof InvalidSessionError && /sign in again/.test(error.message));
  assert.equal(ended, 1);
});
