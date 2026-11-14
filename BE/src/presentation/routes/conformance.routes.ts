import { Router, type RequestHandler } from "express";
import type { ConformanceController } from "../controllers/ConformanceController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { ProjectAction } from "../middlewares/projectRole.js";

/**
 * @swagger
 * tags:
 *   name: Conformance
 *   description: Kiểm tra code có tuân theo sơ đồ component đã xác nhận (RF-08, UC-40, UC-41)
 */
export function createConformanceRouter(
  controller: ConformanceController,
  jwtTokenService: JwtTokenService,
  projectRoleMiddleware: (action: ProjectAction) => RequestHandler,
): Router {
  const router = Router();
  const auth = createAuthenticateMiddleware(jwtTokenService);

  /**
   * @swagger
   * /api/projects/{id}/conformance:
   *   get:
   *     tags: [Conformance]
   *     summary: Trạng thái kiểm tra - sơ đồ đã xác nhận chưa, baseline, các snapshot đã kiểm tra
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses:
   *       200: { description: "{ confirmed, baselineCommit, componentsWithoutPaths, checks: [{ snapshotId, snapshotHash, commitDate, counts, checkedAt, stale }] }" }
   *   post:
   *     tags: [Conformance]
   *     summary: Kiểm tra các snapshot sau baseline với sơ đồ đã xác nhận (UC-40)
   *     description: Snapshot đã kiểm tra với cùng sơ đồ và luật thì bỏ qua, trừ khi force = true.
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       content: { application/json: { schema: { type: object, properties: { force: { type: boolean } } } } }
   *     responses:
   *       200: { description: "{ baselineCommit, checked: [{ snapshotId, hash, findings }], skipped }" }
   *       409: { description: Sơ đồ chưa được xác nhận, hoặc commit baseline không còn trong lịch sử }
   */
  router.get("/:id/conformance", auth, projectRoleMiddleware("read"), controller.overview);
  router.post("/:id/conformance", auth, projectRoleMiddleware("write"), controller.run);

  /**
   * @swagger
   * /api/projects/{id}/conformance/findings:
   *   get:
   *     tags: [Conformance]
   *     summary: Danh sách finding, mới nhất trước
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: query, name: snapshotId, schema: { type: string } }
   *       - { in: query, name: status, schema: { type: string, enum: [open, decided] } }
   *       - { in: query, name: type, schema: { type: string, enum: [forbidden-dependency, missing-required-dependency, undeclared-dependency] } }
   *       - { in: query, name: limit, schema: { type: integer, maximum: 500 } }
   *     responses:
   *       200: { description: "{ findings: [{ id, snapshotHash, type, severity, sourceName, targetName, files, imports, importCount, decision, explanation }] }" }
   */
  router.get("/:id/conformance/findings", auth, projectRoleMiddleware("read"), controller.findings);

  /**
   * @swagger
   * /api/projects/{id}/conformance/findings/{findingId}/decision:
   *   put:
   *     tags: [Conformance]
   *     summary: Quyết định về một finding (UC-41) - fix, accept, dismiss hoặc reopen
   *     description: accept và dismiss cần ghi chú lý do, và được áp dụng tiếp cho cùng finding ở các snapshot sau.
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: findingId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content: { application/json: { schema: { type: object, required: [decision], properties: { decision: { type: string, enum: [fix, accept, dismiss, reopen] }, note: { type: string, maxLength: 1000 } } } } }
   *     responses:
   *       200: { description: "{ finding }" }
   *       400: { description: Quyết định không hợp lệ hoặc thiếu ghi chú }
   *       404: { description: Không có finding }
   */
  router.put("/:id/conformance/findings/:findingId/decision", auth, projectRoleMiddleware("admin"), controller.decision);

  /**
   * @swagger
   * /api/projects/{id}/conformance/findings/{findingId}/explanation:
   *   post:
   *     tags: [Conformance]
   *     summary: Giải thích finding bằng AI (UC-41)
   *     description: >
   *       Gửi cho model tên, mô tả component, luật, ADR liên quan và đường dẫn file; không gửi source code. Câu trả lời được
   *       lưu lại; refresh = true (chỉ maintainer) hỏi lại model.
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: findingId, required: true, schema: { type: string } }
   *     requestBody:
   *       content: { application/json: { schema: { type: object, properties: { refresh: { type: boolean } } } } }
   *     responses:
   *       200: { description: "{ finding } với explanation { text, model, at }" }
   *       429: { description: Dịch vụ AI đang bận }
   *       503: { description: Dịch vụ AI không dùng được }
   */
  router.post("/:id/conformance/findings/:findingId/explanation", auth, projectRoleMiddleware("read"), controller.explanation);

  return router;
}
