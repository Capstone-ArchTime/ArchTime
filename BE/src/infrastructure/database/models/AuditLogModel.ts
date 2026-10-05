import mongoose, { type Document, type Model, Schema } from "mongoose";
import type { IAuditLog } from "../../../domain/entities/AuditLog.js";

export interface IAuditLogDocument extends Omit<IAuditLog, "id">, Document {}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    action: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    userEmail: { type: String },
    targetType: { type: String, index: true },
    targetId: { type: String, index: true },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

export const AuditLogModel: Model<IAuditLogDocument> = mongoose.model<IAuditLogDocument>(
  "AuditLog",
  AuditLogSchema,
);
