import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthRequestError, formatWait, readRetryAfter, tooManyAttemptsMessage } from '../src/auth/rate-limit.ts';

test('a wait reads as seconds, minutes or hours, in plain words', () => {
  assert.equal(formatWait(1), '1 second');
  assert.equal(formatWait(45), '45 seconds');
  assert.equal(formatWait(59), '59 seconds');
  assert.equal(formatWait(60), '1 minute');
  assert.equal(formatWait(120), '2 minutes');
  assert.equal(formatWait(3599), '1 hour', 'rounds up to the whole hour');
  assert.equal(formatWait(3600), '1 hour');
  assert.equal(formatWait(3660), '1 hour 1 minute');
  assert.equal(formatWait(7260), '2 hours 1 minute');
  assert.equal(formatWait(7200), '2 hours');
});

test('a wait is rounded up, so the person never tries a moment too early, and is never zero', () => {
  assert.equal(formatWait(0.2), '1 second');
  assert.equal(formatWait(0), '1 second');
  assert.equal(formatWait(-5), '1 second');
  assert.equal(formatWait(60.1), '2 minutes');
  assert.equal(formatWait(61), '2 minutes');
  assert.equal(formatWait(119), '2 minutes');
  assert.equal(formatWait(121), '3 minutes');
});

test('the wait comes from the body first, then the Retry-After header (seconds or a date)', () => {
  const now = Date.parse('2026-10-30T10:00:00Z');
  assert.equal(readRetryAfter(42, '99', now), 42, 'the body wins');
  assert.equal(readRetryAfter(41.2, null, now), 42);
  assert.equal(readRetryAfter(undefined, '30', now), 30);
  assert.equal(readRetryAfter(undefined, ' 30 ', now), 30);
  assert.equal(readRetryAfter('42', '30', now), 30, 'a text in the body is not a number: fall back to the header');
  assert.equal(readRetryAfter(0, '30', now), 30, 'zero in the body says nothing useful');
  assert.equal(readRetryAfter(undefined, 'Fri, 30 Oct 2026 10:01:30 GMT', now), 90);
  assert.equal(readRetryAfter(undefined, 'Fri, 30 Oct 2026 09:00:00 GMT', now), 1, 'a date in the past still means "now", at least a second');
  assert.equal(readRetryAfter(undefined, '0', now), 1);
});

test('no usable wait gives undefined', () => {
  for (const [body, header] of [[undefined, null], [undefined, undefined], [undefined, ''], [undefined, 'soon'], [null, 'x'], [Number.NaN, null], [-3, null], [Infinity, null]]) {
    assert.equal(readRetryAfter(body, header), undefined, JSON.stringify([body, header]));
  }
});

test('the message under a form says how long to wait, and the wording avoids what the sign-up form routes to a field', () => {
  assert.equal(tooManyAttemptsMessage(45), 'Too many attempts. Try again in 45 seconds.');
  assert.equal(tooManyAttemptsMessage(120), 'Too many attempts. Try again in 2 minutes.');
  assert.equal(tooManyAttemptsMessage(), 'Too many attempts. Please wait a little and try again.');
  for (const text of [tooManyAttemptsMessage(45), tooManyAttemptsMessage(3700), tooManyAttemptsMessage()]) {
    assert.doesNotMatch(text, /email|^password/i);
  }
});

test('an auth error carries its status, code and wait', () => {
  const error = new AuthRequestError('x', 429, 'RATE_LIMITED', 30);
  assert.ok(error instanceof Error);
  assert.deepEqual([error.status, error.code, error.retryAfterSeconds, error.name], [429, 'RATE_LIMITED', 30, 'AuthRequestError']);
});
