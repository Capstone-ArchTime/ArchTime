import "./setup-env.mjs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto, { randomUUID } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import mongoose from "mongoose";
import { OtpCodeService } from "../src/infrastructure/services/OtpCodeService.ts";
import { MongoOtpRepository } from "../src/infrastructure/repositories/MongoOtpRepository.ts";
import { OtpModel } from "../src/infrastructure/database/models/OtpModel.ts";
import { RegisterUseCase } from "../src/application/use-cases/RegisterUseCase.ts";
import { ResendOtpUseCase } from "../src/application/use-cases/ResendOtpUseCase.ts";
import { MAX_OTP_ATTEMPTS, VerifyEmailUseCase } from "../src/application/use-cases/VerifyEmailUseCase.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { fakeHasher, memoryMail, memoryOtpRepo, memoryUserRepo } from "./auth-fakes.mjs";

const SECRET = "test-otp-secret";
const otpCodes = new OtpCodeService(SECRET);
const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
const EMAIL = "ann@test.invalid";

/** A pending account with one emailed code, built through the real RegisterUseCase. */
async function pending({ email = EMAIL } = {}) {
  const users = memoryUserRepo([]);
  const otpRepo = memoryOtpRepo();
  const mail = memoryMail();
  await new RegisterUseCase(users, otpRepo, fakeHasher, mail, otpCodes).execute({ name: "Ann", email, password: "Test1234!" });
  const code = mail.sent[0].code;
  const verify = new VerifyEmailUseCase(users, otpRepo, jwt, otpCodes);
  const wrongCode = code === "000000" ? "000001" : "000000";
  return { users, otpRepo, mail, code, wrongCode, verify, user: users.users[0] };
}
const lockedError = err => err.statusCode === 429 && err.code === "OTP_LOCKED" && /request a new code/i.test(err.message);

// ── Making and hashing the code ──

test("codes are six digits made by crypto.randomInt, zero padded, and Math.random is never used", t => {
  t.mock.method(Math, "random", () => { throw new Error("Math.random must not be used for codes"); });
  for (const [value, expected] of [[0, "000000"], [42, "000042"], [999_999, "999999"], [100_000, "100000"]]) {
    const randomInt = t.mock.method(crypto, "randomInt", () => value);
    syncBuiltinESMExports();
    assert.equal(otpCodes.generate(), expected);
    assert.deepEqual(randomInt.mock.calls[0].arguments, [0, 1_000_000], "all one million six-digit values are possible, none more");
    randomInt.mock.restore();
  }
  syncBuiltinESMExports();
  const seen = new Set();
  for (let i = 0; i < 3000; i++) { const code = otpCodes.generate(); assert.match(code, /^\d{6}$/); seen.add(code); }
  assert.ok(seen.size > 2900, "real codes vary");
});

test("the stored value is an HMAC of the e-mail and the code under the server secret, not the code", () => {
  const hash = otpCodes.hash(EMAIL, "123456");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, crypto.createHmac("sha256", SECRET).update("ann@test.invalid:123456").digest("hex"));
  assert.ok(!hash.includes("123456"));
  assert.equal(otpCodes.hash("  ANN@Test.Invalid ", "123456"), hash, "the e-mail is normalised");
  assert.notEqual(otpCodes.hash("bob@test.invalid", "123456"), hash, "tied to the e-mail: a copied hash is useless on another account");
  assert.notEqual(otpCodes.hash(EMAIL, "123457"), hash);
  assert.notEqual(new OtpCodeService("another-secret").hash(EMAIL, "123456"), hash, "keyed by the secret");
  assert.throws(() => new OtpCodeService(""), /secret/);
});

test("matching accepts only the right code and never throws on a stored value of the wrong shape", () => {
  const stored = otpCodes.hash(EMAIL, "123456");
  assert.equal(otpCodes.matches(EMAIL, "123456", stored), true);
  assert.equal(otpCodes.matches(EMAIL, "123457", stored), false);
  assert.equal(otpCodes.matches("bob@test.invalid", "123456", stored), false);
  // timingSafeEqual throws on unequal lengths: these must be answered "no" before it is called.
  for (const odd of ["", "123456", "x".repeat(63), "x".repeat(65), undefined, null, 123456]) {
    assert.equal(otpCodes.matches(EMAIL, "123456", odd), false, String(odd));
  }
});

// ── Registering and resending ──

