import mongoose from "mongoose";
import type { INotification, NewNotification } from "../../domain/entities/Notification.js";
import type { INotificationRepository } from "../../domain/interfaces/INotificationRepository.js";
import { NotificationModel } from "../database/models/NotificationModel.js";

const toEntity = (d: any): INotification => ({
  id: String(d._id), userId: d.userId, kind: d.kind, params: d.params, link: d.link, createdAt: d.createdAt, readAt: d.readAt ?? null,
});

export class MongoNotificationRepository implements INotificationRepository {
  async createMany(notifications: NewNotification[]): Promise<INotification[]> {
    if (!notifications.length) return [];
    const docs = await NotificationModel.insertMany(notifications.map(n => ({ ...n, createdAt: new Date(), readAt: null })));
    return docs.map(d => toEntity(d.toObject()));
  }

  async listForUser(userId: string, limit: number): Promise<INotification[]> {
    const docs = await NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map(toEntity);
  }

  async unreadCount(userId: string): Promise<number> {
    return NotificationModel.countDocuments({ userId, readAt: null });
  }

  async markRead(userId: string, id: string, at: Date): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) return false;
    const result = await NotificationModel.updateOne({ _id: id, userId, readAt: null }, { $set: { readAt: at } });
    return result.modifiedCount > 0;
  }

  async markAllRead(userId: string, at: Date): Promise<number> {
    const result = await NotificationModel.updateMany({ userId, readAt: null }, { $set: { readAt: at } });
    return result.modifiedCount;
  }
}
