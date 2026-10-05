import { AuditLogModel } from "../database/models/AuditLogModel.js";
import type { AuditAction } from "../../domain/entities/AuditLog.js";

export interface LogAuditEventInput {
  action: AuditAction | string;
  userId?: string;
  userEmail?: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  public static async log(input: LogAuditEventInput): Promise<void> {
    try {
      await AuditLogModel.create({
        action: input.action,
        userId: input.userId,
        userEmail: input.userEmail,
        targetType: input.targetType,
        targetId: input.targetId,
        details: input.details,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (err) {
      console.warn("[AuditService] Failed to record audit log:", err);
    }
  }
}
