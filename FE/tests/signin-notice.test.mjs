import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSignInNotice, peekSignInNotice, setSignInNotice } from '../src/auth/session.ts';

Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
const storage = () => { const v = new Map(); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, String(x)), removeItem: k => v.delete(k) }; };

test('a notice for the sign-in page is kept until it is cleared, and reading it does not remove it', t => {
  t.mock.property(globalThis, 'sessionStorage', storage());
  assert.equal(peekSignInNotice(), null);
  setSignInNotice('You were signed out of all devices.');
  assert.equal(peekSignInNotice(), 'You were signed out of all devices.');
  assert.equal(peekSignInNotice(), 'You were signed out of all devices.', 'reading twice (as development does) still finds it');
  clearSignInNotice();
  assert.equal(peekSignInNotice(), null);
});

test('blocked browser storage never breaks sign-out or sign-in', t => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  t.mock.property(globalThis, 'sessionStorage', blocked);
  assert.doesNotThrow(() => setSignInNotice('x'));
  assert.equal(peekSignInNotice(), null);
  assert.doesNotThrow(() => clearSignInNotice());
});
