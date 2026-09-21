import { app } from "@/app.js";
import { env } from "@/config/env.js";
import { connectDb } from "@/config/db.js";

async function start(): Promise<void> {
  await connectDb();
  app.listen(env.port, () => {
    console.log(`ArchTime BE listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
