import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthUser } from '../src/auth/permissions.ts';
import {
  checkSetPasswordForm, forgotPasswordLink, initials, listTotal, memberSince, needsPassword, organizationOverview, overviewTiles,
  parseSignInMethods, pathToContinue, plural, workspaceOverview,
} from '../src/features/profile-view.ts';

test('initials take the first letter of the first and the last word', () => {
  assert.equal(initials('Jane Doe'), 'JD');
  assert.equal(initials('  jane   mary   doe '), 'JD');
  assert.equal(initials('Jane'), 'J');
  assert.equal(initials('Nguyễn Đàm Chấn Đức'), 'NĐ');
  assert.equal(initials('(Jane) Doe'), 'JD', 'punctuation in front of a word is skipped');
  assert.equal(initials('𝒜da Lovelace'), '𝒜L', 'a letter outside the BMP stays whole');
  assert.equal(initials(''), '?');
  assert.equal(initials('   '), '?');
  assert.equal(initials('--- ...'), '?');
});

test('"member since" reads the creation date, and says nothing when there is none', () => {
  assert.equal(memberSince('2026-01-15T12:00:00.000Z'), 'Member since January 15, 2026');
  for (const missing of [undefined, null, '', 'not a date', 42]) assert.equal(memberSince(missing), null, String(missing));
});

test('sign-in methods are read only when both flags are there; anything else means "do as before"', () => {
  assert.deepEqual(parseSignInMethods({ password: true, github: false }), { password: true, github: false });
  assert.deepEqual(parseSignInMethods({ password: false, github: true, extra: 1 }), { password: false, github: true });
  for (const bad of [undefined, null, 'yes', {}, { password: true }, { password: 'true', github: false }, { password: 1, github: 0 }]) {
    assert.equal(parseSignInMethods(bad), null, JSON.stringify(bad));
  }
  assert.equal(needsPassword({ password: false, github: true }), true);
  assert.equal(needsPassword({ password: true, github: true }), false);
  assert.equal(needsPassword(null), false, 'unknown: keep the change form');
});

test('the session check still accepts a user without the new fields, and one with them', () => {
  const base = { id: 'u1', name: 'Jane', email: 'jane@example.com', role: 'developer-analyst' };
  assert.equal(isAuthUser(base), true);
  assert.equal(isAuthUser({ ...base, username: null, createdAt: '2026-01-15T12:00:00.000Z', signInMethods: { password: false, github: true } }), true);
});

test('the set-password form checks the new password and the repeat', () => {
  assert.deepEqual(checkSetPasswordForm({ newPassword: 'NewPassword1!', confirmNewPassword: 'NewPassword1!' }), {});
  assert.deepEqual(Object.keys(checkSetPasswordForm({ newPassword: '', confirmNewPassword: '' })).sort(), ['confirmNewPassword', 'newPassword']);
  assert.match(checkSetPasswordForm({ newPassword: 'short', confirmNewPassword: 'short' }).newPassword, /at least 8/);
  assert.equal(checkSetPasswordForm({ newPassword: 'NewPassword1!', confirmNewPassword: 'NewPassword2!' }).confirmNewPassword, 'New passwords do not match.');
});

test('the reset link carries the email, encoded', () => {
  assert.equal(forgotPasswordLink('jane+dev@example.com'), '/forgot-password?email=jane%2Bdev%40example.com');
});

test('list totals come from meta.total, or from the rows of an older server', () => {
  assert.equal(listTotal({ data: { projects: [{}] }, meta: { total: 12 } }, 'projects'), 12);
  assert.equal(listTotal({ data: { projects: [{}, {}] } }, 'projects'), 2);
  assert.equal(listTotal({ data: { projects: [] }, meta: { total: 0 } }, 'projects'), 0);
  for (const bad of [null, {}, { data: {} }, { meta: { total: -1 } }, { meta: { total: 'x' } }]) assert.throws(() => listTotal(bad, 'projects'), /invalid list/);
});

test('the overview shows only the tiles whose page the account can open', () => {
  assert.deepEqual(overviewTiles('developer-analyst'), ['organizations', 'workspaces', 'learning', 'ai']);
  assert.deepEqual(overviewTiles('system-administrator'), [], 'an administrator cannot open any of those pages');
});

test('organizations: count, how many owned, and up to three, owned first then by name', () => {
  const orgs = [
    { id: 'c', name: 'Charlie', myRole: 'member' }, { id: 'a', name: 'Alpha', myRole: 'member' },
    { id: 'z', name: 'Zulu', myRole: 'owner' }, { id: 'b', name: 'Bravo', myRole: 'member' },
  ];
  const o = organizationOverview(orgs);
  assert.equal(o.count, 4);
  assert.equal(o.ownedText, '1 you own');
  assert.deepEqual(o.shown.map(x => x.id), ['z', 'a', 'b']);
  assert.equal(o.more, 1);
  assert.deepEqual(organizationOverview([]), { count: 0, ownedText: '0 you own', shown: [], more: 0 });
});

test('workspaces: created, manageable and joined side by side', () => {
  assert.equal(workspaceOverview({ owned: 2, managed: 3, participating: 1 }), '2 you created · 3 you can manage · 1 as member');
});

test('the path to continue is the unfinished one worked on last', () => {
  const p = (id, done, total, lastActivityAt) => ({ id, done, total, lastActivityAt });
  assert.equal(pathToContinue([p('old', 1, 4, '2026-01-01'), p('new', 2, 4, '2026-02-01'), p('done', 3, 3, '2026-03-01')]).id, 'new');
  assert.equal(pathToContinue([p('done', 3, 3, '2026-03-01'), p('empty', 0, 0, '2026-04-01')]), null, 'finished and empty paths are not continued');
  assert.equal(pathToContinue([p('fresh', 0, 5, '2026-01-01')]).id, 'fresh', 'a path not started yet is still one to continue');
  assert.equal(pathToContinue([]), null);
});

test('plural counts', () => {
  assert.equal(plural(1, 'run', 'runs'), '1 run');
  assert.equal(plural(0, 'run', 'runs'), '0 runs');
  assert.equal(plural(12345, 'run', 'runs'), '12,345 runs');
});
