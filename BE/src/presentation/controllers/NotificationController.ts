import type { NextFunction, Request, Response } from "express";
import type { NotificationUseCases } from "../../application/use-cases/notifications/NotificationUseCases.js";
import type { INotification } from "../../domain/entities/Notification.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";

/** A stream stays open this long, then closes so the app reconnects with a fresh sign-in (a revoked session ends here). */
const STREAM_MAX_MS = 25 * 60 * 1000;
/** A comment line now and then keeps proxies from closing a quiet stream. */
const HEARTBEAT_MS = 25 * 1000;

export interface NotificationStreams {
  subscribe(userId: string, listener: (notification: INotification) => void): () => void;
}

/** The bell in the header: GET list, POST read one / all, GET stream (server-sent events). */
export class NotificationController {
  constructor(private readonly notifications: NotificationUseCases, private readonly streams: NotificationStreams) {}

  private user(req: Request): string {
    const id = req.user?.userId;
    if (!id) throw new UnauthorizedError("Sign in first.");
    return id;
  }

  /** GET /api/notifications?limit=20 — the newest notifications and how many are unread. */
  list = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await this.notifications.list(this.user(req), Number(req.query.limit) || 20)); } catch (error) { next(error); }
  };

  /** POST /api/notifications/:id/read */
  read = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await this.notifications.read(this.user(req), String(req.params.id))); } catch (error) { next(error); }
  };

  /** POST /api/notifications/read-all */
  readAll = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await this.notifications.readAll(this.user(req))); } catch (error) { next(error); }
  };

  /**
   * GET /api/notifications/stream — server-sent events: one `notification` event per new notification of the signed-in
   * person, as it happens. The app reads it with fetch (so the access token travels in the Authorization header, never
   * in the address) and reconnects when it ends.
   */
  stream = (req: Request, res: Response, next: NextFunction) => {
    let userId: string;
    try { userId = this.user(req); } catch (error) { next(error); return; }
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: do not hold the events back
    });
    res.flushHeaders();
    res.write("retry: 5000\n\n");

    const unsubscribe = this.streams.subscribe(userId, notification => {
      res.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    const limit = setTimeout(() => res.end(), STREAM_MAX_MS);
    const close = () => { clearInterval(heartbeat); clearTimeout(limit); unsubscribe(); };
    req.on("close", close);
    res.on("close", close);
  };
}
