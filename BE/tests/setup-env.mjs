// Gives every test the same environment on every machine, so a result never depends on whose .env is on disk.
// Loaded before the tests by the "test" script (node --import ./tests/setup-env.mjs); test files that import code reading
// config/env.ts also import it first, so they still run when started on their own.
import path from "node:path";
import { fileURLToPath } from "node:url";

// dotenv would otherwise read BE/.env: its AI keys, its database address and its mail account. Point it at nothing.
process.env.DOTENV_CONFIG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "no-dotenv-for-tests");

// What config/env.ts insists on, with harmless values (the .invalid domain never resolves, so nothing can be sent).
Object.assign(process.env, {
  JWT_SECRET: "test-jwt-secret",
  SMTP_HOST: "smtp.test.invalid",
  SMTP_PORT: "587",
  SMTP_USER: "tests@test.invalid",
  SMTP_PASS: "test-password",
  SMTP_FROM: "ArchTime Tests <tests@test.invalid>",
  // Tests never connect, but if one ever does it must not reach the shared database.
  MONGODB_URI: "mongodb://127.0.0.1:27017/archtime-test",
  CORS_ORIGIN: "http://localhost:5173",
});

// No AI model is configured: a test must say so itself if it needs one, never pick up a developer's real key.
for (const name of [
  "LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY", "LLM_SECRET_KEY", "LLM_TIMEOUT_MS", "LLM_EFFORT", "LLM_JSON_MODE",
  "LLM_MAX_REFINE_FILES", "LLM_MAX_MOVE_RATIO", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
]) delete process.env[name];
