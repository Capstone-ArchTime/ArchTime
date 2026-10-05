import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
  ApprovalStatus,
  ApprovalType,
  type IApprovalRequest,
} from "../../../domain/entities/ApprovalRequest.js";

export interface IApprovalRequestDocument
  extends Omit<IApprovalRequest, "id">,
    Document {}

const ApprovalRequestSchema = new Schema<IApprovalRequestDocument>(
  {
    projectId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: Object.values(ApprovalType),
      default: ApprovalType.ARCHITECTURE_CHANGE,
    },
    status: {
      type: String,
      enum: Object.values(ApprovalStatus),
      default: ApprovalStatus.PENDING,
      index: true,
    },
    requestedBy: { type: String, required: true, index: true },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

ApprovalRequestSchema.index({ projectId: 1, createdAt: -1 });

export const ApprovalRequestModel: Model<IApprovalRequestDocument> =
  (mongoose.models.ApprovalRequest as Model<IApprovalRequestDocument>) ||
  mongoose.model<IApprovalRequestDocument>("ApprovalRequest", ApprovalRequestSchema);
