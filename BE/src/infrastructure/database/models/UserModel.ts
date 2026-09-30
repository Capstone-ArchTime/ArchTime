import mongoose, { type Document, type Model, Schema } from "mongoose";
import { UserRole, type IUser } from "../../../domain/entities/User.js";

export interface IUserDocument extends Omit<IUser, "id">, Document {}

const UserSchema = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.DEVELOPER_ANALYST,
    },
    isVerified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
      },
    },
  },
);

export const UserModel: Model<IUserDocument> = mongoose.model<IUserDocument>(
  "User",
  UserSchema,
);