test("registering stores a hash of the code, never the code, and mails the code", async () => {
  const f = await pending();
  assert.match(f.code, /^\d{6}$/);
  assert.equal(f.otpRepo.rows.length, 1);
  const row = f.otpRepo.rows[0];
  assert.equal(row.codeHash, otpCodes.hash(EMAIL, f.code));
  assert.equal(row.attempts, 0);
  assert.ok(!JSON.stringify(row).includes(f.code), "the code appears nowhere in what is stored");
  assert.equal(f.mail.sent[0].to, EMAIL);
});

test("resend: unknown, verified and waiting addresses get the same answer, and only the waiting one gets mail", async () => {
  const users = memoryUserRepo([
    { email: "waiting@test.invalid", isVerified: false },
    { email: "done@test.invalid", isVerified: true },
  ]);
  const answers = {};
  const mail = memoryMail();
  const otpRepo = memoryOtpRepo();
  const resend = new ResendOtpUseCase(users, otpRepo, mail, otpCodes);
  for (const email of ["waiting@test.invalid", "done@test.invalid", "nobody@test.invalid"]) answers[email] = await resend.execute({ email });
  const [a, b, c] = Object.values(answers);
  assert.deepEqual(Object.keys(a), ["message", "expiresAt"]);
  assert.equal(a.message, b.message);
  assert.equal(b.message, c.message);
  assert.doesNotMatch(a.message, /waiting@|done@|nobody@/, "the message does not even repeat the address");
  for (const answer of Object.values(answers)) {
    const minutes = (new Date(answer.expiresAt).getTime() - Date.now()) / 60_000;
    assert.ok(minutes > 9.9 && minutes <= 10, "a plausible expiry for every address");
  }
  assert.deepEqual(mail.sent.map(m => m.to), ["waiting@test.invalid"], "no mail for the unknown or the verified address");
  assert.deepEqual(otpRepo.rows.map(r => r.email), ["waiting@test.invalid"], "and nothing stored for them");
});

test("resend: the address may be typed with other capitals and spaces, and a mail failure does not change the answer", async () => {
  const users = memoryUserRepo([{ email: EMAIL, isVerified: false }]);
  const otpRepo = memoryOtpRepo();
  const failing = { sendOtp: async () => { throw new Error("SMTP is down"); } };
  const errors = [];
  const log = console.error; console.error = (...args) => errors.push(args);
  try {
    const answer = await new ResendOtpUseCase(users, otpRepo, failing, otpCodes).execute({ email: "  ANN@Test.Invalid " });
    assert.equal(typeof answer.expiresAt, "string");
    await new Promise(resolve => setImmediate(resolve));
  } finally { console.error = log; }
  assert.equal(otpRepo.rows.length, 1);
  assert.equal(otpRepo.rows[0].email, EMAIL);
  assert.equal(errors.length, 1, "the failure is logged for the operator");
});

test("resend: a new code replaces the old one, and the old one stops working", async () => {
  const f = await pending();
  const resend = new ResendOtpUseCase(f.users, f.otpRepo, f.mail, otpCodes);
  await resend.execute({ email: EMAIL });
  const fresh = f.mail.sent[1].code;
  assert.equal(f.otpRepo.rows.length, 1);
  if (fresh !== f.code) await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.code }), err => err.statusCode === 400);
  assert.equal((await f.verify.execute({ email: EMAIL, otp: fresh })).user.isVerified, true);
});

// ── Verifying ──

test("the right code verifies, marks the account, consumes the code and signs the person in", async () => {
  const f = await pending();
  const result = await f.verify.execute({ email: " ANN@test.invalid ", otp: ` ${f.code} ` });
  assert.equal(result.user.isVerified, true);
  assert.equal(f.user.isVerified, true);
  assert.ok(result.tokens.accessToken && result.tokens.refreshToken);
  assert.equal(f.otpRepo.rows.length, 0);
  await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.code }), err => err.statusCode === 400, "a code works once");
});

test("a wrong code says how many tries are left; the fifth wrong code locks it", async () => {
  const f = await pending();
  const messages = [];
  for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) {
    await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.wrongCode }), err => { messages.push(err.message); return err.statusCode === 400 && err.code === "OTP_INVALID"; });
  }
  assert.deepEqual(messages, ["Invalid OTP code. 4 tries left.", "Invalid OTP code. 3 tries left.", "Invalid OTP code. 2 tries left.", "Invalid OTP code. 1 try left."]);
  await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.wrongCode }), lockedError);
  assert.equal(f.user.isVerified, false);
});

