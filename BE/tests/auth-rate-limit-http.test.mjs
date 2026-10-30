import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { parseTrustProxy } from "../src/config/env.ts";
import { AuthController } from "../src/presentation/controllers/AuthController.ts";
import { createAuthRouter } from "../src/presentation/routes/auth.routes.ts";
import { AUTH_LIMITS } from "../src/presentation/middlewares/authRateLimits.ts";
import { errorHandler } from "../src/presentation/middlewares/errorHandler.ts";
import { InMemoryRateLimiter } from "../src/infrastructure/services/InMemoryRateLimiter.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { OtpCodeService } from "../src/infrastructure/services/OtpCodeService.ts";
import { RegisterUseCase } from "../src/application/use-cases/RegisterUseCase.ts";
import { VerifyEmailUseCase } from "../src/application/use-cases/VerifyEmailUseCase.ts";
import { ResendOtpUseCase } from "../src/application/use-cases/ResendOtpUseCase.ts";
import { LoginUseCase } from "../src/application/use-cases/LoginUseCase.ts";
import { PasswordResetUseCase } from "../src/application/use-cases/PasswordResetUseCase.ts";
import { fakeHasher, memoryMail, memoryOtpRepo, memoryUserRepo } from "./auth-fakes.mjs";

// Real routes, real middleware, real use cases; only the stores, the mail and the clock are stand-ins.
async function startServer(t, { trustProxy = false, users = [] } = {}) {
  const clock = { t: Date.now() };
  const mail = memoryMail();
  const userRepo = memoryUserRepo(users);
  const otpRepo = memoryOtpRepo();
  const otpCodes = new OtpCodeService("test-secret");
  const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
  const unused = {};
  const controller = new AuthController(
    new RegisterUseCase(userRepo, otpRepo, fakeHasher, mail, otpCodes),
    new VerifyEmailUseCase(userRepo, otpRepo, jwt, otpCodes),
    new ResendOtpUseCase(userRepo, otpRepo, mail, otpCodes),
    new LoginUseCase(userRepo, fakeHasher, jwt),
    unused, unused,
    new PasswordResetUseCase(userRepo, mail, fakeHasher),
    unused,
  );
  // Records every counter that is hit, in order, so a test can see which counters a refused request touched.
  const inner = new InMemoryRateLimiter(() => clock.t);
  const hits = [];
  const limiter = { hit: (key, ...rest) => { hits.push(key); return inner.hit(key, ...rest); }, refund: key => inner.refund(key), reset: key => inner.reset(key) };
  const app = express();
  app.set("trust proxy", trustProxy);
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(controller, jwt, limiter));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  let n = 0;
  /** `ip` fakes X-Forwarded-For (only believed when trustProxy is set). */
  const post = async (path, body, ip) => {
    const res = await fetch(`${base}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(ip ? { "X-Forwarded-For": ip } : {}) }, body: JSON.stringify(body),
    });
    return { status: res.status, retryAfter: res.headers.get("retry-after"), body: await res.json() };
  };
  return { post, mail, userRepo, otpRepo, hits, advance: seconds => { clock.t += seconds * 1000; }, unique: () => `user${++n}@test.invalid` };
}

const registerBody = email => ({ name: "Ann", email, password: "Test1234!", confirmPassword: "Test1234!" });
const assertLimited = (res, { max, min = 1 } = {}) => {
  assert.equal(res.status, 429, JSON.stringify(res.body));
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, "RATE_LIMITED");
  const seconds = res.body.error.retryAfterSeconds;
  assert.ok(Number.isInteger(seconds) && seconds >= min && (max === undefined || seconds <= max), `retryAfterSeconds ${seconds}`);
  assert.equal(res.body.error.message, `Too many requests. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`);
  assert.equal(res.retryAfter, String(seconds), "the Retry-After header says the same");
};

test("resend-otp: one code per minute per e-mail, the answer says exactly when to ask again, and spelling tricks do not help", async t => {
  const s = await startServer(t, { users: [{ email: "ann@test.invalid", isVerified: false }] });
  assert.equal((await s.post("resend-otp", { email: "ann@test.invalid" })).status, 200);
  s.advance(20);
  assertLimited(await s.post("resend-otp", { email: "ann@test.invalid" }), { max: 40, min: 40 });
  for (const trick of ["ANN@test.invalid", "  Ann@Test.Invalid  ", "ann@test.invalid\t"]) {
    assertLimited(await s.post("resend-otp", { email: trick }), { max: 40 });
  }
  assert.equal(s.mail.sent.length, 1, "refused requests sent nothing");
  assert.equal((await s.post("resend-otp", { email: "bob@test.invalid" })).status, 200, "another address is not affected");
  s.advance(40);
  assert.equal((await s.post("resend-otp", { email: "ann@test.invalid" })).status, 200, "allowed again exactly when it said");
});

test("resend-otp: 5 an hour per e-mail, then it says to wait for the rest of the hour", async t => {
  const s = await startServer(t, { users: [{ email: "ann@test.invalid", isVerified: false }] });
  for (let i = 0; i < AUTH_LIMITS.resendOtp.email.limit; i++) {
    assert.equal((await s.post("resend-otp", { email: "ann@test.invalid" })).status, 200, `request ${i + 1}`);
    s.advance(61);
  }
  const refused = await s.post("resend-otp", { email: "ann@test.invalid" });
  assertLimited(refused, { min: 3000, max: 3600 });
  s.advance(refused.body.error.retryAfterSeconds);
  assert.equal((await s.post("resend-otp", { email: "ann@test.invalid" })).status, 200);
});

test("resend-otp: the cooldown and the hourly limit apply to unknown addresses too, so they cannot be used to find accounts", async t => {
  const s = await startServer(t);
  assert.equal((await s.post("resend-otp", { email: "nobody@test.invalid" })).status, 200);
  assertLimited(await s.post("resend-otp", { email: "nobody@test.invalid" }), { max: 60 });
});

test("resend-otp: 20 an hour per IP", async t => {
  const s = await startServer(t);
  for (let i = 0; i < AUTH_LIMITS.resendOtp.ip.limit; i++) assert.equal((await s.post("resend-otp", { email: s.unique() })).status, 200, `request ${i + 1}`);
  assertLimited(await s.post("resend-otp", { email: s.unique() }), { min: 3500 });
});

test("register: 3 an hour per e-mail (failed attempts count too), 10 an hour per IP", async t => {
  const s = await startServer(t);
  assert.equal((await s.post("register", registerBody("ann@test.invalid"))).status, 201);
  assert.equal((await s.post("register", registerBody("Ann@Test.Invalid"))).status, 409, "a refused registration still counts");
  assert.equal((await s.post("register", registerBody(" ann@test.invalid "))).status, 409);
  assertLimited(await s.post("register", registerBody("ANN@TEST.INVALID")), { min: 3500 });
  assert.equal((await s.post("register", registerBody("bob@test.invalid"))).status, 201, "another address still works");
  // 5 requests so far from this IP (the refused one counted too); 5 more fill the 10 an hour.
  for (let i = 0; i < 5; i++) assert.equal((await s.post("register", registerBody(s.unique()))).status, 201, `request ${i + 6}`);
  assertLimited(await s.post("register", registerBody(s.unique())), { min: 3500 });
  s.advance(3601);
  assert.equal((await s.post("register", registerBody(s.unique()))).status, 201, "a new hour starts clean");
});

test("forgot-password: 1 a minute and 5 an hour per e-mail, 20 an hour per IP, and the answer for an unknown e-mail stays the same", async t => {
  const s = await startServer(t, { users: [{ email: "ann@test.invalid", isVerified: true }] });
  const known = await s.post("forgot-password", { email: "ann@test.invalid" });
  const unknown = await s.post("forgot-password", { email: "nobody@test.invalid" });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, known.body, "an unknown address gets the same answer as a real one");
  assertLimited(await s.post("forgot-password", { email: "ann@test.invalid" }), { max: 60 });
  assertLimited(await s.post("forgot-password", { email: "NOBODY@test.invalid " }), { max: 60 });
  assert.equal(s.mail.sent.filter(m => m.kind === "reset").length, 1);
  for (let i = 0; i < 4; i++) { s.advance(61); assert.equal((await s.post("forgot-password", { email: "ann@test.invalid" })).status, 200, `request ${i + 2}`); }
  s.advance(61);
  assertLimited(await s.post("forgot-password", { email: "ann@test.invalid" }), { min: 3000 });
});

test("forgot-password: 20 an hour per IP", async t => {
  const s = await startServer(t);
  for (let i = 0; i < AUTH_LIMITS.forgotPassword.ip.limit; i++) assert.equal((await s.post("forgot-password", { email: s.unique() })).status, 200, `request ${i + 1}`);
  assertLimited(await s.post("forgot-password", { email: s.unique() }), { min: 3500 });
});

test("verify-email: 10 requests per 15 minutes per e-mail, 60 per IP; a correct code is not hurt by the limits", async t => {
  const s = await startServer(t);
  const wrong = email => s.post("verify-email", { email, otp: "000000" });
  for (let i = 0; i < AUTH_LIMITS.verifyEmail.email.limit; i++) assert.equal((await wrong("ann@test.invalid")).status, 400, `request ${i + 1}`);
  assertLimited(await wrong("Ann@test.invalid"), { min: 800, max: 900 });
  assert.equal((await wrong("bob@test.invalid")).status, 400, "another address is separate");
  s.advance(901);
  assert.equal((await wrong("ann@test.invalid")).status, 400, "after the window it is counted again from zero");

  await s.post("register", registerBody("cy@test.invalid"));
  const code = s.mail.sent.find(m => m.to === "cy@test.invalid").code;
  const ok = await s.post("verify-email", { email: "cy@test.invalid", otp: code });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.user.isVerified, true);
});

test("verify-email: 60 per 15 minutes per IP", async t => {
  const s = await startServer(t);
  for (let i = 0; i < AUTH_LIMITS.verifyEmail.ip.limit; i++) assert.equal((await s.post("verify-email", { email: s.unique(), otp: "000000" })).status, 400, `request ${i + 1}`);
  assertLimited(await s.post("verify-email", { email: s.unique(), otp: "000000" }), { min: 800, max: 900 });
});

test("login: only failed attempts count, 10 per account per 15 minutes, and a lock holds even for the right password", async t => {
  const s = await startServer(t, { users: [{ email: "ann@test.invalid", username: "ann", passwordHash: "hash:Right123!" }] });
  const login = (email, password = "Wrong123!") => s.post("login", { email, password });
  for (let i = 0; i < AUTH_LIMITS.login.account.limit; i++) assert.equal((await login("ann@test.invalid")).status, 401, `failure ${i + 1}`);
  assertLimited(await login("ANN@test.invalid"), { min: 800, max: 900 });
  assertLimited(await login("  ann@test.invalid ", "Right123!"), { max: 900 });
  assert.equal((await login("someone@test.invalid")).status, 401, "another account is not locked");
  s.advance(901);
  const ok = await login("ann@test.invalid", "Right123!");
  assert.equal(ok.status, 200);
  assert.ok(ok.body.data.accessToken);
});

test("login: successful sign-ins never add up to a limit, and one clears the account's failures", async t => {
  const s = await startServer(t, { users: [{ email: "ann@test.invalid", passwordHash: "hash:Right123!" }] });
  const login = password => s.post("login", { email: "ann@test.invalid", password });
  for (let i = 0; i < 150; i++) assert.equal((await login("Right123!")).status, 200, `success ${i + 1} (more than the per-IP limit)`);
  for (let i = 0; i < 9; i++) assert.equal((await login("Wrong123!")).status, 401);
  assert.equal((await login("Right123!")).status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await login("Wrong123!")).status, 401, `failure ${i + 1} after the success cleared the counter`);
  assertLimited(await login("Wrong123!"));
});

test("login: 100 failures per IP per 15 minutes, across different accounts", async t => {
  const s = await startServer(t);
  for (let i = 0; i < AUTH_LIMITS.login.ip.limit; i++) assert.equal((await s.post("login", { email: s.unique(), password: "x" })).status, 401, `failure ${i + 1}`);
  assertLimited(await s.post("login", { email: s.unique(), password: "x" }), { min: 800, max: 900 });
});

test("login: requests that are not password guesses (bad input, unverified account) are not held against the person", async t => {
  const s = await startServer(t, { users: [{ email: "new@test.invalid", isVerified: false, passwordHash: "hash:Right123!" }, { email: "ann@test.invalid", passwordHash: "hash:Right123!" }] });
  for (let i = 0; i < 30; i++) assert.equal((await s.post("login", { email: "ann@test.invalid" })).status, 400, "no password sent");
  for (let i = 0; i < 30; i++) assert.equal((await s.post("login", { email: "new@test.invalid", password: "Right123!" })).status, 403, "right password, not verified");
  // None of that used up the account's failures or the IP's.
  for (let i = 0; i < 10; i++) assert.equal((await s.post("login", { email: "ann@test.invalid", password: "Wrong123!" })).status, 401);
  assertLimited(await s.post("login", { email: "ann@test.invalid", password: "Wrong123!" }));
});

test("login: a 400 cannot be used to wipe the failure counter", async t => {
  const s = await startServer(t, { users: [{ email: "ann@test.invalid", passwordHash: "hash:Right123!" }] });
  for (let i = 0; i < 9; i++) await s.post("login", { email: "ann@test.invalid", password: "Wrong123!" });
  assert.equal((await s.post("login", { email: "ann@test.invalid" })).status, 400);
  assert.equal((await s.post("login", { email: "ann@test.invalid", password: "Wrong123!" })).status, 401, "the 10th failure");
  assertLimited(await s.post("login", { email: "ann@test.invalid", password: "Wrong123!" }));
});

test("login: 30 guesses fired at once get exactly 10 answers, the rest are refused", async t => {
  const s = await startServer(t, { users: [{ email: "ann@test.invalid", passwordHash: "hash:Right123!" }] });
  const results = await Promise.all(Array.from({ length: 30 }, () => s.post("login", { email: "ann@test.invalid", password: "Wrong123!" })));
  assert.equal(results.filter(r => r.status === 401).length, AUTH_LIMITS.login.account.limit);
  assert.equal(results.filter(r => r.status === 429).length, 30 - AUTH_LIMITS.login.account.limit);
});

test("reset-password: 10 per 15 minutes per e-mail", async t => {
  const s = await startServer(t);
  const attempt = email => s.post("reset-password", { email, token: "a".repeat(32), password: "Test1234!", confirmPassword: "Test1234!" });
  for (let i = 0; i < AUTH_LIMITS.resetPassword.email.limit; i++) assert.equal((await attempt("ann@test.invalid")).status, 400, `request ${i + 1}`);
  assertLimited(await attempt(" ANN@test.invalid"), { min: 800, max: 900 });
  assert.equal((await attempt("bob@test.invalid")).status, 400);
});

const tokenBody = email => ({ email, token: "a".repeat(32), password: "Test1234!", confirmPassword: "Test1234!" });
const routes = {
  register: { limit: AUTH_LIMITS.register.ip.limit, body: registerBody },
  "resend-otp": { limit: AUTH_LIMITS.resendOtp.ip.limit, body: email => ({ email }) },
  "forgot-password": { limit: AUTH_LIMITS.forgotPassword.ip.limit, body: email => ({ email }) },
  "verify-email": { limit: AUTH_LIMITS.verifyEmail.ip.limit, body: email => ({ email, otp: "000000" }) },
  login: { limit: AUTH_LIMITS.login.ip.limit, body: email => ({ email, password: "x" }) },
  "reset-password": { limit: AUTH_LIMITS.resetPassword.ip.limit, body: tokenBody },
};

for (const [route, { limit, body }] of Object.entries(routes)) {
  test(`${route}: a request the per-IP limit refuses touches no other counter, so a noisy IP cannot use up an address's allowance`, async t => {
    const s = await startServer(t, { trustProxy: 1 });
    for (let i = 0; i < limit; i++) await s.post(route, body(s.unique()), "10.1.1.1");
    s.hits.length = 0;
    const victim = s.unique();
    assertLimited(await s.post(route, body(victim), "10.1.1.1"));
    assert.deepEqual(s.hits, [`${route}:ip:10.1.1.1`], "only the per-IP counter was hit");
    assert.notEqual((await s.post(route, body(victim), "10.1.1.2")).status, 429, "the same address from another IP is untouched");
  });
}

