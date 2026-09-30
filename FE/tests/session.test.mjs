import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySession, InvalidSessionError } from '../src/auth/session.ts';

const user = { id: 'u1', name: 'Test', email: 'test@example.com', role: 'project-maintainer' };
const tokens = { accessToken: 'old-access', refreshToken: 'refresh' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('valid session uses the server identity', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/auth/me'));
    assert.equal(options.headers.Authorization, 'Bearer old-access');
    return response({ user });
  });
  assert.deepEqual(await verifySession(tokens, new AbortController().signal), { user, accessToken: 'old-access' });
});
test('expired access token refreshes once and re-verifies identity', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    if (calls.length === 1) return response({}, 401);
    if (calls.length === 2) {
      assert.ok(url.endsWith('/auth/refresh'));
      assert.equal(JSON.parse(options.body).refreshToken, 'refresh');
      return response({ accessToken: 'renewed' });
    }
    assert.equal(options.headers.Authorization, 'Bearer renewed');
    return response({ user });
  });
  assert.equal((await verifySession(tokens, new AbortController().signal)).accessToken, 'renewed');
  assert.equal(calls.length, 3);
});
test('revoked session is denied without granting a default role', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => response({}, 403));
  await assert.rejects(verifySession(tokens, new AbortController().signal), InvalidSessionError);
  assert.equal(mock.mock.callCount(), 1);
});
test('expired refresh token ends the session', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({}, 401));
  await assert.rejects(verifySession(tokens, new AbortController().signal), InvalidSessionError);
});
test('network/server failure remains retryable instead of being treated as authentication', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({}, 503));
  await assert.rejects(verifySession(tokens, new AbortController().signal), error => !(error instanceof InvalidSessionError));
});
test('unsupported server role fails closed', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({ user: { ...user, role: 'superuser' } }));
  await assert.rejects(verifySession(tokens, new AbortController().signal), InvalidSessionError);
});
