import mongoose, { type Document, type Model, Schema } from "mongoose";
import { OrganizationRole, type IOrganizationMember } from "../../../domain/entities/Organization.js";

export interface IOrganizationMemberDocument extends Omit<IOrganizationMember, "id">, Document {}

const OrganizationMemberSchema = new Schema<IOrganizationMemberDocument>(
  {
    organizationId: { type: String, required: true, ref: "Organization" },
    userId: { type: String, required: true, ref: "User", index: true },
    role: { type: String, enum: Object.values(OrganizationRole), default: OrganizationRole.MEMBER },
    addedBy: { type: String, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const OrganizationMemberModel: Model<IOrganizationMemberDocument> = mongoose.model<IOrganizationMemberDocument>(
  "OrganizationMember",
  OrganizationMemberSchema,
);
