import mongoose, { Schema } from "mongoose";

// The in-app notifications of each account (domain/entities/Notification.ts). They are kept 90 days, then MongoDB
// removes them (TTL index), so the collection does not grow without end.

const NINETY_DAYS = 90 * 24 * 60 * 60;

const NotificationSchema = new Schema(
  {
    userId: { type: String, required: true },
    kind: { type: String, required: true },
    params: { type: Schema.Types.Mixed, required: true },
    link: { type: String, required: true },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date(), expires: NINETY_DAYS },
  },
  { collection: "notifications", versionKey: false },
);
// The bell lists a person's newest notifications and counts the unread ones.
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1 });

export const NotificationModel = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
