import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_UNREAD, parseUnread, unreadMessage } from '../src/features/unread-findings.ts';

test('MSG26 says how many new findings there are and where', () => {
  assert.equal(unreadMessage(NO_UNREAD), null);
  assert.equal(unreadMessage({ total: 1, projects: [{ projectId: 'a', projectName: 'Shop', count: 1 }] }), 'You have 1 new conformance finding in Shop to review.');
  assert.equal(unreadMessage({ total: 5, projects: [{ projectId: 'a', projectName: 'Shop', count: 3 }, { projectId: 'b', projectName: 'Billing', count: 2 }] }),
    'You have 5 new conformance findings in 2 workspaces to review.');
});

test('the count is taken from the listed workspaces, and anything malformed is dropped', () => {
  assert.deepEqual(parseUnread({ total: 99, projects: [{ projectId: 'a', projectName: 'Shop', count: 2 }, { projectId: 'b', projectName: 'X', count: 0 }, { projectId: 7, count: 3 }, null] }),
    { total: 2, projects: [{ projectId: 'a', projectName: 'Shop', count: 2 }] });
  assert.deepEqual(parseUnread(undefined), NO_UNREAD);
});
