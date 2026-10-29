import mongoose, { type Model, Schema } from "mongoose";

export interface IRateLimitDocument {
  key: string;
  count: number;
  resetAt: Date;
}

// One document per counter. The unique key is what makes the upsert in MongoRateLimiter safe across server instances.
const RateLimitSchema = new Schema<IRateLimitDocument>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true },
    // MongoDB removes the document soon after the window ends, so the collection only holds live counters.
    resetAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { versionKey: false },
);

export const RateLimitModel: Model<IRateLimitDocument> = mongoose.model<IRateLimitDocument>(
  "RateLimit",
  RateLimitSchema,
);