test("a stranger who keeps guessing an account cannot lock its owner out from another IP: login", async t => {
  const s = await startServer(t, { trustProxy: 1, users: [{ email: "ann@test.invalid", passwordHash: "hash:Right123!" }] });
  const login = (password, ip) => s.post("login", { email: "ann@test.invalid", password }, ip);
  for (let i = 0; i < AUTH_LIMITS.login.account.limit; i++) assert.equal((await login("Wrong123!", "10.9.9.9")).status, 401);
  assertLimited(await login("Wrong123!", "10.9.9.9"));
  assert.equal((await login("Right123!", "10.0.0.1")).status, 200, "the owner signs in from their own address");
});

test("a stranger cannot lock an address out of the other forms from another IP: verify-email, reset-password, register", async t => {
  const s = await startServer(t, { trustProxy: 1, users: [{ email: "ann@test.invalid" }] });
  const verify = ip => s.post("verify-email", { email: "ghost@test.invalid", otp: "000000" }, ip);
  for (let i = 0; i < AUTH_LIMITS.verifyEmail.email.limit; i++) assert.equal((await verify("10.9.9.9")).status, 400);
  assertLimited(await verify("10.9.9.9"));
  assert.equal((await verify("10.0.0.1")).status, 400, "verify: another IP is still answered");

  const reset = ip => s.post("reset-password", tokenBody("ann@test.invalid"), ip);
  for (let i = 0; i < AUTH_LIMITS.resetPassword.email.limit; i++) assert.equal((await reset("10.9.9.9")).status, 400);
  assertLimited(await reset("10.9.9.9"));
  assert.equal((await reset("10.0.0.1")).status, 400, "reset: another IP is still answered");

  const register = ip => s.post("register", registerBody("ann@test.invalid"), ip);
  for (let i = 0; i < AUTH_LIMITS.register.email.limit; i++) assert.equal((await register("10.9.9.9")).status, 409);
  assertLimited(await register("10.9.9.9"));
  assert.equal((await register("10.0.0.1")).status, 409, "register: another IP is still answered");
});

