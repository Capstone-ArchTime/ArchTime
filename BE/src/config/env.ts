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
};
