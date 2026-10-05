import mongoose, { Schema, type Document, type Model } from "mongoose";
import { ProjectMemberRole } from "../../../domain/entities/ProjectMember.js";
import {
  InvitationStatus,
  type IProjectInvitation,
} from "../../../domain/entities/ProjectInvitation.js";

export interface IProjectInvitationDocument
  extends Omit<IProjectInvitation, "id">,
    Document {}

const ProjectInvitationSchema = new Schema<IProjectInvitationDocument>(
  {
    projectId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: Object.values(ProjectMemberRole),
      default: ProjectMemberRole.MEMBER,
    },
    token: { type: String, required: true, unique: true, index: true },
    invitedBy: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(InvitationStatus),
      default: InvitationStatus.PENDING,
      index: true,
    },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
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

ProjectInvitationSchema.index({ projectId: 1, email: 1, status: 1 });

export const ProjectInvitationModel: Model<IProjectInvitationDocument> =
  (mongoose.models.ProjectInvitation as Model<IProjectInvitationDocument>) ||
  mongoose.model<IProjectInvitationDocument>("ProjectInvitation", ProjectInvitationSchema);
