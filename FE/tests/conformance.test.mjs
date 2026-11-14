import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS, FINDING_TYPES, findingTitle, latestCheck } from '../src/features/conformance.ts';

test('a finding is worded by its type, naming the components and the rule', () => {
  assert.equal(findingTitle({ type: 'forbidden-dependency', sourceName: 'Domain', targetName: 'Database', ruleName: 'Domain stays pure' }), 'Domain → Database is forbidden by "Domain stays pure"');
  assert.equal(findingTitle({ type: 'missing-required-dependency', sourceName: 'Web', targetName: 'API', ruleName: null }), 'Web → API is required but missing');
  assert.equal(findingTitle({ type: 'undeclared-dependency', sourceName: 'Web', targetName: 'Domain', ruleName: null }), 'Web → Domain is not in the diagram');
  assert.deepEqual(Object.keys(FINDING_TYPES).sort(), ['forbidden-dependency', 'missing-required-dependency', 'undeclared-dependency']);
});

test('accept and dismiss ask for a note, fix does not, as the server requires', () => {
  assert.deepEqual(Object.entries(DECISIONS).map(([k, d]) => [k, d.needsNote]), [['fix', false], ['accept', true], ['dismiss', true]]);
});

test('the check shown first is the newest commit checked, whatever order the list came in', () => {
  const check = (snapshotId, commitDate) => ({ snapshotId, commitDate });
  assert.equal(latestCheck([check('a', '2026-11-01T00:00:00Z'), check('c', '2026-11-03T00:00:00Z'), check('b', '2026-11-02T00:00:00Z')]).snapshotId, 'c');
  assert.equal(latestCheck([]), null);
});
