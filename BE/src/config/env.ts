import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * TRUST_PROXY: how many reverse proxies sit in front of the server ("1" for one), or "true"/"false". Express uses it to
 * read the real client address (req.ip) from X-Forwarded-For, which the per-IP rate limits count by. Unset means none.
 */
export function parseTrustProxy(raw: string | undefined): number | boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  throw new Error(`TRUST_PROXY must be a number of proxy hops, "true" or "false" (got "${raw}").`);
}

export const env = {
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  githubCallbackUrl: process.env.GITHUB_CALLBACK_URL ?? "http://localhost:4000/api/auth/github/callback",
  port: Number(required("PORT", "4000")),
  mongodbUri: required("MONGODB_URI", "mongodb://localhost:27017/archtime"),
  corsOrigin: required("CORS_ORIGIN", "http://localhost:5173"),

  // JWT
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: required("JWT_EXPIRES_IN", "60m"),
  jwtRefreshExpiresIn: required("JWT_REFRESH_EXPIRES_IN", "7d"),
  // Keys the stored hashes of e-mailed verification codes. Falls back to JWT_SECRET; set it to rotate one without the other.
  otpPepper: process.env.OTP_PEPPER || required("JWT_SECRET"),

  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  // Email (Gmail SMTP)
  smtpHost: required("SMTP_HOST", "smtp.gmail.com"),
  smtpPort: Number(required("SMTP_PORT", "587")),
  smtpUser: required("SMTP_USER"),
  smtpPass: required("SMTP_PASS"),
  smtpFrom: required("SMTP_FROM"),
};
