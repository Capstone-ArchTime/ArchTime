import type { Request, RequestHandler } from "express";
import type { IRateLimiter } from "../../domain/interfaces/IRateLimiter.js";
import { normalizeIp, normalizeLimitKey } from "../../shared/utils/normalize.js";
import { createRateLimit, type RateLimitPolicy } from "./rateLimit.js";

const MINUTE = 60;
const FIFTEEN_MINUTES = 15 * MINUTE;
const HOUR = 60 * MINUTE;

/**
 * Every limit on the sign-in and e-mail-code routes, in one place (docs/auth-hardening.md explains the arithmetic).
 *
 * The per-IP numbers are deliberately generous: a whole school or office can share one address, and behind a reverse
 * proxy that is not trusted (TRUST_PROXY unset) every visitor looks like the proxy's address. The per-account numbers
 * are the tight ones.
 *
 * A counter must never let a stranger who only knows someone's address or user name lock the real owner out. So the
 * tight "per account" counters (`email`, `account`) are keyed on account AND IP: one noisy address can only use up its
 * own allowance. The `*Wide` counters count an account across all IPs; they are deliberately loose and only stop a
 * spread-out guessing campaign. The mail-flood limits (resend-otp, forgot-password) are per address on purpose, since
 * their job is to protect the owner's inbox; the mail still goes to the owner, so a stranger asking for codes only
 * delivers fresh ones to the owner.
 */
export const AUTH_LIMITS = {
  register: {
    ip: { limit: 10, windowSeconds: HOUR },
    /** Per address and IP. Register sends no mail for an existing address, so there is nothing to protect per address alone. */
    email: { limit: 3, windowSeconds: HOUR },
  },
  resendOtp: {
    ip: { limit: 20, windowSeconds: HOUR },
    /** One code per minute per e-mail: the answer's retryAfterSeconds tells the page exactly when it may ask again. */
    cooldown: { limit: 1, windowSeconds: MINUTE },
    email: { limit: 5, windowSeconds: HOUR },
  },
  forgotPassword: {
    ip: { limit: 20, windowSeconds: HOUR },
    cooldown: { limit: 1, windowSeconds: MINUTE },
    email: { limit: 5, windowSeconds: HOUR },
  },
  /** Requests to verify, on top of the 5 wrong guesses each emailed code allows. */
  verifyEmail: {
    ip: { limit: 60, windowSeconds: FIFTEEN_MINUTES },
    /** Per address and IP. */
    email: { limit: 10, windowSeconds: FIFTEEN_MINUTES },
    /** Per address across all IPs. Each code already dies after 5 wrong guesses, so this is only a backstop. */
    emailWide: { limit: 100, windowSeconds: FIFTEEN_MINUTES },
  },
  /** Failed sign-ins only: a successful one clears the account counters. */
  login: {
    ip: { limit: 100, windowSeconds: FIFTEEN_MINUTES },
    /** Per account (e-mail or user name) and IP. */
    account: { limit: 10, windowSeconds: FIFTEEN_MINUTES },
    /** Per account across all IPs: stops guessing spread over many addresses, at 100 a window (about 9,600 a day). */
    accountWide: { limit: 100, windowSeconds: FIFTEEN_MINUTES },
  },
  /**
   * The reset code has 128 random bits, so guessing it is hopeless and no per-address cap is needed for safety. The
   * limits are there because every request costs a bcrypt hash (about 250 ms of CPU) before the code is checked.
   */
  resetPassword: {
    ip: { limit: 30, windowSeconds: FIFTEEN_MINUTES },
    /** Per address and IP. */
    email: { limit: 10, windowSeconds: FIFTEEN_MINUTES },
  },
} as const;

// What a request is counted by. The e-mail is only ever read from the body as text: whether such an account exists
// never changes a count, so the limits cannot be used to find out.
const ip = (req: Request) => normalizeIp(req.ip);
const email = (req: Request) => (req.body as { email?: unknown } | undefined)?.email as string | undefined;

/** The address plus the client IP: a counter only that client can use up. Skipped (undefined) when there is no usable address. */
const emailAndIp = (req: Request) => {
  const who = normalizeLimitKey(email(req));
  return who ? `${who}|${ip(req)}` : undefined;
};

const by = (name: string, limits: { limit: number; windowSeconds: number }, key: RateLimitPolicy["key"], extra: Partial<RateLimitPolicy> = {}): RateLimitPolicy =>
  ({ name, ...limits, key, ...extra });

/** One middleware per route. The cheap per-IP check always comes first. */
export function createAuthRateLimits(limiter: IRateLimiter): Record<"register" | "resendOtp" | "forgotPassword" | "verifyEmail" | "login" | "resetPassword", RequestHandler> {
  const L = AUTH_LIMITS;
  return {
    register: createRateLimit(limiter, [by("register:ip", L.register.ip, ip), by("register:email", L.register.email, emailAndIp)]),
    resendOtp: createRateLimit(limiter, [
      by("resend-otp:ip", L.resendOtp.ip, ip),
      by("resend-otp:cooldown", L.resendOtp.cooldown, email),
      by("resend-otp:email", L.resendOtp.email, email),
    ]),
    forgotPassword: createRateLimit(limiter, [
      by("forgot-password:ip", L.forgotPassword.ip, ip),
      by("forgot-password:cooldown", L.forgotPassword.cooldown, email),
      by("forgot-password:email", L.forgotPassword.email, email),
    ]),
    verifyEmail: createRateLimit(limiter, [
      by("verify-email:ip", L.verifyEmail.ip, ip),
      by("verify-email:email", L.verifyEmail.email, emailAndIp),
      by("verify-email:wide", L.verifyEmail.emailWide, email),
    ]),
    login: createRateLimit(limiter, [
      by("login:ip", L.login.ip, ip),
      by("login:account", L.login.account, emailAndIp, { clearOnSuccess: true }),
      by("login:wide", L.login.accountWide, email, { clearOnSuccess: true }),
    ], { failuresOnly: true }),
    resetPassword: createRateLimit(limiter, [
      by("reset-password:ip", L.resetPassword.ip, ip),
      by("reset-password:email", L.resetPassword.email, emailAndIp),
    ]),
  };
}
