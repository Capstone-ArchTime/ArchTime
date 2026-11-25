import type { INotification, NewNotification } from "../../../domain/entities/Notification.js";
import type { INotificationRepository } from "../../../domain/interfaces/INotificationRepository.js";

/** Where new notifications go the moment they are stored (infrastructure/services/NotificationHub.ts). */
export interface NotificationPublisher {
  publish(notification: INotification): void;
}

const LIST_MAX = 50;

/**
 * The bell in the header: notifications are stored, then pushed to the owner's open streams. Listing returns the
 * newest and the unread count; reading one or all returns the count left.
 */
export class NotificationUseCases {
  constructor(
    private readonly repo: INotificationRepository,
    private readonly publisher: NotificationPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async notify(notifications: NewNotification[]): Promise<INotification[]> {
    const created = await this.repo.createMany(notifications);
    for (const notification of created) this.publisher.publish(notification);
    return created;
  }

  async list(userId: string, limit = 20): Promise<{ items: INotification[]; unread: number }> {
    const n = Math.min(LIST_MAX, Math.max(1, Math.floor(Number(limit)) || 20));
    const [items, unread] = await Promise.all([this.repo.listForUser(userId, n), this.repo.unreadCount(userId)]);
    return { items, unread };
  }

  /** Idempotent: an id that is already read, unknown or someone else's changes nothing (and reveals nothing). */
  async read(userId: string, id: string): Promise<{ unread: number }> {
    await this.repo.markRead(userId, id, this.now());
    return { unread: await this.repo.unreadCount(userId) };
  }

  async readAll(userId: string): Promise<{ unread: number }> {
    await this.repo.markAllRead(userId, this.now());
    return { unread: 0 };
  }
}

/** Who answers for a workspace's architecture, with their account ids (owner, maintainers, organization owners). */
export interface AlertDirectory {
  projectName(projectId: string): Promise<string | null>;
  recipients(projectId: string): Promise<{ userId?: string }[]>;
}

/**
 * After a conformance check that found something new: a notification for each person who answers for the workspace,
 * leading to its findings. Nothing when the check found nothing.
 */
export function findingAlerts(directory: AlertDirectory, notifications: Pick<NotificationUseCases, "notify">) {
  return async (projectId: string, count: number): Promise<number> => {
    if (count <= 0) return 0;
    const [name, recipients] = await Promise.all([directory.projectName(projectId), directory.recipients(projectId)]);
    const userIds = [...new Set(recipients.map(r => r.userId).filter((id): id is string => !!id))];
    if (!userIds.length) return 0;
    const link = `/project-maintainer/conformance?project=${encodeURIComponent(projectId)}`;
    const created = await notifications.notify(userIds.map(userId => ({
      userId, kind: "conformance.findings" as const, link,
      params: { projectId, projectName: name ?? "", count },
    })));
    return created.length;
  };
}