test("four wrong codes and then the right one still verifies (five guesses in all)", async () => {
  const f = await pending();
  for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i++) await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.wrongCode }));
  assert.equal((await f.verify.execute({ email: EMAIL, otp: f.code })).user.isVerified, true);
});

test("after five wrong codes even the RIGHT code is refused, until a new code is requested", async () => {
  const f = await pending();
  for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.wrongCode }));
  await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.code }), lockedError);
  await assert.rejects(f.verify.execute({ email: EMAIL, otp: f.code }), lockedError, "and again");
  assert.equal(f.user.isVerified, false);
  assert.equal(f.otpRepo.rows[0].attempts, MAX_OTP_ATTEMPTS, "refused guesses are not even counted");

  await new ResendOtpUseCase(f.users, f.otpRepo, f.mail, otpCodes).execute({ email: EMAIL });
  const fresh = f.mail.sent[1].code;
  assert.equal(f.otpRepo.rows[0].attempts, 0, "a new code starts with a full set of tries");
  assert.equal((await f.verify.execute({ email: EMAIL, otp: fresh })).user.isVerified, true);
});

test("guesses made at the same moment cannot exceed five, and the right code arriving after them is refused", async () => {
  const f = await pending();
  const wrong = Array.from({ length: 30 }, () => f.verify.execute({ email: EMAIL, otp: f.wrongCode }).then(() => "verified", err => err.code));
  const right = f.verify.execute({ email: EMAIL, otp: f.code }).then(() => "verified", err => err.code);
  const outcomes = await Promise.all([...wrong, right]);
  assert.equal(outcomes.filter(o => o === "OTP_INVALID").length, MAX_OTP_ATTEMPTS - 1, "only four wrong answers were ever compared");
  assert.equal(outcomes.filter(o => o === "OTP_LOCKED").length, 31 - (MAX_OTP_ATTEMPTS - 1));
  assert.equal(outcomes.includes("verified"), false);
  assert.equal(f.otpRepo.rows[0].attempts, MAX_OTP_ATTEMPTS);
  assert.equal(f.user.isVerified, false);
});

test("expiry is checked before the code is compared, and an expired code costs no attempt", async () => {
  const f = await pending();
  f.otpRepo.rows[0].expiresAt = new Date(Date.now() - 1000);
  let took = 0;
  const take = f.otpRepo.takeAttempt;
  f.otpRepo.takeAttempt = async (...args) => { took++; return take(...args); };
  for (const otp of [f.code, f.wrongCode]) {
    await assert.rejects(f.verify.execute({ email: EMAIL, otp }), err => err.statusCode === 400 && err.code === "OTP_EXPIRED" && /expired/i.test(err.message));
  }
  assert.equal(took, 0, "no guess was spent on an expired code");
  assert.equal(f.otpRepo.rows[0].attempts, 0);
  assert.equal(f.user.isVerified, false);
});

test("input that is not a six-digit code is refused without costing an attempt", async () => {
  const f = await pending();
  for (const otp of [123456, { $ne: "" }, ["123456"], "12345", "1234567", "12345a", "", "      ", null, undefined]) {
    await assert.rejects(f.verify.execute({ email: EMAIL, otp }), err => err.statusCode === 400, JSON.stringify(otp));
  }
  assert.equal(f.otpRepo.rows[0].attempts, 0);
});

test("an address with no code gets the same plain answer whether or not it has an account", async () => {
  const f = await pending();
  const answers = [];
  for (const email of ["nobody@test.invalid", "someone-else@test.invalid"]) {
    await assert.rejects(f.verify.execute({ email, otp: "123456" }), err => { answers.push(err.message); return err.statusCode === 400; });
  }
  assert.equal(answers[0], answers[1]);
});

test("a code stored in the old plain form never verifies, never crashes, and cannot be used to get in", async () => {
  const f = await pending();
  // What an old document looked like: the plain code, no hash, no counter.
  f.otpRepo.rows[0] = { id: "old", email: EMAIL, code: "123456", expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() };
  await assert.rejects(f.verify.execute({ email: EMAIL, otp: "123456" }), err => err.statusCode === 400 || err.statusCode === 429);
  assert.equal(f.user.isVerified, false);
});

// ── MongoDB: the atomic counter, and old documents, on a real database ──

