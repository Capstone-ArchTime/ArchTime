import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWhen, fromStored, lastModel } from '../src/features/chat-history.ts';

const ids = () => { let n = 0; return prefix => `${prefix}-${++n}`; };
const evidence = { commits: ['a1b2c3d'], files: 12, dependencies: { added: 4, removed: 1 }, items: [] };
const model = { name: 'gpt-6-astra', host: 'api.example.com', external: true };

test('a saved conversation comes back as messages with their time and citations', () => {
  const out = fromStored([
    { role: 'user', content: 'Why?', createdAt: '2026-10-20T08:00:00.000Z' },
    { role: 'assistant', content: '[FACT] `a1b2c3d`', evidence, model, createdAt: '2026-10-20T08:00:05.000Z' },
  ], ids());
  assert.deepEqual(out.map(m => [m.id, m.role]), [['user-1', 'user'], ['assistant-2', 'assistant']]);
  assert.equal(out[0].timestamp.toISOString(), '2026-10-20T08:00:00.000Z');
  assert.equal(out[0].evidence, null);
  assert.deepEqual(out[1].evidence, evidence);
  assert.equal(out.every(m => !m.isError && !m.unsaved), true);
});

test('malformed stored messages are skipped instead of breaking the chat', () => {
  const out = fromStored([null, 5, { role: 'system', content: 'x' }, { role: 'user' }, { role: 'user', content: 'ok', createdAt: 'not a date' }], ids());
  assert.equal(out.length, 1);
  assert.equal(out[0].content, 'ok');
  assert.ok(!Number.isNaN(out[0].timestamp.getTime()));
});

test('a user message never carries citations even if the server sent some', () => {
  const [message] = fromStored([{ role: 'user', content: 'q', evidence, createdAt: '2026-10-20T08:00:00.000Z' }], ids());
  assert.equal(message.evidence, null);
});

test('the footer note uses the model of the last answer', () => {
  const other = { name: 'older', host: 'h', external: false };
  assert.deepEqual(lastModel([{ role: 'assistant', model: other }, { role: 'user' }, { role: 'assistant', model }, { role: 'user' }]), model);
  assert.equal(lastModel([{ role: 'user' }]), null);
  assert.equal(lastModel([]), null);
});

test('a time today is shown as Today, an older one with its date', () => {
  const now = new Date(2026, 9, 20, 15, 0, 0);
  assert.match(describeWhen(new Date(2026, 9, 20, 9, 5, 0).toISOString(), now), /^Today /);
  const older = describeWhen(new Date(2026, 9, 18, 9, 5, 0).toISOString(), now);
  assert.doesNotMatch(older, /^Today/);
  assert.ok(older.length > 5);
  assert.equal(describeWhen('garbage', now), '');
});
