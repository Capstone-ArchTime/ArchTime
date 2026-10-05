import { AuditLogModel } from "../../../infrastructure/database/models/AuditLogModel.js";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/utils/apiResponse.js";

export interface GetAdminLogsInput {
  page?: number;
  limit?: number;
  level?: "info" | "warn" | "error";
  search?: string;
}

export interface AdminLogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  userId?: string;
  details?: Record<string, unknown>;
}

export interface GetAdminLogsResult {
  logs: AdminLogEntry[];
  meta: PaginationMeta;
}

export class GetAdminLogsUseCase {
  async execute(input: GetAdminLogsInput): Promise<GetAdminLogsResult> {
    const page = Math.max(1, input.page ? Number(input.page) : 1);
    const limit = Math.max(1, Math.min(100, input.limit ? Number(input.limit) : 25));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (input.search && input.search.trim()) {
      const escaped = input.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { action: { $regex: escaped, $options: "i" } },
        { userEmail: { $regex: escaped, $options: "i" } },
        { targetType: { $regex: escaped, $options: "i" } },
      ];
    }

    const [docs, total] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLogModel.countDocuments(query),
    ]);

    const logs: AdminLogEntry[] = docs.map((doc: any) => {
      let level: "info" | "warn" | "error" = "info";
      if (doc.action?.includes("FAIL") || doc.action?.includes("ERROR")) {
        level = "error";
      } else if (doc.action?.includes("SUSPEND") || doc.action?.includes("REVOKE") || doc.action?.includes("CANCEL") || doc.action?.includes("DELETE")) {
        level = "warn";
      }

      const message = `[${doc.action}] target=${doc.targetType || "none"}:${doc.targetId || "none"} user=${doc.userEmail || doc.userId || "system"}`;

      return {
        id: doc._id.toString(),
        timestamp: doc.createdAt,
        level,
        source: "audit",
        message,
        userId: doc.userId,
        details: doc.details,
      };
    });

    // If level filter was requested, filter items
    const filteredLogs = input.level
      ? logs.filter((l) => l.level === input.level)
      : logs;

    const meta = buildPaginationMeta(total, page, limit);

    return { logs: filteredLogs, meta };
  }
}
