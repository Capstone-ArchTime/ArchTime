import { Router, type RequestHandler } from "express";
import type { ProjectChatController } from "../controllers/ProjectChatController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { ProjectAction } from "../middlewares/projectRole.js";

export function createProjectChatRouter(
  controller: ProjectChatController,
  jwtTokenService: JwtTokenService,
  projectRoleMiddleware: (action: ProjectAction) => RequestHandler,
): Router {
  const router = Router();

  /**
   * @swagger
   * /api/projects/{id}/chat:
   *   post:
   *     tags: [AI Models]
   *     summary: Hỏi đáp về kiến trúc dự án, trả lời dựa trên snapshot và evidence đã lưu (gắn nhãn FACT / INFERENCE / UNKNOWN)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [messages]
   *             properties:
   *               messages:
   *                 type: array
   *                 description: Lịch sử hội thoại, tin cuối cùng phải là của user (giữ tối đa 10 tin gần nhất)
   *                 items:
   *                   type: object
   *                   properties:
   *                     role: { type: string, enum: [user, assistant] }
   *                     content: { type: string }
   *               conversationId:
   *                 type: string
   *                 description: Cuộc trò chuyện đã lưu cần nối tiếp; bỏ trống để bắt đầu cuộc mới. Câu hỏi và câu trả lời được lưu vào đó.
   *     responses:
   *       200:
   *         description: "{ answer, evidence: { commits, files, dependencies, items: [{ commit, kind, title, type, date, files, dependencies, sourceFiles }] } | null, model: { name, host, external }, usage, conversation: { id, title } | null (null khi không lưu được) }"
   *       400:
   *         description: Tin nhắn không hợp lệ, hoặc cuộc trò chuyện đã đầy (100 tin)
   *       404:
   *         description: Không có cuộc trò chuyện này của bạn trong dự án
   *       429:
   *         description: Gửi quá nhanh
   *       503:
   *         description: Dịch vụ AI chưa sẵn sàng
   */
  router.post("/:id/chat", createAuthenticateMiddleware(jwtTokenService), projectRoleMiddleware("read"), controller.chat);

  /**
   * @swagger
   * /api/projects/{id}/chat/conversations:
   *   get:
   *     tags: [AI Models]
   *     summary: Các cuộc trò chuyện đã lưu của bạn về dự án này, mới nhất trước (tối đa 50)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses:
   *       200:
   *         description: "{ conversations: [{ id, title, messageCount, createdAt, updatedAt }] }"
   */
  router.get("/:id/chat/conversations", createAuthenticateMiddleware(jwtTokenService), projectRoleMiddleware("read"), controller.listConversations);

  /**
   * @swagger
   * /api/projects/{id}/chat/conversations/{conversationId}:
   *   get:
   *     tags: [AI Models]
   *     summary: Đọc lại một cuộc trò chuyện đã lưu, gồm các tin nhắn và evidence được trích dẫn
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: conversationId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ conversation: { id, title, messageCount, createdAt, updatedAt, messages: [{ role, content, evidence, model, createdAt }] } }"
   *       404:
   *         description: Không có cuộc trò chuyện này của bạn trong dự án
   *   delete:
   *     tags: [AI Models]
   *     summary: Xóa một cuộc trò chuyện đã lưu của bạn
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: conversationId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ deleted: true }"
   *       404:
   *         description: Không có cuộc trò chuyện này của bạn trong dự án
   */
  router.get("/:id/chat/conversations/:conversationId", createAuthenticateMiddleware(jwtTokenService), projectRoleMiddleware("read"), controller.getConversation);
  router.delete("/:id/chat/conversations/:conversationId", createAuthenticateMiddleware(jwtTokenService), projectRoleMiddleware("read"), controller.deleteConversation);

  return router;
}
