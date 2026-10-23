import { Router, type RequestHandler } from "express";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { StepRevisionService } from "../../infrastructure/services/StepRevisionService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { ProjectAction } from "../middlewares/projectRole.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

/** Binding learning material to revisions (T25); see domain/onboarding/stepRevision.ts. */
export function createRevisionRouter(
  jwtTokenService: JwtTokenService,
  projectRoleMiddleware: (action: ProjectAction) => RequestHandler,
): Router {
  const router = Router();
  const guard = [createAuthenticateMiddleware(jwtTokenService), projectRoleMiddleware("read")];

  /**
   * @swagger
   * /api/projects/{id}/revisions/pin:
   *   post:
   *     tags: [Projects - Revisions]
   *     summary: Ghim một bước vào revision hiện tại (commit đã mine + revision của canonical map)
   *     description: |
   *       Gửi commit (hash, tối thiểu 7 ký tự) hoặc snapshotId; bỏ trống cả hai = snapshot mới nhất.
   *       Lưu object trả về cùng bước (onboarding step) để kiểm tra về sau.
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               commit: { type: string, example: "a1b2c3d" }
   *               snapshotId: { type: string }
   *     responses:
   *       200:
   *         description: "{ revision: { commit, snapshotId, workspaceRevision, pinnedAt, snapshot: { id, hash, title, date } } }"
   *       400:
   *         description: Commit không còn trong lịch sử repo
   *       404:
   *         description: Commit chưa được mine trong workspace này
   */
  router.post("/:id/revisions/pin", ...guard, async (req, res, next) => {
    try {
      const revision = await StepRevisionService.pin(req.params.id, req.body ?? {});
      sendSuccess(res, { revision });
    } catch (err) { next(err); }
  });

  /**
   * @swagger
   * /api/projects/{id}/revisions/check:
   *   post:
   *     tags: [Projects - Revisions]
   *     summary: Kiểm tra các revision đã ghim còn đúng không (current / outdated / missing)
   *     description: |
   *       missing: commit đã biến mất khỏi lịch sử (force-push, xóa nhánh; được đánh dấu ở lần scan/mine gần nhất) hoặc snapshot bị xóa.
   *       outdated: commit vẫn còn nhưng canonical map đã đổi revision.
   *       Kết quả trả theo đúng thứ tự gửi lên; tối đa 200 revision mỗi lần.
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [revisions]
   *             properties:
   *               revisions:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     commit: { type: string }
   *                     snapshotId: { type: string }
   *                     workspaceRevision: { type: integer }
   *                     pinnedAt: { type: string, format: date-time }
   *     responses:
   *       200:
   *         description: "{ results: [{ status: current|outdated|missing, issues: [{ code: COMMIT_GONE|SNAPSHOT_GONE|MAP_CHANGED, message }] }] }"
   */
  router.post("/:id/revisions/check", ...guard, async (req, res, next) => {
    try {
      const results = await StepRevisionService.check(req.params.id, req.body?.revisions);
      sendSuccess(res, { results });
    } catch (err) { next(err); }
  });

  return router;
}