test("guessing spread over many IPs still runs into the loose account-wide limits", async t => {
  const s = await startServer(t, { trustProxy: 1, users: [{ email: "ann@test.invalid", passwordHash: "hash:Right123!" }] });
  const attacks = [
    { route: "login", wide: AUTH_LIMITS.login.accountWide.limit, per: AUTH_LIMITS.login.account.limit, body: { email: "ann@test.invalid", password: "Wrong123!" }, answer: 401 },
    { route: "verify-email", wide: AUTH_LIMITS.verifyEmail.emailWide.limit, per: AUTH_LIMITS.verifyEmail.email.limit, body: { email: "ghost@test.invalid", otp: "000000" }, answer: 400 },
  ];
  for (const { route, wide, per, body, answer } of attacks) {
    for (let i = 0; i < wide; i++) assert.equal((await s.post(route, body, `10.2.${Math.floor(i / per)}.1`)).status, answer, `${route} request ${i + 1}`);
    assertLimited(await s.post(route, body, "10.3.0.1"), { max: 900 });
  }
});

test("reset-password: 30 per 15 minutes per IP, however the addresses are spelled, so it cannot be used to burn the server's CPU", async t => {
  const s = await startServer(t);
  for (let i = 0; i < AUTH_LIMITS.resetPassword.ip.limit; i++) assert.equal((await s.post("reset-password", tokenBody(s.unique()))).status, 400, `request ${i + 1}`);
  assertLimited(await s.post("reset-password", tokenBody(s.unique())), { min: 800, max: 900 });
});

