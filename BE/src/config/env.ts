import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(required("PORT", "4000")),
  mongodbUri: required("MONGODB_URI", "mongodb://localhost:27017/archtime"),
  corsOrigin: required("CORS_ORIGIN", "http://localhost:5173"),

  // JWT
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: required("JWT_EXPIRES_IN", "15m"),
  jwtRefreshExpiresIn: required("JWT_REFRESH_EXPIRES_IN", "7d"),

  // Email (Gmail SMTP)
  smtpHost: required("SMTP_HOST", "smtp.gmail.com"),
  smtpPort: Number(required("SMTP_PORT", "587")),
  smtpUser: required("SMTP_USER"),
  smtpPass: required("SMTP_PASS"),
  smtpFrom: required("SMTP_FROM"),
};
