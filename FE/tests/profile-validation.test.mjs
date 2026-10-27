import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAME_MAX, accountTypeLabel, buildProfilePatch, checkName, checkNewPassword, checkPasswordForm, passwordRequirements, checkUsername, normalizeUsername,
} from '../src/features/profile-validation.ts';

test('a name must be there after trimming and at most 100 characters', () => {
  assert.equal(checkName('Jane Doe'), null);
  assert.equal(checkName('x'.repeat(NAME_MAX)), null);
  assert.ok(checkName(''));
  assert.ok(checkName('   '));
  assert.ok(checkName('x'.repeat(NAME_MAX + 1)));
  assert.equal(checkName(`  ${'x'.repeat(NAME_MAX)}  `), null, 'the spaces around it do not count');
});

test('a username is checked the way the server checks it: trimmed and lower-cased first', () => {
  for (const ok of ['ab1', 'jane.doe', 'a-b_c', 'Jane.Doe', '  jane  ', 'a'.repeat(32), '', '   ']) assert.equal(checkUsername(ok), null, `"${ok}" is fine`);
  for (const bad of ['ab', 'a'.repeat(33), '.jane', 'jane.', '_jane', 'jane-', 'ja ne', 'jané', 'jane@example.com']) assert.ok(checkUsername(bad), `"${bad}" is not`);
  assert.equal(normalizeUsername('  Jane.DOE '), 'jane.doe');
});

test('a password follows the server rules, in the server order', () => {
  assert.equal(checkNewPassword('Abcdef1!'), null);
  assert.match(checkNewPassword('Abc1!'), /at least 8/);
  assert.match(checkNewPassword('Abcdef1! x'), /spaces/);
  assert.match(checkNewPassword('abcdef1!'), /uppercase/);
  assert.match(checkNewPassword('ABCDEF1!'), /lowercase/);
  assert.match(checkNewPassword('Abcdefg!'), /number/);
  assert.match(checkNewPassword('Abcdefg1'), /special/);
  // The first rule that fails is the one reported, as on the server.
  assert.match(checkNewPassword('abc'), /at least 8/);
});

test('every special character the server accepts is accepted', () => {
  for (const ch of `!@#$%^&*(),.?":{}|<>-_+=[]/'\\`) assert.equal(checkNewPassword(`Abcdef1${ch}`), null, `special "${ch}"`);
  for (const ch of ['~', '`', ';', 'é', '€']) assert.match(checkNewPassword(`Abcdef1${ch}`) ?? '', /special/, `"${ch}" does not count as special`);
});

test('the password limit is 72 bytes, not 72 characters', () => {
  const base = 'Aa1!';
  assert.equal(checkNewPassword(base + 'x'.repeat(72 - base.length)), null, '72 bytes exactly');
  assert.match(checkNewPassword(base + 'x'.repeat(73 - base.length)) ?? '', /72 bytes/);
  const cjk = base + '字'.repeat(23);   // 4 + 23 characters, but 4 + 69 = 73 bytes
  assert.equal(cjk.length, 27);
  assert.match(checkNewPassword(cjk) ?? '', /72 bytes/, 'short in characters, long in bytes');
  assert.equal(checkNewPassword(base + '字'.repeat(22)), null, '70 bytes');
});

test('the password form asks for all three fields and the same new password twice', () => {
  assert.deepEqual(checkPasswordForm({ oldPassword: 'old', newPassword: 'Abcdef1!', confirmNewPassword: 'Abcdef1!' }), {});
  const empty = checkPasswordForm({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
  assert.deepEqual(Object.keys(empty).sort(), ['confirmNewPassword', 'newPassword', 'oldPassword']);
  assert.equal(checkPasswordForm({ oldPassword: 'o', newPassword: 'Abcdef1!', confirmNewPassword: 'Abcdef1?' }).confirmNewPassword, 'New passwords do not match.');
  assert.match(checkPasswordForm({ oldPassword: 'o', newPassword: 'weak', confirmNewPassword: 'weak' }).newPassword, /at least 8/);
});

test('only what changed is sent, and a removed username is null', () => {
  const saved = { name: 'Jane Doe', username: 'jane' };
  assert.equal(buildProfilePatch(saved, { name: 'Jane Doe', username: 'jane' }), null);
  assert.equal(buildProfilePatch(saved, { name: '  Jane Doe ', username: ' JANE ' }), null, 'spaces and case are not changes');
  assert.deepEqual(buildProfilePatch(saved, { name: 'Jane D.', username: 'jane' }), { name: 'Jane D.' });
  assert.deepEqual(buildProfilePatch(saved, { name: 'Jane Doe', username: 'Janet' }), { username: 'janet' });
  assert.deepEqual(buildProfilePatch(saved, { name: 'Jane Doe', username: '' }), { username: null });
  assert.deepEqual(buildProfilePatch({ name: 'Jane Doe' }, { name: 'Jane Doe', username: 'jane' }), { username: 'jane' }, 'no username yet');
  assert.equal(buildProfilePatch({ name: 'Jane Doe', username: null }, { name: 'Jane Doe', username: '' }), null);
  assert.deepEqual(buildProfilePatch(saved, { name: 'Jo', username: '' }), { name: 'Jo', username: null });
});

test('the two system roles have a plain name', () => {
  assert.equal(accountTypeLabel('system-administrator'), 'System administrator');
  assert.equal(accountTypeLabel('developer-analyst'), 'User');
  assert.equal(accountTypeLabel('project-maintainer'), 'User');
});

test('the checklist under a new password ticks off the same rules the server checks', () => {
  const unmet = p => passwordRequirements(p).filter(r => !r.met).map(r => r.label);
  assert.equal(unmet('Abcdef1!').length, 0);
  assert.equal(checkNewPassword('Abcdef1!'), null, 'all ticked means the server accepts it');
  assert.deepEqual(unmet(''), ['At least 8 characters', 'An uppercase letter (A-Z)', 'A lowercase letter (a-z)', 'A number (0-9)', 'A special character, such as ! @ # $ % _ -', 'No spaces'], 'an empty field is not "no spaces" yet');
  assert.deepEqual(unmet('abcdefgh'), ['An uppercase letter (A-Z)', 'A number (0-9)', 'A special character, such as ! @ # $ % _ -']);
  assert.deepEqual(unmet('Abcdef1! x'), ['No spaces']);
  assert.deepEqual(unmet('Aa1!' + 'é'.repeat(40)), ['At most 72 bytes']);
  for (const p of ['Abc1!', 'abcdef1!', 'ABCDEF1!', 'Abcdefg!', 'Abcdefg1', 'Abcdef1! x']) {
    assert.ok(unmet(p).length > 0 && checkNewPassword(p), p + ': a missing tick is a refusal');
  }
});
