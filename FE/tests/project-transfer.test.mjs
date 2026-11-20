import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { accessWarning, transferBlocker } from '../src/features/project-transfer.ts';
const { parseWorkspace } = await import('../src/features/workspace-summary.ts');

const preview = (extra = {}) => ({ project: { id: 'p', name: 'Shop', repoUrl: 'x' }, organization: { id: 'o', name: 'Acme' }, duplicate: null, membersLosingAccess: [], ...extra });

test('MSG18: a repository the organization already has blocks the move, naming its workspace', () => {
  assert.equal(transferBlocker(preview()), null);
  assert.equal(transferBlocker(preview({ duplicate: { id: 'd', name: 'Shop (team)' } })), 'Acme already has a workspace for this repository ("Shop (team)"). Use that workspace, or delete one of them first.');
});

test('members outside the organization are named before the move', () => {
  assert.equal(accessWarning(preview()), null);
  assert.equal(accessWarning(preview({ membersLosingAccess: [{ userId: 'b', name: 'Bob', email: 'bob@x', role: 'r' }] })),
    '1 member of this workspace is not in Acme and will lose access: Bob. Invite them to the organization to keep them.');
  assert.match(accessWarning(preview({ membersLosingAccess: [{ userId: 'b', name: '', email: 'bob@x', role: 'r' }, { userId: 'c', name: 'Cy', email: 'c@x', role: 'r' }] })), /^2 members .* are not in Acme .*: bob@x, Cy\./);
});

test('only personal workspaces can be moved', () => {
  assert.equal(parseWorkspace({ id: 'a', name: 'A' }).personal, true);
  assert.equal(parseWorkspace({ id: 'a', name: 'A', organizationId: 'o' }).personal, false);
});
