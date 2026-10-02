import test from 'node:test';
import assert from 'node:assert/strict';
import { readDemo, writeDemo } from '../src/features/demo-storage.ts';
const valid = value => Array.isArray(value) && value.every(item => typeof item === 'string');
test('demo storage rejects corrupted and unsupported data without replacing it', () => {
  assert.deepEqual(readDemo(null, ['seed'], valid), ['seed']);
  for (const raw of ['invalid', '{"version":2,"data":[]}', '{"version":1,"data":[3]}']) {
    assert.throws(() => readDemo(raw, [], valid));
  }
});
test('a stale tab cannot overwrite newer edits', () => {
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  writeDemo(storage, 'key', null, ['first']);
  assert.throws(() => writeDemo(storage, 'key', null, ['stale']), /another tab/);
  assert.deepEqual(readDemo(raw, [], valid), ['first']);
});
