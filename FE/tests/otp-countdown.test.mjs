import test from 'node:test';
import assert from 'node:assert/strict';
import { OTP_TTL_MS, deadlineFrom, formatCountdown, recallOtpDeadline, rememberOtpDeadline, resendLabel } from '../src/features/otp-countdown.ts';

const storage = () => { const v = new Map(); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, String(x)) }; };

test('the countdown uses the expiry the server sent, or ten minutes from now when it sent none', () => {
  const now = Date.parse('2026-10-27T10:00:00Z');
  assert.equal(deadlineFrom('2026-10-27T10:09:30Z', now), Date.parse('2026-10-27T10:09:30Z'));
  assert.equal(deadlineFrom(undefined, now), now + OTP_TTL_MS);
  assert.equal(deadlineFrom('not a date', now), now + OTP_TTL_MS);
});

test('the expiry is remembered per email, whatever its case or spaces, and blocked storage is harmless', () => {
  const s = storage();
  assert.equal(recallOtpDeadline('ann@test.io', s), null);
  rememberOtpDeadline(' Ann@Test.io ', 1234, s);
  assert.equal(recallOtpDeadline('ann@test.io', s), 1234);
  assert.equal(recallOtpDeadline('bob@test.io', s), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => rememberOtpDeadline('ann@test.io', 1, blocked));
  assert.equal(recallOtpDeadline('ann@test.io', blocked), null);
});

test('time left reads as minutes and seconds, rounded up, and never below zero', () => {
  assert.equal(formatCountdown(10 * 60 * 1000), '10:00');
  assert.equal(formatCountdown(545_000), '9:05');
  assert.equal(formatCountdown(400), '0:01');
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(-5000), '0:00');
});

test('the locked resend button shows seconds for a short wait and a rounded-up unit for a long one', () => {
  assert.equal(resendLabel(45), 'Resend in 45s');
  assert.equal(resendLabel(1), 'Resend in 1s');
  assert.equal(resendLabel(59), 'Resend in 59s');
  assert.equal(resendLabel(60), 'Resend in 1 minute');
  assert.equal(resendLabel(61), 'Resend in 2 minutes');
  assert.equal(resendLabel(3295), 'Resend in 55 minutes');
  assert.equal(resendLabel(3600), 'Resend in 1 hour');
});
