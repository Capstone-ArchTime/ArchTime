import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "../../shared/utils/normalize.js";

/** Makes, hashes and checks the six-digit codes e-mailed to confirm an address. */
export class OtpCodeService {
  /** `secret` is a server-side secret (JWT_SECRET, or OTP_PEPPER when set): without it a leaked database cannot be turned back into codes. */
  constructor(private readonly secret: string) {
    if (!secret) throw new Error("OtpCodeService needs a non-empty secret.");
  }

  /** Six digits, zero padded, from the operating system's cryptographic random source (never Math.random). */
  generate(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  /** HMAC-SHA256 (hex) of "<normalised email>:<code>". Tying the e-mail in means a copied hash is useless on another account. */
  hash(email: string, code: string): string {
    return createHmac("sha256", this.secret).update(`${normalizeEmail(email)}:${code}`).digest("hex");
  }

  /** Constant-time comparison of the submitted code with the stored hash. A missing or malformed stored hash never matches. */
  matches(email: string, code: string, storedHash: string): boolean {
    const expected = Buffer.from(this.hash(email, code));
    const stored = Buffer.from(typeof storedHash === "string" ? storedHash : "");
    return stored.length === expected.length && timingSafeEqual(stored, expected);
  }
}
