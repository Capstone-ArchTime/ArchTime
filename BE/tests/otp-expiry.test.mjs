import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { RegisterUseCase } from "../src/application/use-cases/RegisterUseCase.ts";
import { ResendOtpUseCase } from "../src/application/use-cases/ResendOtpUseCase.ts";
import { OtpCodeService } from "../src/infrastructure/services/OtpCodeService.ts";
import { memoryMail, memoryOtpRepo, memoryUserRepo, fakeHasher } from "./auth-fakes.mjs";

// The verification page counts down to the moment the emailed code stops working, so both ways of getting a code say when
// that is, and it is the moment the stored code actually expires.
const otpCodes = new OtpCodeService("test-secret");
const minutesAhead = iso => (new Date(iso).getTime() - Date.now()) / 60_000;

test("registering says when the emailed code expires, and it is when the stored code expires", async () => {
  const otpRepo = memoryOtpRepo();
  const result = await new RegisterUseCase(memoryUserRepo([]), otpRepo, fakeHasher, memoryMail(), otpCodes)
    .execute({ name: "Ann", email: "ann@test.invalid", password: "x" });
  assert.equal(typeof result.expiresAt, "string");
  assert.equal(new Date(result.expiresAt).getTime(), otpRepo.rows[0].expiresAt.getTime());
  assert.ok(minutesAhead(result.expiresAt) > 9.9 && minutesAhead(result.expiresAt) <= 10);
});

test("a new code says when it expires too", async () => {
  const otpRepo = memoryOtpRepo();
  const users = memoryUserRepo([{ email: "ann@test.invalid", name: "Ann", isVerified: false }]);
  const result = await new ResendOtpUseCase(users, otpRepo, memoryMail(), otpCodes).execute({ email: "ann@test.invalid" });
  assert.equal(new Date(result.expiresAt).getTime(), otpRepo.rows[0].expiresAt.getTime());
  assert.ok(minutesAhead(result.expiresAt) > 9.9);
});
