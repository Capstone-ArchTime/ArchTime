import test from 'node:test';
import assert from 'node:assert/strict';
import { authRequest } from '../src/auth/requests.ts';

test('verification sends the OTP and email to the correct endpoint', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/auth/verify-email'));
    assert.deepEqual(JSON.parse(options.body), { email: 'test@example.com', otp: '123456' });
    assert.equal(options.method, 'POST');
    return Response.json({ accessToken: 'test-access', refreshToken: 'test-refresh' });
  });
  const result = await authRequest('verify-email', { email: 'test@example.com', otp: '123456' });
  assert.equal(result.accessToken, 'test-access');
});
test('structured backend validation messages are preserved', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Invalid or expired OTP.' }, { status: 400 }));
  await assert.rejects(authRequest('verify-email', {}), /Invalid or expired OTP/);
});
test('HTML error responses do not leak parser errors into the interface', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
  await assert.rejects(authRequest('login', {}), /Request failed \(502\)/);
});
test('malformed successful responses cannot complete authentication', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(null));
  await assert.rejects(authRequest('login', {}), /invalid response/);
});
test('offline failures get an actionable connection error', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(authRequest('login', {}), /Cannot reach the server/);
});
test('a cancelled page request remains cancelled', async t => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => { signal.throwIfAborted(); });
  await assert.rejects(authRequest('resend-otp', { email: 'test@example.com' }, controller.signal), error => error.name === 'AbortError');
});
