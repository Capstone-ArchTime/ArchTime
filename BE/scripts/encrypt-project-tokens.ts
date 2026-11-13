/**
 * Encrypts the repository tokens that workspaces saved in plain text before RF-17 (BM04), and removes the plain text.
 *
 *   npm run migrate:project-tokens
 *
 * The server does the same at start-up; this script is for a database the server has not started on yet. Safe to
 * re-run: an encrypted token is left alone. The key is LLM_SECRET_KEY, or JWT_SECRET when that is not set, as for
 * organization credentials; changing it later makes the tokens unreadable, so they would have to be entered again.
 */
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";
import { MongoProjectRepository } from "../src/infrastructure/repositories/MongoProjectRepository.js";

async function main() {
  await connectDb();
  try {
    const encrypted = await MongoProjectRepository.encryptLegacyTokens();
    console.log(encrypted ? `Encrypted the repository token of ${encrypted} workspace(s).` : "No plain-text repository token left.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
