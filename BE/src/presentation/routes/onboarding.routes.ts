import { Router, type RequestHandler } from "express";
import type { OnboardingController } from "../controllers/OnboardingController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { ProjectAction } from "../middlewares/projectRole.js";

/**
 * Lộ trình onboarding của một dự án (gắn dưới /api/projects). Soạn và giao lộ trình cần quyền ghi (chủ project, maintainer,
 * chủ tổ chức); học theo lộ trình chỉ cần quyền đọc và chỉ đụng tới tiến độ của chính người gọi.
 */
export function createOnboardingRouter(
  controller: OnboardingController,
  jwtTokenService: JwtTokenService,
  projectRoleMiddleware: (action: ProjectAction) => RequestHandler,
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtTokenService);
  const write = [authenticate, projectRoleMiddleware("write")];
  const read = [authenticate, projectRoleMiddleware("read")];

  /**
   * @swagger
   * /api/projects/{id}/onboarding-paths:
   *   get:
   *     tags: [Onboarding]
   *     summary: Các lộ trình của dự án, kèm số người được giao, số người đã học xong và số bước cần cập nhật (chỉ người có quyền ghi)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses:
   *       200:
   *         description: "{ paths: [{ id, title, description, status, revision, stepCount, assigned, finished, outdatedSteps, missingSteps, updatedAt }] }"
   *       403:
   *         description: Chỉ chủ project, maintainer và chủ tổ chức mới soạn lộ trình
   *   post:
   *     tags: [Onboarding]
   *     summary: Soạn một lộ trình mới (bản nháp hoặc công bố ngay)
   *     description: |
   *       Mỗi bước thuộc một loại: component (id của component trong sơ đồ workspace), commit (hash đã mine, từ 7 ký tự),
   *       adr (id quyết định thiết kế trong workspace) hoặc question (câu hỏi trắc nghiệm 2 đến 6 đáp án, có đáp án đúng và lời giải thích).
   *       Mỗi bước được ghim vào revision hiện tại (commit đã mine và revision của canonical map); khi commit biến mất hoặc map đổi,
   *       bước được đánh dấu cần cập nhật. Lộ trình công bố cần ít nhất một bước.
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [title, steps]
   *             properties:
   *               title: { type: string, maxLength: 120 }
   *               description: { type: string, maxLength: 2000 }
   *               status: { type: string, enum: [draft, published], default: draft }
   *               steps:
   *                 type: array
   *                 maxItems: 50
   *                 items:
   *                   type: object
   *                   required: [kind, title]
   *                   properties:
   *                     kind: { type: string, enum: [component, commit, adr, question] }
   *                     title: { type: string }
   *                     body: { type: string }
   *                     componentId: { type: string }
   *                     commit: { type: string, example: "a1b2c3d" }
   *                     adrId: { type: string }
   *                     question:
   *                       type: object
   *                       properties:
   *                         prompt: { type: string }
   *                         options: { type: array, items: { type: string } }
   *                         correctIndex: { type: integer }
   *                         explanation: { type: string }
   *     responses:
   *       201:
   *         description: "{ path } kèm assessment của từng bước (current | outdated | missing)"
   *       400:
   *         description: Dữ liệu không hợp lệ (theo từng trường), hoặc bước trỏ tới thứ workspace không có
   */
  router.get("/:id/onboarding-paths", ...write, controller.list);
  router.post("/:id/onboarding-paths", ...write, controller.create);

  /**
   * @swagger
   * /api/projects/{id}/onboarding-paths/{pathId}:
   *   get:
   *     tags: [Onboarding]
   *     summary: Một lộ trình đầy đủ cho người soạn (có đáp án) và tình trạng từng bước
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ path }"
   *       404:
   *         description: Không có lộ trình này
   *   put:
   *     tags: [Onboarding]
   *     summary: Sửa lộ trình (thay toàn bộ nội dung). Gửi kèm expectedRevision, bước cũ giữ id để tiến độ của người học không mất
   *     description: |
   *       Bước đã có thì gửi lại id của nó; bước không đổi giữ nguyên revision đã ghim, trừ khi gửi repin=true hoặc đổi thứ nó trỏ tới.
   *       Nếu người khác đã lưu lộ trình trong lúc bạn sửa thì trả 409 và không ghi gì.
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [title, steps, expectedRevision]
   *             properties:
   *               expectedRevision: { type: integer }
   *               title: { type: string }
   *               description: { type: string }
   *               status: { type: string, enum: [draft, published] }
   *               steps: { type: array, items: { type: object } }
   *     responses:
   *       200:
   *         description: "{ path }"
   *       409:
   *         description: Lộ trình đã được người khác sửa (CONFLICT)
   *   delete:
   *     tags: [Onboarding]
   *     summary: Xóa lộ trình và các lần giao của nó
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ deleted: true }"
   */
  router.get("/:id/onboarding-paths/:pathId", ...write, controller.get);
  router.put("/:id/onboarding-paths/:pathId", ...write, controller.update);
  router.delete("/:id/onboarding-paths/:pathId", ...write, controller.remove);

  /**
   * @swagger
   * /api/projects/{id}/onboarding-paths/{pathId}/assignments:
   *   get:
   *     tags: [Onboarding]
   *     summary: Tiến độ của mọi người được giao lộ trình này (chỉ người có quyền ghi; thành viên không xem được tiến độ của đồng nghiệp)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ path: { id, title, status, steps }, learners: [{ userId, name, email, assignedAt, lastActivityAt, done, total, percent, steps: [{ stepId, completed, completedAt, attempts }] }] }"
   *       403:
   *         description: Chỉ chủ project, maintainer và chủ tổ chức mới xem tiến độ của người khác
   *   post:
   *     tags: [Onboarding]
   *     summary: Giao lộ trình đã công bố cho các thành viên của dự án (giao lại cho người đã có thì không đổi gì)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [userIds]
   *             properties:
   *               userIds: { type: array, minItems: 1, maxItems: 50, items: { type: string } }
   *     responses:
   *       200:
   *         description: "{ assigned: [userId] }"
   *       400:
   *         description: Lộ trình chưa công bố, hoặc có người không thuộc dự án
   */
  router.get("/:id/onboarding-paths/:pathId/assignments", ...write, controller.progress);
  router.post("/:id/onboarding-paths/:pathId/assignments", ...write, controller.assign);

  /**
   * @swagger
   * /api/projects/{id}/onboarding-paths/{pathId}/assignments/{userId}:
   *   delete:
   *     tags: [Onboarding]
   *     summary: Thu hồi lộ trình đã giao cho một người (mất tiến độ của người đó)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *       - { in: path, name: userId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ unassigned: true }"
   *       404:
   *         description: Lộ trình này chưa được giao cho người đó
   */
  router.delete("/:id/onboarding-paths/:pathId/assignments/:userId", ...write, controller.unassign);

  /**
   * @swagger
   * /api/projects/{id}/onboarding-paths/{pathId}/mine:
   *   get:
   *     tags: [Onboarding]
   *     summary: Lộ trình được giao cho tôi, kèm tiến độ của riêng tôi (đáp án chỉ lộ ra sau khi trả lời đúng)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ path: { id, projectId, title, description, steps: [{ ..., progress, assessment }] }, progress: { done, total, percent } }"
   *       404:
   *         description: Lộ trình này chưa được giao cho bạn (hoặc chưa công bố)
   */
  router.get("/:id/onboarding-paths/:pathId/mine", ...read, controller.mine);

  /**
   * @swagger
   * /api/projects/{id}/onboarding-paths/{pathId}/steps/{stepId}/complete:
   *   post:
   *     tags: [Onboarding]
   *     summary: Đánh dấu tôi đã học xong một bước (không áp dụng cho câu hỏi; câu hỏi xong khi trả lời đúng)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *       - { in: path, name: stepId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ progress: { done, total, percent } }"
   *       400:
   *         description: Bước này là câu hỏi
   *       404:
   *         description: Lộ trình chưa được giao cho bạn, hoặc không có bước này
   */
  router.post("/:id/onboarding-paths/:pathId/steps/:stepId/complete", ...read, controller.complete);

  /**
   * @swagger
   * /api/projects/{id}/onboarding-paths/{pathId}/steps/{stepId}/answer:
   *   post:
   *     tags: [Onboarding]
   *     summary: Trả lời một câu hỏi kiểm tra. Đúng thì bước xong và lộ ra đáp án cùng lời giải thích; sai thì chỉ tăng số lần thử
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: pathId, required: true, schema: { type: string } }
   *       - { in: path, name: stepId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [choice]
   *             properties:
   *               choice: { type: integer, description: Chỉ số (từ 0) của đáp án đã chọn }
   *     responses:
   *       200:
   *         description: "{ correct, attempts, completed, correctIndex?, explanation?, progress }"
   *       400:
   *         description: Đáp án không hợp lệ, hoặc bước này không có câu hỏi
   */
  router.post("/:id/onboarding-paths/:pathId/steps/:stepId/answer", ...read, controller.answer);

  return router;
}

/** Lộ trình của chính tôi ở mọi dự án (gắn dưới /api/onboarding). */
export function createLearningRouter(controller: OnboardingController, jwtTokenService: JwtTokenService): Router {
  const router = Router();

  /**
   * @swagger
   * /api/onboarding/me:
   *   get:
   *     tags: [Onboarding]
   *     summary: Các lộ trình đã giao cho tôi, ở các dự án tôi còn là thành viên, kèm tiến độ của tôi
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200:
   *         description: "{ paths: [{ pathId, projectId, projectName, title, description, assignedAt, lastActivityAt, done, total, percent }] }"
   */
  router.get("/me", createAuthenticateMiddleware(jwtTokenService), controller.myPaths);
  return router;
}
