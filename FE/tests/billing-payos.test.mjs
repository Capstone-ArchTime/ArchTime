import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPayosReturn } from '../src/features/billing-api.ts';
import { mockGlobal } from './mock-global.mjs';

const storage = (initial = {}) => { const v = new Map(Object.entries(initial)); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, x), removeItem: k => v.delete(k) }; };

test('back from payOS, the page asks the server to check the order with payOS (the return address is not signed)', async (t) => {
  mockGlobal(t, 'sessionStorage', storage({ accessToken: 'token' }));
  mockGlobal(t, 'localStorage', storage());
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    asked.push({ url: String(url), method: init?.method, body: JSON.parse(init.body) });
    return Response.json({ success: true, data: { outcome: 'paid' } });
  });
  await checkPayosReturn('AT179586720012345');
  assert.match(asked[0].url, /\/billing\/payos\/return$/);
  assert.equal(asked[0].method, 'POST');
  assert.deepEqual(asked[0].body, { orderId: 'AT179586720012345' });
});
