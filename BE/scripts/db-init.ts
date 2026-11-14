/**
 * Database script (Report 4 §2, §1.6.3): creates every collection of the data model and builds its indexes.
 *
 *   npm run db:init     safe to re-run: existing collections and data are kept, missing indexes are added
 *
 * The collections are the Mongoose models in src/infrastructure/database/models, so this script and the code can never
 * describe different databases. Demo data comes from `npm run seed:demo` (accounts, organizations, workspaces).
 */
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/infrastructure/database/models");

export async function initDatabase(log: (line: string) => void = console.log): Promise<number> {
  for (const file of readdirSync(MODELS).filter(f => /Model\.ts$/.test(f)).sort()) {
    await import(pathToFileURL(path.join(MODELS, file)).href);
  }
  const names = mongoose.modelNames().sort();
  for (const name of names) {
    const model = mongoose.model(name);
    await model.createCollection();
    await model.syncIndexes();
    const indexes = await model.listIndexes();
    log(`${model.collection.collectionName.padEnd(28)} ${indexes.length} index(es)`);
  }
  return names.length;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  (async () => {
    await connectDb();
    try {
      const n = await initDatabase();
      console.log(`Ready: ${n} collections.`);
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
