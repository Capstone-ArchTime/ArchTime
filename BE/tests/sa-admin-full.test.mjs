import test from "node:test";
import assert from "node:assert/strict";
import { CancelAdminJobUseCase } from "../src/application/use-cases/admin/CancelAdminJobUseCase.ts";
import { UpdateAdminSettingsUseCase } from "../src/application/use-cases/admin/UpdateAdminSettingsUseCase.ts";
import { CreateAdminApiKeyUseCase } from "../src/application/use-cases/admin/CreateAdminApiKeyUseCase.ts";
import { RevokeAdminApiKeyUseCase } from "../src/application/use-cases/admin/RevokeAdminApiKeyUseCase.ts";
import { GetAdminJobsUseCase } from "../src/application/use-cases/admin/GetAdminJobsUseCase.ts";
import { GetAdminLogsUseCase } from "../src/application/use-cases/admin/GetAdminLogsUseCase.ts";
import { GetAdminAuditLogsUseCase } from "../src/application/use-cases/admin/GetAdminAuditLogsUseCase.ts";
import { GetAdminMetricsUseCase } from "../src/application/use-cases/admin/GetAdminMetricsUseCase.ts";
import { GetAdminServicesStatusUseCase } from "../src/application/use-cases/admin/GetAdminServicesStatusUseCase.ts";
import { MiningJobModel, JobStatus } from "../src/infrastructure/database/models/MiningJobModel.ts";
import { SystemSettingsModel } from "../src/infrastructure/database/models/SystemSettingsModel.ts";
import { AuditLogModel } from "../src/infrastructure/database/models/AuditLogModel.ts";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.ts";
import { UserModel } from "../src/infrastructure/database/models/UserModel.ts";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.ts";
import { AuditService } from "../src/infrastructure/services/AuditService.ts";
import { AuditAction } from "../src/domain/entities/AuditLog.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

// ────────────────────────────────────────────────────────────
// SA-03: Mining Jobs Monitor
// ────────────────────────────────────────────────────────────

test("CancelAdminJobUseCase: successfully cancels queued or running job", async () => {
  const originalFindById = MiningJobModel.findById;
  const originalAuditLog = AuditService.log;

  let auditPayload = null;
  AuditService.log = async (payload) => {
    auditPayload = payload;
  };

  try {
    const mockJob = {
      _id: "job-123",
      projectId: "proj-1",
      status: JobStatus.RUNNING,
      stage: "Cloning repo",
      cancelledAt: null,
      cancelledBy: null,
      async save() {
        return this;
      },
      toJSON() {
        return {
          id: this._id,
          projectId: this.projectId,
          status: this.status,
          cancelledAt: this.cancelledAt,
          cancelledBy: this.cancelledBy,
          stage: this.stage,
        };
      },
    };

    MiningJobModel.findById = async () => mockJob;

    const useCase = new CancelAdminJobUseCase();
    const result = await useCase.execute({
      jobId: "job-123",
      adminUserId: "admin-1",
    });

    assert.equal(result.status, JobStatus.CANCELLED);
    assert.equal(result.cancelledBy, "admin-1");
    assert.ok(result.cancelledAt);
    assert.equal(auditPayload?.action, AuditAction.JOB_CANCEL);
    assert.equal(auditPayload?.targetId, "job-123");
  } finally {
    MiningJobModel.findById = originalFindById;
    AuditService.log = originalAuditLog;
  }
});

test("CancelAdminJobUseCase: throws 400 when job is already completed or failed", async () => {
  const originalFindById = MiningJobModel.findById;

  try {
    MiningJobModel.findById = async () => ({
      _id: "job-done",
      status: JobStatus.COMPLETED,
    });

    const useCase = new CancelAdminJobUseCase();
    await assert.rejects(
      async () => {
        await useCase.execute({ jobId: "job-done", adminUserId: "admin-1" });
      },
      (err) => err instanceof AppError && err.statusCode === 400,
    );
  } finally {
    MiningJobModel.findById = originalFindById;
  }
});

test("CancelAdminJobUseCase: throws 404 when job does not exist", async () => {
  const originalFindById = MiningJobModel.findById;

  try {
    MiningJobModel.findById = async () => null;

    const useCase = new CancelAdminJobUseCase();
    await assert.rejects(
      async () => {
        await useCase.execute({ jobId: "nonexistent", adminUserId: "admin-1" });
      },
      (err) => err instanceof AppError && err.statusCode === 404,
    );
  } finally {
    MiningJobModel.findById = originalFindById;
  }
});

