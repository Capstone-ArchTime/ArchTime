import { Router } from "express";
import type { ProjectMaintainerController } from "../controllers/ProjectMaintainerController.js";

export function createInvitationRouter(pmController: ProjectMaintainerController): Router {
  const router = Router();

  /**
   * @swagger
   * /api/invitations/{token}/accept:
   *   post:
   *     tags: [Projects - Invitations]
   *     summary: Chấp nhận lời mời tham gia dự án qua token
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lời mời được chấp nhận thành công
   */
  router.post("/:token/accept", pmController.acceptInvitation);

  /**
   * @swagger
   * /api/invitations/{token}/decline:
   *   post:
   *     tags: [Projects - Invitations]
   *     summary: Từ chối lời mời tham gia dự án qua token
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
