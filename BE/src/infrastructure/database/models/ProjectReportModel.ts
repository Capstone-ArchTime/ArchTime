import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
  ReportStatus,
  ReportType,
  type IProjectReport,
} from "../../../domain/entities/ProjectReport.js";

export interface IProjectReportDocument
  extends Omit<IProjectReport, "id">,
    Document {}

const ProjectReportSchema = new Schema<IProjectReportDocument>(
  {
    projectId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(ReportType),
      default: ReportType.ARCHITECTURE_SUMMARY,
    },
    generatedBy: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(ReportStatus),
      default: ReportStatus.READY,
    },
    summary: { type: String, default: "" },
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

ProjectReportSchema.index({ projectId: 1, createdAt: -1 });

export const ProjectReportModel: Model<IProjectReportDocument> =
  (mongoose.models.ProjectReport as Model<IProjectReportDocument>) ||
  mongoose.model<IProjectReportDocument>("ProjectReport", ProjectReportSchema);
