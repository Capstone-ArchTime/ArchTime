import { execSync } from "node:child_process";
import mongoose from "mongoose";
import { env } from "../../../config/env.js";
import { LlmModelModel } from "../../../infrastructure/database/models/LlmModelModel.js";
import { getLlmRuntime } from "../../../infrastructure/llm/runtime.js";

export interface ServiceStatusItem {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  details?: Record<string, unknown>;
  latencyMs?: number;
}

export class GetAdminServicesStatusUseCase {
  async execute(): Promise<Record<string, unknown>> {
    const services: Record<string, ServiceStatusItem> = {};

    // 1. Database (MongoDB)
    const dbStart = Date.now();
    try {
      const isConnected = mongoose.connection.readyState === 1;
      if (isConnected && mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
        const latencyMs = Date.now() - dbStart;
        services.database = {
          name: "MongoDB",
          status: "healthy",
          latencyMs,
          details: {
            host: mongoose.connection.host,
            name: mongoose.connection.name,
            readyState: mongoose.connection.readyState,
          },
        };
      } else {
        services.database = {
          name: "MongoDB",
          status: "unhealthy",
          details: { readyState: mongoose.connection.readyState },
        };
      }
    } catch (err: any) {
      services.database = {
        name: "MongoDB",
        status: "unhealthy",
        details: { error: err.message },
      };
    }

    // 2. Git CLI
    try {
      const gitVersion = execSync("git --version", { timeout: 3000, encoding: "utf8" }).trim();
      services.git = {
        name: "Git CLI",
        status: "healthy",
        details: { version: gitVersion },
      };
    } catch (err: any) {
      services.git = {
        name: "Git CLI",
        status: "degraded",
        details: { error: "Git CLI not detected or timed out", message: err.message },
      };
    }

    // 3. Email (SMTP)
    const hasSmtp = Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass);
    services.email = {
      name: "SMTP Mailer",
      status: hasSmtp ? "healthy" : "degraded",
      details: {
        configured: hasSmtp,
        host: env.smtpHost,
        port: env.smtpPort,
      },
    };

    // 4. AI models: the registry's last health checks (see /api/admin/llm-models/:id/test), else the server's configured model.
    try {
      const models = await LlmModelModel.find({ enabled: true }, { displayName: 1, provider: 1, isDefault: 1, health: 1 }).lean();
      const env = getLlmRuntime().capability;
      const down = models.filter(m => m.health?.status === "down");
      const degraded = models.filter(m => m.health?.status === "degraded");
      const defaultModel = models.find(m => m.isDefault);
      const available = models.length > 0 || env.enabled;
      services.aiProviders = {
        name: "AI Models",
        status: !available ? "degraded" : defaultModel?.health?.status === "down" ? "unhealthy" : down.length || degraded.length ? "degraded" : "healthy",
        ...(defaultModel?.health?.latencyMs !== undefined ? { latencyMs: defaultModel.health.latencyMs } : {}),
        details: {
          available,
          enabledModels: models.length,
          configuredProviders: [...new Set(models.map(m => m.provider))],
          defaultModel: defaultModel?.displayName ?? (env.enabled ? `${env.model} (server config)` : null),
          down: down.map(m => m.displayName),
          degraded: degraded.map(m => m.displayName),
          unchecked: models.filter(m => !m.health || m.health.status === "unknown").length,
        },
      };
    } catch (err: any) {
      services.aiProviders = { name: "AI Models", status: "degraded", details: { error: err.message } };
    }

    // Overall status
    const allHealthy = Object.values(services).every((s) => s.status === "healthy");
    const anyUnhealthy = Object.values(services).some((s) => s.status === "unhealthy");
    const overallStatus = anyUnhealthy ? "unhealthy" : allHealthy ? "healthy" : "degraded";

    return {
      status: overallStatus,
      services,
      checkedAt: new Date(),
    };
  }
}
