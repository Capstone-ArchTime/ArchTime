import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { RegisterUseCase } from "../src/application/use-cases/RegisterUseCase.ts";
import { ResendOtpUseCase } from "../src/application/use-cases/ResendOtpUseCase.ts";

// The verification page counts down to the moment the emailed code stops working, so both ways of getting a code say when
// that is, and it is the moment the stored code actually expires.
function fakes() {
  const stored = [];
  const users = new Map();
  return {
    stored,
    userRepo: {
      existsByEmail: async email => users.has(email),
      findByEmail: async email => users.get(email) ?? null,
      create: async data => { const user = { id: "u1", isVerified: false, ...data }; users.set(data.email, user); return user; },
    },
    otpRepo: { deleteByEmail: async () => {}, create: async (email, code, expiresAt) => { stored.push({ email, code, expiresAt }); } },
    emailService: { sendOtp: async () => {} },
    hasher: { hashPassword: async () => "hash" },
  };
}

const minutesAhead = iso => (new Date(iso).getTime() - Date.now()) / 60_000;

test("registering says when the emailed code expires, and it is when the stored code expires", async () => {
  const f = fakes();
  const result = await new RegisterUseCase(f.userRepo, f.otpRepo, f.hasher, f.emailService).execute({ name: "Ann", email: "ann@test.invalid", password: "x" });
  assert.equal(typeof result.expiresAt, "string");
  assert.equal(new Date(result.expiresAt).getTime(), f.stored[0].expiresAt.getTime());
  assert.ok(minutesAhead(result.expiresAt) > 9.9 && minutesAhead(result.expiresAt) <= 10);
});

test("a new code says when it expires too", async () => {
  const f = fakes();
  await f.userRepo.create({ email: "ann@test.invalid", name: "Ann" });
  const result = await new ResendOtpUseCase(f.userRepo, f.otpRepo, f.emailService).execute({ email: "ann@test.invalid" });
  assert.equal(new Date(result.expiresAt).getTime(), f.stored[0].expiresAt.getTime());
  assert.ok(minutesAhead(result.expiresAt) > 9.9);
});
