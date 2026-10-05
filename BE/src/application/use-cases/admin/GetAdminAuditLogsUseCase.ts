import { AuditLogModel } from "../../../infrastructure/database/models/AuditLogModel.js";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/utils/apiResponse.js";
import type { IAuditLog } from "../../../domain/entities/AuditLog.js";

export interface GetAdminAuditLogsInput {
  page?: number;
  limit?: number;
  action?: string;
  userId?: string;
  targetType?: string;
  from?: string;
  to?: string;
}

export interface GetAdminAuditLogsResult {
  logs: IAuditLog[];
  meta: PaginationMeta;
}

export class GetAdminAuditLogsUseCase {
  async execute(input: GetAdminAuditLogsInput): Promise<GetAdminAuditLogsResult> {
    const page = Math.max(1, input.page ? Number(input.page) : 1);
    const limit = Math.max(1, Math.min(100, input.limit ? Number(input.limit) : 20));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (input.action) {
      query.action = input.action;
    }
    if (input.userId) {
      query.userId = input.userId;
    }
    if (input.targetType) {
      query.targetType = input.targetType;
    }

    if (input.from || input.to) {
      const dateFilter: Record<string, Date> = {};
      if (input.from) {
        dateFilter.$gte = new Date(input.from);
      }
      if (input.to) {
        dateFilter.$lte = new Date(input.to);
      }
      query.createdAt = dateFilter;
    }

    const [docs, total] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLogModel.countDocuments(query),
    ]);

    const logs: IAuditLog[] = docs.map((doc: any) => ({
      id: doc._id.toString(),
      action: doc.action,
      userId: doc.userId,
      userEmail: doc.userEmail,
      targetType: doc.targetType,
      targetId: doc.targetId,
      details: doc.details,
      ipAddress: doc.ipAddress,
      userAgent: doc.userAgent,
      createdAt: doc.createdAt,
    }));

    const meta = buildPaginationMeta(total, page, limit);

    return { logs, meta };
  }
}
