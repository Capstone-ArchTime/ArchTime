import mongoose, { type Document, type Model, Schema } from "mongoose";
import {
  ProjectMemberRole,
  MemberStatus,
  type IProjectMember,
} from "../../../domain/entities/ProjectMember.js";

export interface IProjectMemberDocument
  extends Omit<IProjectMember, "id">,
    Document {}

const ProjectMemberSchema = new Schema<IProjectMemberDocument>(
  {
    projectId: {
      type: String,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: {
      type: String,
      ref: "User",
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(ProjectMemberRole),
      default: ProjectMemberRole.MEMBER,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MemberStatus),
      default: MemberStatus.INVITED,
      required: true,
    },
    invitedBy: {
      type: String,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

ProjectMemberSchema.index({ projectId: 1, email: 1 }, { unique: true });

export const ProjectMemberModel: Model<IProjectMemberDocument> =
  mongoose.model<IProjectMemberDocument>("ProjectMember", ProjectMemberSchema);
