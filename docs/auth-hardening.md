# Sign-in hardening: e-mail codes and rate limits

Feedback from the team: "ko co rate limit cho email" and "otp xac thuc yeu". This note says what was wrong, what the
backend does now, every limit with the reasoning behind its number, and what is still not covered.

## What was wrong

- The 6-digit verification code came from `Math.random()`, which is predictable.
- The code was stored in plain text, so anyone who could read the database could use every pending code.
- Checking a code had no attempt limit: all 1,000,000 codes could be tried within the 10 minutes a code lives
  (at 1,000 requests a second a single code fell with about 60 % probability, and at 2,000 a second with certainty).
- Nothing limited how often an e-mail could be requested (register, resend, forgot password) or how often a password
  could be tried (login). Only the AI chat had a limit.
- "Resend code" told strangers whether an address has an account and whether it was verified.

## Verification codes (OTP)

| Property | Now |
| --- | --- |
| Generation | `crypto.randomInt(0, 1_000_000)`, zero padded to 6 digits (the form still expects `^\d{6}$`) |
| Storage | `codeHash` = HMAC-SHA256 (hex) of `"<normalised e-mail>:<code>"`, keyed by `OTP_PEPPER` (falls back to `JWT_SECRET`). The plain code is only in the e-mail. |
| Comparison | `crypto.timingSafeEqual` on equal-length buffers; a stored value of any other length simply does not match |
| Expiry | 10 minutes. Checked **before** the code is compared, and an expired code costs no attempt |
| Wrong guesses | At most **5 per code**. The guess is paid for first, in one atomic `findOneAndUpdate` (`$inc` with `attempts < 5` in the filter), so parallel requests cannot make a sixth comparison |
| After 5 wrong guesses | HTTP 429, code `OTP_LOCKED`, "Too many wrong codes. Request a new code to continue." The locked code stays in the database until it expires or a new code replaces it, so even the *correct* code is refused. A new code starts with 5 fresh tries |
| Input that is not 6 digits | 400 `OTP_INVALID`, no attempt used (it is not a guess) |

Because the hash includes the e-mail, copying a hash to another account is useless. Changing `OTP_PEPPER` (or
`JWT_SECRET` when no pepper is set) makes every pending code stop working; people just ask for a new one.

Documents written before this change have a plain `code` field and no `codeHash`. They are read as having an empty hash,
which never matches, and they expire by themselves within 10 minutes.

`OTP_LOCKED` has no `Retry-After`: there is nothing to wait for, the person needs a new code. It is the only 429 that
is not a time-based rate limit.

### Resend does not reveal accounts

`POST /api/auth/resend-otp` answers the same way (status, shape, wording, a plausible `expiresAt`) for an unknown
address, an already verified address and an account waiting for its code. Only the last one gets mail. The mail is
sent without waiting for the mail server, so a real account does not answer measurably slower than an unknown address.
A delivery failure is logged, and the person can ask again after the cooldown. The rate limits below count by the
e-mail *text*, whether or not an account exists, so they cannot be used to find accounts either.

## Rate limiting

### How it works

- Port: `IRateLimiter.hit(key, limit, windowSeconds) -> { allowed, retryAfterSeconds, remaining }` (plus `refund` and
  `reset`, used by the login policy).
- `MongoRateLimiter` keeps a fixed-window counter in the `ratelimits` collection (unique `key`, `count`, `resetAt`, TTL
  index on `resetAt`). A hit is **one** `findOneAndUpdate` with an aggregation-pipeline update: start a new window when
  the stored one is over, otherwise add one, upsert when new. It is atomic per document, so concurrent requests, even on
  several server instances, cannot slip past the limit (a test fires 50 first-hits at a new key and gets exactly the
  limit). A request that is refused is still counted, but the window does not move, so hammering does not extend a lock.
