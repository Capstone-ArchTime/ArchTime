import test from 'node:test';
import assert from 'node:assert/strict';
import { ChangePasswordUseCase } from '../src/application/use-cases/ChangePasswordUseCase.ts';
import { MongoUserRepository } from '../src/infrastructure/repositories/MongoUserRepository.ts';
import { UserModel } from '../src/infrastructure/database/models/UserModel.ts';
import { validatePassword } from '../src/shared/utils/validators.ts';
import { PasswordResetUseCase } from '../src/application/use-cases/PasswordResetUseCase.ts';

test('change password verifies stored credentials before updating', async () => {
  const updates = [];
  const users = {
    findById: async () => ({ id: 'u1', email: 'user@example.com', passwordHash: '' }),
    findByEmail: async () => ({ id: 'u1', passwordHash: 'stored-hash' }),
    updatePassword: async (...args) => updates.push(args),
  };
  const hasher = {
    comparePassword: async (password, hash) => password === 'old-password' && hash === 'stored-hash',
    hashPassword: async () => 'new-hash',
  };
  const change = new ChangePasswordUseCase(users, hasher);
  await assert.rejects(change.execute({ userId: 'u1', oldPassword: 'wrong', newPassword: 'NewPassword1!' }), /Invalid old password/);
  assert.equal(updates.length, 0);
  await change.execute({ userId: 'u1', oldPassword: 'old-password', newPassword: 'NewPassword1!' });
  assert.deepEqual(updates, [['u1', 'new-hash']]);
});

test('password changes revoke sessions and outstanding reset codes', async t => {
  const update = t.mock.method(UserModel, 'updateOne', async () => ({ modifiedCount: 1 }));
  await new MongoUserRepository().updatePassword('u1', 'new-hash');
  assert.deepEqual(update.mock.calls[0].arguments, [{ _id: 'u1' }, {
    $set: { passwordHash: 'new-hash' }, $inc: { tokenVersion: 1 },
    $unset: { resetTokenHash: 1, resetExpiresAt: 1 },
  }]);
});

test('merged validation rejects weak, oversized and non-string passwords', () => {
  for (const password of ['short', 'NoDigitsHere!', 'NoSymbol123', 'WITHNOSMALL1!', 'With space1!', 'A1!' + 'a'.repeat(70), null]) {
    assert.throws(() => validatePassword(password));
  }
  assert.doesNotThrow(() => validatePassword('ValidPassword1!'));
});

test('reset keeps the current frontend payload and hashes its one-use token', async () => {
  let resetArgs;
  const reset = new PasswordResetUseCase({ resetPassword: async (...args) => { resetArgs = args; return true; } }, {}, { hashPassword: async () => 'hash' });
  const token = 'a'.repeat(32);
  await reset.reset({ email: 'USER@example.com', token, password: 'NewPassword1!', confirmPassword: 'NewPassword1!' });
  assert.equal(resetArgs[0], 'user@example.com');
  assert.match(resetArgs[1], /^[a-f0-9]{64}$/);
  assert.notEqual(resetArgs[1], token);
  assert.equal(resetArgs[2], 'hash');
});
