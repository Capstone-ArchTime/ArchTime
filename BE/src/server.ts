import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDb } from "./config/db.js";
import open from "open";
import { MiningService } from "./infrastructure/services/MiningService.js";

async function start(): Promise<void> {
  await connectDb();
  await MiningService.recoverInterruptedJobs();
  const url = `http://localhost:${env.port}`;
  app.listen(env.port, async () => {
    console.log(`ArchTime BE listening on ${url}`);

    // Automatically open Swagger UI in default browser
    try {
      await open(`${url}/api-docs`);
    } catch (err) {
      console.error("Failed to open browser:", err);
    }
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