- `InMemoryRateLimiter` is the same thing in one process, for tests only.
- `createRateLimit(limiter, policies)` (`presentation/middlewares/rateLimit.ts`) is the Express middleware. Keys are
  trimmed and lower-cased (so `Ann@X.com` and ` ann@x.com ` share a counter), cut to 254 characters, and a value that is
  not text is ignored. The client IP is `req.ip`. Policies run in the order given and stop at the first refusal, so the
  cheap per-IP check comes first.
- Refusals are HTTP 429 with a `Retry-After` header and
  `{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many requests. Try again in N seconds.", "retryAfterSeconds": N } }`.
- All numbers live in one module: `BE/src/presentation/middlewares/authRateLimits.ts` (`AUTH_LIMITS`).
- If the database is unreachable the limiter errors and the request fails with 500 (it fails closed). Sign-in needs the
  same database anyway.

### The limits

| Route | Limits (checked in this order) | Counts |
| --- | --- | --- |
| `POST /auth/register` | 10 / hour per IP, 3 / hour per e-mail **and IP** | every request |
| `POST /auth/resend-otp` | 20 / hour per IP, **1 / 60 s** per e-mail, 5 / hour per e-mail | every request |
| `POST /auth/forgot-password` | 20 / hour per IP, **1 / 60 s** per e-mail, 5 / hour per e-mail | every request |
| `POST /auth/verify-email` | 60 / 15 min per IP, 10 / 15 min per e-mail **and IP**, 100 / 15 min per e-mail (all IPs) | every request (on top of 5 wrong tries per code) |
| `POST /auth/login` | 100 / 15 min per IP, 10 / 15 min per account (e-mail or username) **and IP**, 100 / 15 min per account (all IPs) | **failed attempts only** |
| `POST /auth/reset-password` | 30 / 15 min per IP, 10 / 15 min per e-mail **and IP** | every request |

**A stranger must not be able to lock the owner out.** The tight per-account counters are keyed on the account *and* the
client IP, so someone who only knows an address or user name can use up only their own allowance: the owner, on another
IP, is not affected. The account-wide counters (verify-email 100, login 100 per 15 minutes) are loose backstops against
guessing spread over many IPs; an attacker who really controls many IPs can still hit them and lock an account for up to
15 minutes, which is the price of any account-wide cap (about 9,600 guesses a day per account is the cost of not having
one). The mail-flood limits (resend-otp, forgot-password) stay per address, because their job is to protect the owner's
inbox. They cannot be used to cut the owner off, since every code or reset mail they let through goes to the owner, who
simply uses the newest one; the cost is that a stranger can use up the five hourly slots, so the owner may have to wait
for the next hour to ask again. Likewise 5 wrong guesses lock one code (a stranger can burn them), and the owner then
asks for a new code. Reset-password has no per-address cap: the code has 128 random bits, and the limits there exist only
because each request costs a bcrypt hash before the code is checked.

The 60-second cooldown is checked before the hourly count, so a request refused for the cooldown does not use up an
hourly slot, and its `retryAfterSeconds` is exactly when the next request will be accepted.

`forgot-password` keeps its enumeration-safe 200 answer for unknown addresses: the limiter keys on the e-mail text only.
It already had a silent one-minute cooldown in `requestPasswordReset`; it is now an explicit 429 that the page can show.

**Login counts failures only.** A slot is taken before the password is checked (so 30 parallel guesses get exactly 10
answers and 20 refusals), and handed back afterwards unless the answer was 401:

- success (or 403, which means the password was right but the account is unverified or suspended): the account counter is
  cleared and the IP slot is refunded;
- 400 (missing field) or 5xx: the slot is refunded, and nothing is cleared (a 400 cannot be used to wipe the counter);
- 401: the failure stays counted.

A locked account counter (for that IP, or account-wide) refuses even the correct password until the window ends.

An unknown account costs as much work as a wrong password: `LoginUseCase` checks the password against a stand-in bcrypt
hash first, so the response time does not tell whether the account exists.

### The arithmetic

