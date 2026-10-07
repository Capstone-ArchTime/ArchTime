import { Router } from "express";
import type { LlmController } from "../controllers/LlmController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";

export function createLlmRouter(controller: LlmController, jwtTokenService: JwtTokenService): Router {
  const router = Router();
  router.use(createAuthenticateMiddleware(jwtTokenService));

  /**
   * @swagger
   * /api/llm/models:
   *   get:
   *     tags: [AI Models]
   *     summary: Các model user được chọn khi vẽ kiến trúc, kèm model mặc định, model đề xuất và chi phí ước tính
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: query, name: projectId, schema: { type: string }, description: "Để ước tính theo kích thước snapshot" }
   *       - { in: query, name: snapshotId, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ models, defaultModelId, recommendedModelId, allowUserModelChoice, mode, files, serverDefault }"
   */
  router.get("/models", controller.listModels);

  /**
   * @swagger
   * /api/llm/runs/me:
   *   get:
   *     tags: [AI Models]
   *     summary: Lịch sử AI của tôi - model, token input/output/total, latency, cost cho mỗi lần thực hiện
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: query, name: projectId, schema: { type: string } }
   *       - { in: query, name: page, schema: { type: integer, default: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
   *     responses:
   *       200:
   *         description: "{ runs, totals } + meta"
   */
  router.get("/runs/me", controller.myRuns);

  /**
   * @swagger
   * /api/llm/runs/{runId}/feedback:
   *   post:
   *     tags: [AI Models]
   *     summary: Đánh giá kết quả (1 = hữu ích, 0 = không); được tính vào điểm chất lượng
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: runId, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content: { application/json: { schema: { type: object, properties: { rating: { type: integer, enum: [0, 1] } } } } }
   *     responses: { 200: { description: OK } }
   */
  router.post("/runs/:runId/feedback", controller.feedback);

  return router;
}
