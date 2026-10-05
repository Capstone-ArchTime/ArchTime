import { execSync } from "node:child_process";
import mongoose from "mongoose";
import { env } from "../../../config/env.js";

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

    // 4. AI Providers
    const providers = {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
    };
    const anyAi = Object.values(providers).some(Boolean);
    services.aiProviders = {
      name: "AI LLM Providers",
      status: anyAi ? "healthy" : "degraded",
      details: {
        configuredProviders: Object.entries(providers)
          .filter(([_, enabled]) => enabled)
          .map(([p]) => p),
        available: anyAi,
      },
    };

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