Verification code. One code has 10^6 possibilities and allows 5 guesses, so one code is guessed with probability
5 / 10^6 = 0.0005 %. A new code for one address can be had 5 times an hour by resend plus once by register, so at most
about 6 codes and 30 guesses an hour per address (the verify limits allow 40 an hour from one IP and 400 an hour across
many IPs, so the code limit is the tighter one): about 0.003 % per hour, about 0.07 % per day of non-stop effort against one address, and it does not
get faster with more IPs because the limits are per address. Before: a better-than-even chance against every code.

Passwords. From one IP, 10 failures per 15 minutes per account is at most 40 an hour, 960 a day per account name. Spread
over many IPs the account-wide cap allows 100 per 15 minutes, 400 an hour, 9,600 a day per account name, against any
password list. Per IP, 100 failures per 15 minutes is at most 400 an hour across all accounts, so credential stuffing
from one address is slowed from unlimited to under 10,000 a day. bcrypt at cost 12 also costs the server about a quarter
of a second per attempt, so removing the unlimited stream is a protection against CPU exhaustion too.

Mail bombing. One person can be sent at most 5 resend mails an hour, 5 reset mails an hour and 1 registration mail an
hour by ArchTime, whatever the number of attacking IPs. One IP can cause at most 20 + 20 + 10 = 50 mails an hour.

### Known gaps and trade-offs

- **Reverse proxies.** Behind a proxy that is not trusted, every visitor has the proxy's address, so the per-IP limits
  are shared by everyone. That is why they are generous. Set `TRUST_PROXY` to the number of proxy hops (`1` for one) so
  `req.ip` is the real client; do not use `true` unless the server is only reachable through the proxy, because a client
  could then fake `X-Forwarded-For` and dodge the per-IP limits. The default is off.
- IPv6: a client with a whole /64 can change its address freely, so the per-IP limits do little against it. The
  per-account limits are what protect an account.
- A fixed window allows up to twice the limit around a window boundary (the end of one window and the start of the next).
- Login limits are per identifier as typed: an account can be tried with its e-mail and, separately, its username, so
  the effective number is up to twice the table's.
- Registering with an address that already exists still answers 409 (the page needs it), so register can be used to
  test whether an address has an account, at most 3 times an hour per address and 10 an hour per IP. Verifying also
  answers differently for an address that has a pending code and one that has none.
- Servers whose clocks differ by seconds blur the edge of a window; they do not change the limits.
- GitHub login is not covered here.

## Frontend

`authRequest` (`FE/src/auth/requests.ts`) throws an `AuthRequestError` with `status`, `code` and, for a 429,
`retryAfterSeconds` (from the body, else the `Retry-After` header). Login, sign-up, forgot and reset password show
"Too many attempts. Try again in 2 minutes." inline (`FE/src/auth/rate-limit.ts` formats the wait). The verification
page starts the resend countdown from the server's `retryAfterSeconds` instead of a fixed 60 seconds, shows the
`OTP_LOCKED` message and empties the code box.

## Operations

- `OTP_PEPPER`, `TRUST_PROXY`: see `BE/.env.example`.
- To release a locked account by hand: delete its counter, for example in `mongosh`,
  `db.ratelimits.deleteMany({ key: /^login:(account|wide):ann@example.com/ })`. Keys are `<policy name>:<normalised value>`,
  for example `login:ip:203.0.113.7`, `login:account:ann@example.com|203.0.113.7`, `login:wide:ann@example.com`,
  `resend-otp:cooldown:ann@example.com`.
- Expired counters are removed by MongoDB's TTL monitor (about a minute after `resetAt`); an expired counter that is
  still there is ignored.
- Tests: `BE/tests/rate-limiter.test.mjs` (both limiters, including real MongoDB), `auth-rate-limit-http.test.mjs`
  (every route through real HTTP), `otp-hardening.test.mjs`, and on the frontend `FE/tests/rate-limit.test.mjs` and
  `auth-requests.test.mjs`. The MongoDB tests use a throwaway database and skip when none is reachable.