const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `archtime_test_otp_${randomUUID().slice(0, 8)}`;
let connected = false;
let unavailable = "MongoDB is not reachable";
before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    connected = true;
  } catch (err) {
    unavailable = `MongoDB is not usable: ${err.message}`;
  }
});
after(async () => {
  if (connected) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
const mongoTest = (name, body) => test(`Mongo: ${name}`, async t => {
  if (!connected) return t.skip(unavailable);
  await OtpModel.deleteMany({});
  await body(t);
});

mongoTest("50 simultaneous guesses are granted exactly five attempts", async () => {
  const repo = new MongoOtpRepository();
  const otp = await repo.create(EMAIL, otpCodes.hash(EMAIL, "123456"), new Date(Date.now() + 600_000));
  const taken = await Promise.all(Array.from({ length: 50 }, () => repo.takeAttempt(otp.id, MAX_OTP_ATTEMPTS)));
  assert.equal(taken.filter(Boolean).length, MAX_OTP_ATTEMPTS);
  assert.deepEqual(taken.filter(Boolean).map(o => o.attempts).sort(), [1, 2, 3, 4, 5]);
  assert.equal((await repo.findLatestByEmail(EMAIL)).attempts, MAX_OTP_ATTEMPTS);
  assert.equal(await repo.takeAttempt(otp.id, MAX_OTP_ATTEMPTS), null);
  assert.equal(await repo.takeAttempt(new mongoose.Types.ObjectId().toString(), MAX_OTP_ATTEMPTS), null, "a code that is gone has no attempts");
});

mongoTest("the stored document holds the hash and the counter, and no plain code", async () => {
  const repo = new MongoOtpRepository();
  await repo.create(EMAIL, otpCodes.hash(EMAIL, "654321"), new Date(Date.now() + 600_000));
  const raw = await OtpModel.collection.findOne({ email: EMAIL });
  assert.equal(raw.codeHash, otpCodes.hash(EMAIL, "654321"));
  assert.equal(raw.attempts, 0);
  assert.equal("code" in raw, false);
  assert.ok(!JSON.stringify(raw).includes("654321"));
  await repo.deleteByEmail(EMAIL);
  assert.equal(await repo.findLatestByEmail(EMAIL), null);
});

mongoTest("a document from before hashing (plain code, no counter) cannot be verified and does not crash anything", async () => {
  await OtpModel.collection.insertOne({ email: EMAIL, code: "123456", expiresAt: new Date(Date.now() + 600_000), createdAt: new Date(), updatedAt: new Date() });
  const repo = new MongoOtpRepository();
  const old = await repo.findLatestByEmail(EMAIL);
  assert.equal(old.codeHash, "");
  assert.equal(old.attempts, 0);
  const users = memoryUserRepo([{ email: EMAIL, isVerified: false }]);
  const verify = new VerifyEmailUseCase(users, repo, jwt, otpCodes);
  // It is treated as a code with no guesses used yet: four plain refusals, then the lock like any other code.
  for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) await assert.rejects(verify.execute({ email: EMAIL, otp: "123456" }), err => err.code === "OTP_INVALID", `try ${i}`);
  await assert.rejects(verify.execute({ email: EMAIL, otp: "123456" }), lockedError);
  assert.equal(users.users[0].isVerified, false);
  assert.equal((await repo.takeAttempt(old.id, MAX_OTP_ATTEMPTS)), null, "the counter was started on the old document and ran out like any other");
});

mongoTest("the whole flow on the real repository: lock after five wrong codes, then a new code works", async () => {
  const repo = new MongoOtpRepository();
  const users = memoryUserRepo([]);
  const mail = memoryMail();
  await new RegisterUseCase(users, repo, fakeHasher, mail, otpCodes).execute({ name: "Ann", email: "  Ann@Test.Invalid ", password: "Test1234!" });
  const verify = new VerifyEmailUseCase(users, repo, jwt, otpCodes);
  const code = mail.sent[0].code;
  const wrong = code === "000000" ? "000001" : "000000";
  for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) await assert.rejects(verify.execute({ email: EMAIL, otp: wrong }));
  await assert.rejects(verify.execute({ email: EMAIL, otp: code }), lockedError);
  await new ResendOtpUseCase(users, repo, mail, otpCodes).execute({ email: EMAIL });
  assert.equal((await verify.execute({ email: EMAIL, otp: mail.sent[1].code })).user.isVerified, true);
});