test("login: an unknown account costs as much work as a wrong password, and gets the same answer", async () => {
  const compared = [];
  const hasher = { hashPassword: async p => `hash:${p}`, comparePassword: async (p, h) => { compared.push(h); return h === `hash:${p}`; } };
  const repo = memoryUserRepo([{ email: "ann@test.invalid", passwordHash: "hash:Right123!" }]);
  const login = new LoginUseCase(repo, hasher, new JwtTokenService("test-jwt-secret", "15m", "7d"));
  const unknown = await login.execute({ email: "nobody@test.invalid", password: "x" }).catch(e => e);
  const wrong = await login.execute({ email: "ann@test.invalid", password: "x" }).catch(e => e);
  assert.equal(compared.length, 2, "a password check ran in both cases");
  assert.notEqual(compared[0], "hash:Right123!", "the unknown account was checked against a stand-in hash");
  assert.equal(unknown.statusCode, wrong.statusCode);
  assert.equal(unknown.message, wrong.message);
  await login.execute({ email: "nobody@test.invalid", password: "y" }).catch(() => {});
  assert.equal(compared[2], compared[0], "the stand-in hash is made once");
});

test("an e-mail that is not text cannot dodge or break the limits", async t => {
  const s = await startServer(t);
  for (const email of [{ $ne: "" }, ["a@b.invalid"], 42, null, "", "   "]) {
    const res = await s.post("resend-otp", { email });
    assert.ok([200, 400].includes(res.status), `${JSON.stringify(email)} answered ${res.status}`);
  }
  // The per-IP limit still counts them.
  for (let i = 0; i < AUTH_LIMITS.resendOtp.ip.limit; i++) await s.post("resend-otp", { email: { $ne: i } });
  assert.equal((await s.post("resend-otp", { email: "ok@test.invalid" })).status, 429);
});

