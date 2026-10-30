// Stand-ins for the user and e-mail-code stores and the mail service, shared by the sign-in hardening tests.
// Not a test file itself (its name does not end in .test.mjs).
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";

/** A code store that behaves like MongoOtpRepository: takeAttempt checks and counts in one synchronous step, as MongoDB does in one update. */
export function memoryOtpRepo() {
  const rows = [];
  let seq = 0;
  const copy = row => ({ ...row });
  return {
    rows,
    async create(email, codeHash, expiresAt) {
      const row = { id: `otp${++seq}`, email, codeHash, attempts: 0, expiresAt, createdAt: new Date(Date.now() + seq) };
      rows.push(row);
      return copy(row);
    },
    async findLatestByEmail(email) {
      const mine = rows.filter(r => r.email === email).sort((a, b) => b.createdAt - a.createdAt);
      return mine[0] ? copy(mine[0]) : null;
    },
    async takeAttempt(id, max) {
      const row = rows.find(r => r.id === id);
      if (!row || row.attempts >= max) return null;
      row.attempts += 1;
      return copy(row);
    },
    async deleteByEmail(email) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].email === email) rows.splice(i, 1);
    },
  };
}

/** Accounts keyed by the e-mail as stored (lower case). `passwordHash` is "hash:<password>" for the fake hasher below. */
export function memoryUserRepo(initial = []) {
  const users = initial.map((u, i) => ({ id: `u${i + 1}`, role: UserRole.USER, status: UserStatus.ACTIVE, isVerified: true, tokenVersion: 0, ...u }));
  const resets = [];
  return {
    users,
    resets,
    async findByEmail(email) { return users.find(u => u.email === email) ?? null; },
    async findByEmailOrUsername(id) { return users.find(u => u.email === id || u.email === id.toLowerCase() || u.username === id || u.username === id.toLowerCase()) ?? null; },
    async existsByEmail(email) { return users.some(u => u.email === email); },
    async create(data) { const u = { id: `u${users.length + 1}`, isVerified: false, tokenVersion: 0, status: UserStatus.ACTIVE, ...data }; users.push(u); return u; },
    async setVerified(id) { users.find(u => u.id === id).isVerified = true; },
    async requestPasswordReset(userId, tokenHash) { resets.push({ userId, tokenHash }); return true; },
    async clearPasswordReset() {},
    async resetPassword() { return false; },
  };
}

export const fakeHasher = {
  hashPassword: async p => `hash:${p}`,
  comparePassword: async (p, hash) => hash === `hash:${p}`,
};

/** Records what would have been mailed. */
export function memoryMail() {
  const sent = [];
  return {
    sent,
    sendOtp: async (to, code) => { sent.push({ kind: "otp", to, code }); },
    sendPasswordReset: async (to, token) => { sent.push({ kind: "reset", to, token }); },
    sendInvitation: async () => {},
  };
}
