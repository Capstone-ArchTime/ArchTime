import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRange, filterAuditLogs, toAdminSettings, toAuditLog } from '../src/features/admin-audit.ts';

const people = new Map([['u-admin', 'Ada Admin'], ['u-bob', 'Bob Mentor']]);

test('an audit record from the server reads as a dated sentence with names, not ids', () => {
  const log = toAuditLog({
    id: 'a1', action: 'ORGANIZATION_MEMBER_ADD', userId: 'u-admin', targetType: 'organization', targetId: 'o1',
    details: { memberUserId: 'u-bob', role: 'member' }, ipAddress: '::1', createdAt: '2026-11-14T02:00:00.000Z',
  }, people);
  assert.equal(log.id, 'a1');
  assert.equal(log.type, 'organization');
  assert.equal(log.action, 'ORGANIZATION_MEMBER_ADD');
  assert.equal(log.actor, 'Ada Admin');
  assert.equal(log.description, 'Added a member to an organization: Bob Mentor · as member');
  assert.equal(log.ip, '::1');
  assert.equal(log.timestamp, '2026-11-14T02:00:00.000Z');
  assert.ok(Number.isFinite(Date.parse(log.timestamp)));
});

test('events about an account name that account; role changes say the new role', () => {
  const log = toAuditLog({ id: 'a2', action: 'USER_ROLE_CHANGE', userId: 'u-admin', targetType: 'user', targetId: 'u-bob', details: { newRole: 'system-administrator' }, createdAt: '2026-11-14T03:00:00Z' }, people);
  assert.equal(log.type, 'role_change');
  assert.equal(log.description, 'Changed an account role: Bob Mentor · to system-administrator');
  assert.equal(log.target, 'user Bob Mentor');
});

test('unknown actors and actions still read sensibly', () => {
  const system = toAuditLog({ id: 'a3', action: 'SOMETHING_NEW', createdAt: '2026-11-14T03:00:00Z' });
  assert.equal(system.actor, 'System');
  assert.equal(system.type, 'other');
  assert.equal(system.description, 'Something new');
  assert.equal(toAuditLog({ id: 'a4', action: 'USER_LOGIN', userId: 'u-unknown', createdAt: 'x' }).actor, 'u-unknown');
  assert.equal(toAuditLog({ id: 'a5', action: 'USER_LOGIN', userId: 'u-x', userEmail: 'x@archtime.test' }).actor, 'x@archtime.test');
});

test('the Event filter and the search work on groups, actors and descriptions', () => {
  const logs = [
    toAuditLog({ id: '1', action: 'USER_INVITE', userId: 'u-admin', details: { email: 'new@archtime.test' } }, people),
    toAuditLog({ id: '2', action: 'SETTINGS_UPDATE', userId: 'u-bob' }, people),
    toAuditLog({ id: '3', action: 'USER_SUSPEND', userId: 'u-admin', targetType: 'user', targetId: 'u-bob' }, people),
  ];
  assert.deepEqual(filterAuditLogs(logs, { type: 'all' }).map(l => l.id), ['1', '2', '3']);
  assert.deepEqual(filterAuditLogs(logs, { type: 'invitation' }).map(l => l.id), ['1']);
  assert.deepEqual(filterAuditLogs(logs, { type: 'security' }).map(l => l.id), ['3']);
  assert.deepEqual(filterAuditLogs(logs, { query: 'bob' }).map(l => l.id), ['2', '3']);
  assert.deepEqual(filterAuditLogs(logs, { query: 'NEW@archtime' }).map(l => l.id), ['1']);
});

test('the From/To days cover whole local days, so events on the To day are included', () => {
  const { from, to } = auditRange('2026-11-14', '2026-11-14');
  assert.equal(new Date(from).getTime(), new Date('2026-11-14T00:00:00').getTime());
  assert.equal(new Date(to).getTime(), new Date('2026-11-14T23:59:59.999').getTime());
  assert.deepEqual(auditRange('', undefined), { from: undefined, to: undefined });
});

test("system settings are read from the server's { settings } object, in megabytes", () => {
  assert.deepEqual(toAdminSettings({ settings: { maxConcurrentJobs: 7, maxRepoSizeMb: 800, updatedAt: '2026-10-23T17:35:27.910Z', apiKeys: [] } }),
    { maxConcurrentJobs: 7, maxRepoSizeMb: 800, updatedAt: '2026-10-23T17:35:27.910Z' });
  assert.deepEqual(toAdminSettings({ maxConcurrentJobs: 2, maxRepoSizeMb: 100 }), { maxConcurrentJobs: 2, maxRepoSizeMb: 100, updatedAt: undefined });
  assert.deepEqual(toAdminSettings(undefined), { maxConcurrentJobs: 5, maxRepoSizeMb: 500, updatedAt: undefined });
});