test("per-IP limits count the socket address, and trust X-Forwarded-For only when TRUST_PROXY says to", async t => {
  const direct = await startServer(t);
  for (let i = 0; i < 10; i++) assert.equal((await direct.post("register", registerBody(direct.unique()), `10.0.0.${i}`)).status, 201);
  assertLimited(await direct.post("register", registerBody(direct.unique()), "10.0.0.99"), { min: 3500 });

  const proxied = await startServer(t, { trustProxy: 1 });
  for (let i = 0; i < 10; i++) assert.equal((await proxied.post("register", registerBody(proxied.unique()), "10.0.0.1")).status, 201);
  assertLimited(await proxied.post("register", registerBody(proxied.unique()), "10.0.0.1"), { min: 3500 });
  assert.equal((await proxied.post("register", registerBody(proxied.unique()), "10.0.0.2")).status, 201, "a different client address has its own count");
});

test("TRUST_PROXY accepts a number of hops, true or false, and refuses anything else", () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(""), false);
  assert.equal(parseTrustProxy("false"), false);
  assert.equal(parseTrustProxy(" TRUE "), true);
  assert.equal(parseTrustProxy("1"), 1);
  assert.equal(parseTrustProxy("2"), 2);
  for (const bad of ["yes", "-1", "1.5", "loopback", "1,2"]) assert.throws(() => parseTrustProxy(bad), /TRUST_PROXY/, bad);
});

test("the API document lists the 429 answer on every limited route", async () => {
  const { default: swaggerJsdoc } = await import("swagger-jsdoc");
  const spec = swaggerJsdoc({
    failOnErrors: true,
    definition: { openapi: "3.0.0", info: { title: "ArchTime API", version: "test" } },
    apis: ["./src/presentation/routes/auth.routes.ts"],
  });
  for (const path of ["register", "verify-email", "resend-otp", "login", "forgot-password", "reset-password"]) {
    const answer = spec.paths[`/api/auth/${path}`]?.post?.responses?.[429];
    assert.ok(answer, `${path} documents 429`);
    assert.ok(answer.headers?.["Retry-After"], `${path} documents Retry-After`);
  }
  assert.equal(spec.paths["/api/auth/resend-otp"].post.responses[404], undefined, "resend no longer answers 404 for unknown addresses");
});
