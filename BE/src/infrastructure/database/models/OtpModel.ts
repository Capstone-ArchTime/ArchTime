import mongoose, { type Document, type Model, Schema } from "mongoose";
import type { IOtp } from "../../../domain/entities/Otp.js";

export interface IOtpDocument extends Omit<IOtp, "id">, Document {}

const OtpSchema = new Schema<IOtpDocument>(
  {
    email: { type: String, required: true, index: true },
    // Codes written before hashing existed had a plain `code` field and no hash: they fail verification and expire on their own.
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // MongoDB TTL — auto-delete when expired
    },
  },
  { timestamps: true },
);

export const OtpModel: Model<IOtpDocument> = mongoose.model<IOtpDocument>(
  "Otp",
  OtpSchema,
);
