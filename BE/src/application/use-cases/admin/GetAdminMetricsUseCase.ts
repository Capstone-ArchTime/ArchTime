import os from "node:os";
import { UserModel } from "../../../infrastructure/database/models/UserModel.js";
import { ProjectModel } from "../../../infrastructure/database/models/ProjectModel.js";
import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { JobStatus, MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";
import { UserStatus } from "../../../domain/entities/User.js";

export class GetAdminMetricsUseCase {
  async execute(): Promise<Record<string, unknown>> {
    const memory = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();

    const [
      totalProjects,
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalSnapshots,
      queuedJobs,
      runningJobs,
      completedJobs,
      failedJobs,
      cancelledJobs,
    ] = await Promise.all([
      ProjectModel.countDocuments(),
      UserModel.countDocuments(),
      UserModel.countDocuments({ status: UserStatus.ACTIVE }),
      UserModel.countDocuments({ status: UserStatus.SUSPENDED }),
      SnapshotModel.countDocuments(),
      MiningJobModel.countDocuments({ status: JobStatus.QUEUED }),
      MiningJobModel.countDocuments({ status: JobStatus.RUNNING }),
      MiningJobModel.countDocuments({ status: JobStatus.COMPLETED }),
      MiningJobModel.countDocuments({ status: JobStatus.FAILED }),
      MiningJobModel.countDocuments({ status: JobStatus.CANCELLED }),
    ]);

    return {
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        cpuCount: cpus.length,
        cpuModel: cpus[0]?.model || "unknown",
        memory: {
          totalBytes: totalMem,
          freeBytes: freeMem,
          usedBytes: totalMem - freeMem,
          processHeapUsedBytes: memory.heapUsed,
          processHeapTotalBytes: memory.heapTotal,
        },
      },
      stats: {
        projects: {
          total: totalProjects,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers,
        },
        snapshots: {
          total: totalSnapshots,
        },
        jobs: {
          queued: queuedJobs,
          running: runningJobs,
          completed: completedJobs,
          failed: failedJobs,
          cancelled: cancelledJobs,
          total: queuedJobs + runningJobs + completedJobs + failedJobs + cancelledJobs,
        },
      },
      timestamp: new Date(),
    };
  }
}