test("GetAdminJobsUseCase: returns enriched jobs with project and requester details", async () => {
  const originalMiningFind = MiningJobModel.find;
  const originalMiningCount = MiningJobModel.countDocuments;
  const originalProjectFind = ProjectModel.find;
  const originalUserFind = UserModel.find;

  try {
    MiningJobModel.find = () => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: "job-1",
                projectId: "proj-1",
                requestedBy: "user-1",
                status: "running",
                kind: "mine",
                progress: 50,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          }),
        }),
      }),
    });
    MiningJobModel.countDocuments = async () => 1;

    ProjectModel.find = () => ({
      lean: async () => [{ _id: "proj-1", name: "ArchTime Core" }],
    });

    UserModel.find = () => ({
      lean: async () => [{ _id: "user-1", email: "dev@archtime.io" }],
    });

    const useCase = new GetAdminJobsUseCase();
    const result = await useCase.execute({ page: 1, limit: 10 });

    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].projectName, "ArchTime Core");
    assert.equal(result.jobs[0].requester?.email, "dev@archtime.io");
    assert.equal(result.meta.total, 1);
  } finally {
    MiningJobModel.find = originalMiningFind;
    MiningJobModel.countDocuments = originalMiningCount;
    ProjectModel.find = originalProjectFind;
    UserModel.find = originalUserFind;
  }
});

// ────────────────────────────────────────────────────────────
// SA-04: System Settings & API Keys
// ────────────────────────────────────────────────────────────

test("UpdateAdminSettingsUseCase: validates positive numbers", async () => {
  const useCase = new UpdateAdminSettingsUseCase();

  await assert.rejects(
    async () => {
      await useCase.execute({
        maxConcurrentJobs: -1,
        adminUserId: "admin-1",
      });
    },
    (err) => err instanceof AppError && err.statusCode === 400,
  );

  await assert.rejects(
    async () => {
      await useCase.execute({
        miningTimeoutMinutes: 0,
        adminUserId: "admin-1",
      });
    },
    (err) => err instanceof AppError && err.statusCode === 400,
  );
});

test("UpdateAdminSettingsUseCase: updates valid configuration and logs audit event", async () => {
  const originalFindOne = SystemSettingsModel.findOne;
  const originalAuditLog = AuditService.log;

  let auditLogged = null;
  AuditService.log = async (payload) => {
    auditLogged = payload;
  };

  try {
    const mockSettings = {
      maxConcurrentJobs: 5,
      maxRepoSizeMb: 500,
      miningTimeoutMinutes: 60,
      defaultLlmProvider: "gemini",
      maintenanceMode: false,
      allowPublicRegistration: true,
      async save() {
        return this;
      },
      toJSON() {
        return {
          maxConcurrentJobs: this.maxConcurrentJobs,
          maxRepoSizeMb: this.maxRepoSizeMb,
          maintenanceMode: this.maintenanceMode,
        };
      },
    };

    SystemSettingsModel.findOne = async () => mockSettings;

    const useCase = new UpdateAdminSettingsUseCase();
    const result = await useCase.execute({
      maxConcurrentJobs: 10,
      maintenanceMode: true,
      adminUserId: "admin-1",
    });

    assert.equal(result.maxConcurrentJobs, 10);
    assert.equal(result.maintenanceMode, true);
    assert.equal(auditLogged?.action, AuditAction.SETTINGS_UPDATE);
  } finally {
    SystemSettingsModel.findOne = originalFindOne;
    AuditService.log = originalAuditLog;
  }
});

test("CreateAdminApiKeyUseCase: creates hashed API key with arch_live_ prefix", async () => {
  const originalFindOne = SystemSettingsModel.findOne;
  const originalAuditLog = AuditService.log;

  let auditPayload = null;
  AuditService.log = async (payload) => {
    auditPayload = payload;
  };

  try {
    const apiKeys = [];
    const mockSettings = {
      apiKeys,
      async save() {
        return this;
      },
    };

    SystemSettingsModel.findOne = async () => mockSettings;

    const useCase = new CreateAdminApiKeyUseCase();
    const result = await useCase.execute({
      name: "CI Key",
      adminUserId: "admin-1",
    });

    assert.ok(result.apiKey.startsWith("arch_live_"));
    assert.equal(result.name, "CI Key");
    assert.equal(result.keyPrefix.length, 14);
    assert.equal(apiKeys.length, 1);
    assert.notEqual(apiKeys[0].keyHash, result.apiKey); // Key must be hashed
    assert.equal(apiKeys[0].keyHash.length, 64); // SHA-256 hex length
    assert.equal(auditPayload?.action, AuditAction.API_KEY_CREATE);
  } finally {
    SystemSettingsModel.findOne = originalFindOne;
    AuditService.log = originalAuditLog;
  }
});

test("RevokeAdminApiKeyUseCase: removes key and logs audit event", async () => {
  const originalFindOne = SystemSettingsModel.findOne;
  const originalAuditLog = AuditService.log;

  let auditPayload = null;
  AuditService.log = async (payload) => {
    auditPayload = payload;
  };

  try {
    const mockSettings = {
      apiKeys: [
        {
          _id: "key-1",
          name: "Test Key",
          keyPrefix: "arch_live_1234",
        },
      ],
      async save() {
        return this;
      },
    };

    SystemSettingsModel.findOne = async () => mockSettings;

    const useCase = new RevokeAdminApiKeyUseCase();
    await useCase.execute({
      keyId: "key-1",
      adminUserId: "admin-1",
    });

    assert.equal(mockSettings.apiKeys.length, 0);
    assert.equal(auditPayload?.action, AuditAction.API_KEY_REVOKE);
    assert.equal(auditPayload?.targetId, "key-1");
  } finally {
    SystemSettingsModel.findOne = originalFindOne;
    AuditService.log = originalAuditLog;
  }
});

