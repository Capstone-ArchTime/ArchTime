import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthRequestError, authRequest } from '../src/auth/requests.ts';

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

const limited = (body, headers = {}) => new Response(JSON.stringify(body), { status: 429, headers: { 'Content-Type': 'application/json', ...headers } });
test('a rate limit carries the wait from the body, and the message says it in plain words', async t => {
  t.mock.method(globalThis, 'fetch', async () => limited({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in 120 seconds.', retryAfterSeconds: 120 } }, { 'Retry-After': '120' }));
  await assert.rejects(authRequest('login', { email: 'a@b.co', password: 'x' }), error => {
    assert.ok(error instanceof AuthRequestError);
    assert.equal(error.status, 429);
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.retryAfterSeconds, 120);
    assert.equal(error.message, 'Too many attempts. Try again in 2 minutes.');
    return true;
  });
});
test('without a wait in the body the Retry-After header is used', async t => {
  t.mock.method(globalThis, 'fetch', async () => limited({ success: false, error: { code: 'RATE_LIMITED', message: 'x' } }, { 'Retry-After': '45' }));
  await assert.rejects(authRequest('resend-otp', { email: 'a@b.co' }), error => error.retryAfterSeconds === 45 && error.message === 'Too many attempts. Try again in 45 seconds.');
});
test('a 429 with no wait anywhere still reads as a plain message, on every endpoint', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Too Many Requests</html>', { status: 429 }));
  for (const endpoint of ['login', 'register', 'verify-email', 'resend-otp', 'forgot-password', 'reset-password']) {
    await assert.rejects(authRequest(endpoint, {}), error => error.status === 429 && error.retryAfterSeconds === undefined && error.message === 'Too many attempts. Please wait a little and try again.', endpoint);
  }
});
test('a locked verification code keeps the server message and is not shown as a wait', async t => {
  t.mock.method(globalThis, 'fetch', async () => limited({ success: false, error: { code: 'OTP_LOCKED', message: 'Too many wrong codes. Request a new code to continue.' } }));
  await assert.rejects(authRequest('verify-email', { email: 'a@b.co', otp: '123456' }), error => {
    assert.equal(error.code, 'OTP_LOCKED');
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterSeconds, undefined);
    assert.equal(error.message, 'Too many wrong codes. Request a new code to continue.');
    return true;
  });
});
test('other refusals still carry their status and code, and a wrong sign-in keeps its fixed message', async t => {
  const answer = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false, error: { code: 'OTP_INVALID', message: 'Invalid OTP code. 4 tries left.' } }, { status: 400 }));
  await assert.rejects(authRequest('verify-email', {}), error => error instanceof AuthRequestError && error.status === 400 && error.code === 'OTP_INVALID' && error.message === 'Invalid OTP code. 4 tries left.');
  answer.mock.mockImplementation(async () => Response.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } }, { status: 401 }));
  await assert.rejects(authRequest('login', {}), error => error.status === 401 && error.message === 'Incorrect username/email or password.');
});
