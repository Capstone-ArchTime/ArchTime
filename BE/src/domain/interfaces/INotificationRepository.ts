import type { INotification, NewNotification } from "../entities/Notification.js";

/** The in-app notifications of each account (the bell in the header). */
export interface INotificationRepository {
  createMany(notifications: NewNotification[]): Promise<INotification[]>;
  /** The newest first. */
  listForUser(userId: string, limit: number): Promise<INotification[]>;
  unreadCount(userId: string): Promise<number>;
  /** False when the notification is not this person's or was already read. */
  markRead(userId: string, id: string, at: Date): Promise<boolean>;
  /** How many were marked. */
  markAllRead(userId: string, at: Date): Promise<number>;
}
