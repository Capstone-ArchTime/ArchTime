import { EventEmitter } from "node:events";
import type { INotification } from "../../domain/entities/Notification.js";

/**
 * Hands each new notification to the open streams of its owner (GET /api/notifications/stream). In process, like the
 * mining queue: one server instance. A person with no open stream simply finds it in the list next time.
 */
export class NotificationHub {
  private readonly events = new EventEmitter();

  constructor() {
    // Many tabs and people at once: one listener per open stream.
    this.events.setMaxListeners(0);
  }

  /** Listens for a person's new notifications; call the returned function when their stream closes. */
  subscribe(userId: string, listener: (notification: INotification) => void): () => void {
    this.events.on(userId, listener);
    return () => { this.events.off(userId, listener); };
  }

  publish(notification: INotification): void {
    this.events.emit(notification.userId, notification);
  }

  /** Open streams of a person (for tests and diagnostics). */
  listeners(userId: string): number {
    return this.events.listenerCount(userId);
  }
}
