import mongoose, { type Document, type Model, Schema } from "mongoose";
import type { IOrganization } from "../../../domain/entities/Organization.js";

export interface IOrganizationDocument extends Omit<IOrganization, "id">, Document {}

const OrganizationSchema = new Schema<IOrganizationDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    createdBy: { type: String, required: true, ref: "User" },
    // RF-14: set while suspended by a System Administrator; absent or null when active.
    suspension: {
      type: new Schema({ at: { type: Date, required: true }, by: { type: String, required: true }, reason: { type: String, required: true } }, { _id: false }),
      default: null,
    },
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

export const OrganizationModel: Model<IOrganizationDocument> = mongoose.model<IOrganizationDocument>(
  "Organization",
  OrganizationSchema,
);