// ────────────────────────────────────────────────────────────
// SA-05: Audit Log Query
// ────────────────────────────────────────────────────────────

test("GetAdminAuditLogsUseCase: filters and paginates audit trail", async () => {
  const originalAuditFind = AuditLogModel.find;
  const originalAuditCount = AuditLogModel.countDocuments;

  try {
    AuditLogModel.find = () => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: "audit-1",
                action: AuditAction.USER_INVITE,
                userId: "admin-1",
                targetType: "user",
                targetId: "user-2",
                createdAt: new Date(),
              },
            ],
          }),
        }),
      }),
    });
    AuditLogModel.countDocuments = async () => 1;

    const useCase = new GetAdminAuditLogsUseCase();
    const result = await useCase.execute({
      action: AuditAction.USER_INVITE,
      page: 1,
      limit: 10,
    });

    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].action, AuditAction.USER_INVITE);
    assert.equal(result.meta.total, 1);
  } finally {
    AuditLogModel.find = originalAuditFind;
    AuditLogModel.countDocuments = originalAuditCount;
  }
});

// ────────────────────────────────────────────────────────────
// SA-01: Metrics & Services Status
// ────────────────────────────────────────────────────────────

test("GetAdminMetricsUseCase: returns system and database metrics", async () => {
  const origProj = ProjectModel.countDocuments;
  const origUser = UserModel.countDocuments;
  const origSnap = SnapshotModel.countDocuments;
  const origJob = MiningJobModel.countDocuments;

  try {
    ProjectModel.countDocuments = async () => 5;
    UserModel.countDocuments = async (filter) => {
      if (filter?.status === "active") return 8;
      if (filter?.status === "suspended") return 2;
      return 10;
    };
    SnapshotModel.countDocuments = async () => 20;
    MiningJobModel.countDocuments = async (filter) => {
      if (filter?.status === JobStatus.RUNNING) return 1;
      if (filter?.status === JobStatus.QUEUED) return 2;
      if (filter?.status === JobStatus.COMPLETED) return 15;
      if (filter?.status === JobStatus.FAILED) return 1;
      if (filter?.status === JobStatus.CANCELLED) return 0;
      return 19;
    };

    const useCase = new GetAdminMetricsUseCase();
    const result = await useCase.execute();

    assert.ok(result.system.platform);
    assert.ok(result.system.nodeVersion);
    assert.equal(typeof result.system.memory.usedBytes, "number");
    assert.equal(result.stats.projects.total, 5);
    assert.equal(result.stats.users.total, 10);
    assert.equal(result.stats.users.active, 8);
    assert.equal(result.stats.users.suspended, 2);
    assert.equal(result.stats.snapshots.total, 20);
    assert.equal(result.stats.jobs.total, 19);
    assert.equal(result.stats.jobs.running, 1);
  } finally {
    ProjectModel.countDocuments = origProj;
    UserModel.countDocuments = origUser;
    SnapshotModel.countDocuments = origSnap;
    MiningJobModel.countDocuments = origJob;
  }
});

test("GetAdminServicesStatusUseCase: reports services health and config", async () => {
  const useCase = new GetAdminServicesStatusUseCase();
  const status = await useCase.execute();

  assert.ok(["healthy", "unhealthy"].includes(status.services.database.status));
  assert.ok(["healthy", "degraded"].includes(status.services.git.status));
  assert.ok(["healthy", "degraded"].includes(status.services.email.status));
  assert.ok(["healthy", "degraded", "unhealthy"].includes(status.status));
});

test("GetAdminLogsUseCase: maps audit events to log levels correctly", async () => {
  const origFind = AuditLogModel.find;
  const origCount = AuditLogModel.countDocuments;

  try {
    AuditLogModel.find = () => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: "log-1",
                action: AuditAction.USER_SUSPEND,
                userId: "admin-1",
                details: { reason: "Policy violation" },
                createdAt: new Date(),
              },
              {
                _id: "log-2",
                action: AuditAction.SETTINGS_UPDATE,
                userId: "admin-1",
                details: { maxConcurrentJobs: 10 },
                createdAt: new Date(),
              },
            ],
          }),
        }),
      }),
    });
    AuditLogModel.countDocuments = async () => 2;

    const useCase = new GetAdminLogsUseCase();
    const result = await useCase.execute({ page: 1, limit: 10 });

    assert.equal(result.logs.length, 2);
    assert.equal(result.logs[0].level, "warn"); // SUSPEND maps to warn
    assert.equal(result.logs[1].level, "info"); // UPDATE maps to info
  } finally {
    AuditLogModel.find = origFind;
    AuditLogModel.countDocuments = origCount;
  }
});
