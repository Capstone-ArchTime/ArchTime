import { Router } from "express";
import type { NotificationController } from "../controllers/NotificationController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: Thông báo trong ứng dụng (chuông trên header)
 */
export function createNotificationRouter(controller: NotificationController, jwtTokenService: JwtTokenService): Router {
  const router = Router();
  const auth = createAuthenticateMiddleware(jwtTokenService);

  /**
   * @swagger
   * /api/notifications:
   *   get:
   *     tags: [Notifications]
   *     summary: Các thông báo mới nhất của người đang đăng nhập và số chưa đọc
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }]
   *     responses:
   *       200: { description: "{ items: [{ id, kind, params, link, createdAt, readAt }], unread }" }
   */
  router.get("/", auth, controller.list);

  /**
   * @swagger
   * /api/notifications/stream:
   *   get:
   *     tags: [Notifications]
   *     summary: Luồng server-sent events, mỗi thông báo mới là một sự kiện "notification" (đóng sau 25 phút để kết nối lại)
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: text/event-stream }
   */
  router.get("/stream", auth, controller.stream);

  /**
   * @swagger
   * /api/notifications/read-all:
   *   post:
   *     tags: [Notifications]
   *     summary: Đánh dấu mọi thông báo là đã đọc
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "{ unread: 0 }" }
   */
  router.post("/read-all", auth, controller.readAll);

  /**
   * @swagger
   * /api/notifications/{id}/read:
   *   post:
   *     tags: [Notifications]
   *     summary: Đánh dấu một thông báo là đã đọc (không đổi gì nếu đã đọc hoặc không phải của bạn)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses:
   *       200: { description: "{ unread }" }
   */
  router.post("/:id/read", auth, controller.read);

  return router;
}
