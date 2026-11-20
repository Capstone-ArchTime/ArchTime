import { Router } from "express";
import type { ProjectMaintainerController } from "../controllers/ProjectMaintainerController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";

export function createInvitationRouter(pmController: ProjectMaintainerController, jwtTokenService: JwtTokenService): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtTokenService);

  /**
   * @swagger
   * /api/invitations/{token}/accept:
   *   post:
   *     tags: [Projects - Invitations]
   *     summary: Chấp nhận lời mời tham gia dự án qua token
   *     description: Cần đăng nhập bằng đúng email được mời (401 nếu chưa đăng nhập, 403 nếu khác email).
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lời mời được chấp nhận thành công
   */
  router.post("/:token/accept", authenticate, pmController.acceptInvitation);

  /**
   * @swagger
   * /api/invitations/{token}/decline:
   *   post:
   *     tags: [Projects - Invitations]
   *     summary: Từ chối lời mời tham gia dự án qua token
   *     description: Không cần đăng nhập (người được mời có thể chưa có tài khoản); từ chối không cấp quyền gì.
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lời mời đã được từ chối
   */
  router.post("/:token/decline", pmController.declineInvitation);

  return router;
}
