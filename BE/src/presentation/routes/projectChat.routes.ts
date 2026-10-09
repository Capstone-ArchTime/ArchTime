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
   *     responses:
   *       200:
   *         description: "{ answer, evidence: { commits, files, dependencies } | null, model: { name, host, external }, usage }"
   *       429:
   *         description: Gửi quá nhanh
   *       503:
   *         description: Dịch vụ AI chưa sẵn sàng
   */
  router.post("/:id/chat", createAuthenticateMiddleware(jwtTokenService), projectRoleMiddleware("read"), controller.chat);

  return router;
}
