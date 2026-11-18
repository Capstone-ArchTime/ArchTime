import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS, FINDING_TYPES, findingTitle, latestCheck } from '../src/features/conformance.ts';

test('a finding is worded by its type, naming the components and the rule', () => {
  assert.equal(findingTitle({ type: 'forbidden-dependency', sourceName: 'Domain', targetName: 'Database', ruleName: 'Domain stays pure' }), 'Domain → Database is forbidden by "Domain stays pure"');
  assert.equal(findingTitle({ type: 'missing-required-dependency', sourceName: 'Web', targetName: 'API', ruleName: null }), 'Web → API is required but missing');
  assert.equal(findingTitle({ type: 'undeclared-dependency', sourceName: 'Web', targetName: 'Domain', ruleName: null }), 'Web → Domain is not in the diagram');
  assert.deepEqual(Object.keys(FINDING_TYPES).sort(), ['convention', 'forbidden-dependency', 'missing-required-dependency', 'undeclared-dependency']);
  // T5: a convention finding is worded by its own sentence.
  assert.equal(findingTitle({ type: 'convention', sourceName: 'Commit message', targetName: 'Commit message', ruleName: 'The subject has no scope: write type(scope): summary.' }), 'The subject has no scope: write type(scope): summary.');
});

test('accept and dismiss ask for a note, fix does not, as the server requires', () => {
  assert.deepEqual(Object.entries(DECISIONS).map(([k, d]) => [k, d.needsNote]), [['fix', false], ['accept', true], ['dismiss', true]]);
});

test('the check shown first is the newest commit checked, whatever order the list came in', () => {
  const check = (snapshotId, commitDate) => ({ snapshotId, commitDate });
  assert.equal(latestCheck([check('a', '2026-11-01T00:00:00Z'), check('c', '2026-11-03T00:00:00Z'), check('b', '2026-11-02T00:00:00Z')]).snapshotId, 'c');
  assert.equal(latestCheck([]), null);
});

test('the "E-mail new findings" result is worded for each case', async () => {
  const { notifyMessage } = await import('../src/features/conformance.ts');
  assert.deepEqual(notifyMessage({ findings: 3, sent: 2, recipients: 2 }), { kind: 'success', text: 'E-mailed 3 new findings to 2 people.' });
  assert.deepEqual(notifyMessage({ findings: 1, sent: 1, recipients: 2 }), { kind: 'success', text: 'E-mailed 1 new finding to 1 of 2 people.' });
  assert.equal(notifyMessage({ findings: 6, problems: 5, sent: 1, recipients: 1 }).text, 'E-mailed 5 new findings to 1 person.', 'counted as the e-mail counts');
  assert.equal(notifyMessage({ findings: 0, sent: 0, recipients: 0 }).kind, 'info');
  assert.match(notifyMessage({ findings: 2, sent: 0, recipients: 0 }).text, /nobody can receive them/);
  assert.match(notifyMessage({ findings: 2, sent: 0, recipients: 3 }).text, /SMTP/);
});
