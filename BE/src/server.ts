import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { MiningService } from "./infrastructure/services/MiningService.js";
import { LlmModelRegistry } from "./infrastructure/llm/registry.js";
import { MongoUserRepository } from "./infrastructure/repositories/MongoUserRepository.js";
import { MongoProjectRepository } from "./infrastructure/repositories/MongoProjectRepository.js";
import { billingGatewayReport, billingUseCases, repositoryWatcher } from "./container.js";
import { watchIntervalMinutes } from "./infrastructure/services/RepositoryWatcher.js";

async function start(): Promise<void> {
  await connectDb();
  const migrated = await MongoUserRepository.migrateLegacyRoles();
  if (migrated) console.log(`Moved ${migrated} account(s) from the retired project-maintainer system role to user`);
  const encrypted = await MongoProjectRepository.encryptLegacyTokens();
  if (encrypted) console.log(`Encrypted the repository token of ${encrypted} workspace(s) saved in plain text`);
  await MiningService.recoverInterruptedJobs();
  await LlmModelRegistry.seedFromEnv();
  const watchMinutes = watchIntervalMinutes();
  if (repositoryWatcher.start()) console.log(`Automatic check of confirmed workspaces every ${watchMinutes} min (WATCH_INTERVAL_MINUTES)`);
  else console.log("Automatic check of confirmed workspaces is off (WATCH_INTERVAL_MINUTES=0)");
  if (env.billingReconcileMinutes > 0) {
    // FE-17: pending payments the gateway never notified us about are asked about, unpaid ones expire, interrupted ones are applied.
    setInterval(() => {
      billingUseCases.reconcile().catch(error => console.warn("[billing] reconciliation failed:", error instanceof Error ? error.message : error));
    }, env.billingReconcileMinutes * 60_000).unref();
    console.log(`Payment reconciliation every ${env.billingReconcileMinutes} min (BILLING_RECONCILE_MINUTES)`);
  }
  for (const line of billingGatewayReport()) console.log(line);
  const url = `http://localhost:${env.port}`;
  app.listen(env.port, () => {
    console.log(`ArchTime BE listening on ${url}`);
    console.log(`Swagger UI: ${url}/api-docs`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
