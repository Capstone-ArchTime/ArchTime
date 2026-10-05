import { Router } from "express";
import type { ProjectController } from "../controllers/ProjectController.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";

export function createProjectRouter(
  projectController: ProjectController,
  jwtTokenService: JwtTokenService
): Router {
  const router = Router();

  // Apply auth middleware to all project routes
  router.use(createAuthenticateMiddleware(jwtTokenService));

  /**
   * @swagger
   * tags:
   *   name: Projects
   *   description: Quản lý dự án và kho code
   */

  /**
   * @swagger
   * /api/projects:
   *   post:
   *     tags: [Projects]
   *     summary: Đăng ký dự án mới
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, repoUrl]
   *             properties:
   *               name:
   *                 type: string
   *                 example: My Awesome Project
   *               description:
   *                 type: string
   *                 example: A project about software evolution
   *               repoUrl:
   *                 type: string
   *                 format: uri
   *                 example: https://github.com/org/repo
   *               visibility:
   *                 type: string
   *                 enum: [public, private]
   *                 example: public
   *               token:
   *                 type: string
   *                 description: GitHub personal access token (chỉ cần nếu repo private)
   *     responses:
   *       201:
   *         description: Dự án đã được đăng ký
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { project: { id: "64f1...", name: "My Awesome Project", status: "pending" } }
   *               message: "Project registered successfully."
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *   get:
   *     tags: [Projects]
   *     summary: Lấy danh sách dự án của người dùng (có phân trang)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *         description: Số trang (bắt đầu từ 1)
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10, maximum: 100 }
   *         description: Số bản ghi mỗi trang
   *     responses:
   *       200:
   *         description: Danh sách dự án
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { projects: [] }
   *               meta: { page: 1, limit: 10, total: 3, totalPages: 1 }
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post("/", projectController.registerProject);
  router.get("/", projectController.getProjects);

  /**
   * @swagger
   * /api/projects/jobs:
   *   get:
   *     tags: [Projects]
   *     summary: Lấy danh sách tất cả mining jobs (có phân trang)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10, maximum: 100 }
   *     responses:
   *       200:
   *         description: Danh sách mining jobs
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { jobs: [] }
   *               meta: { page: 1, limit: 10, total: 0, totalPages: 0 }
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/jobs", projectController.getMiningJobs); // must be before /:id

  /**
   * @swagger
   * /api/projects/jobs/{jobId}/cancel:
   *   post:
   *     tags: [Projects]
   *     summary: Hủy một mining job đang chạy
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema: { type: string }
   *         description: ID của mining job
   *     responses:
   *       200:
   *         description: Job đã được hủy
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post("/jobs/:jobId/cancel", projectController.cancelMiningJob);

  /**
   * @swagger
   * /api/projects/{id}:
   *   delete:
   *     tags: [Projects]
   *     summary: Xóa dự án
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: ID của project
   *     responses:
   *       200:
   *         description: Dự án đã được xóa
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: null
   *               message: "Project deleted successfully."
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.delete("/:id", projectController.deleteProject);

  /**
   * @swagger
   * /api/projects/{id}/scan:
   *   post:
   *     tags: [Projects]
   *     summary: Quét (clone/fetch) repository và ghi nhận lịch sử commit
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       202:
   *         description: Scan job đã được tạo
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post("/:id/scan", projectController.scanProject);

  /**
   * @swagger
   * /api/projects/{id}/mine:
   *   post:
   *     tags: [Projects]
   *     summary: Bắt đầu mining Git history của dự án
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               mode:
   *                 type: string
   *                 enum: [range, remaining]
   *                 example: remaining
   *               since:
   *                 type: string
   *                 format: date
   *                 example: "2024-02-01"
   *               until:
   *                 type: string
   *                 format: date
   *                 example: "2024-02-29"
   *               force:
   *                 type: boolean
   *                 example: false
   *     responses:
   *       200:
   *         description: Mining job đã được tạo
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { jobId: "64f1..." }
   *               message: "Mining job started."
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post("/:id/mine", projectController.mineProject);

  /**
   * @swagger
   * /api/projects/{id}/mining:
   *   get:
   *     tags: [Projects]
   *     summary: Tổng quan tiến trình mining (coverage, remaining, active job)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Mining overview
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/:id/mining", projectController.getMiningOverview);

  /**
   * @swagger
   * /api/projects/{id}/mining/estimate:
   *   get:
   *     tags: [Projects]
   *     summary: Ước tính số commit trong khoảng thời gian chỉ định
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: since
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: until
   *         schema: { type: string, format: date }
   *     responses:
   *       200:
   *         description: Kết quả ước tính
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/:id/mining/estimate", projectController.estimateMining);

  /**
   * @swagger
   * /api/projects/{id}/snapshots:
   *   get:
   *     tags: [Projects]
   *     summary: Lấy danh sách snapshots của dự án (có phân trang, hỗ trợ summary)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10, maximum: 100 }
   *       - in: query
   *         name: summary
   *         schema: { type: string, enum: ["1", "true"] }
   *         description: Nếu "1" hoặc "true", loại bỏ nodes/edges để giảm dung lượng
   *     responses:
   *       200:
   *         description: Danh sách snapshots
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { snapshots: [] }
   *               meta: { page: 1, limit: 10, total: 0, totalPages: 0 }
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/:id/snapshots", projectController.getSnapshots);

  /**
   * @swagger
   * /api/projects/{id}/snapshots/compare:
   *   get:
   *     tags: [Projects]
   *     summary: So sánh hai snapshots
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: baseId
   *         required: true
   *         schema: { type: string }
   *         description: ID của snapshot gốc (cũ hơn)
   *       - in: query
   *         name: targetId
   *         required: true
   *         schema: { type: string }
   *         description: ID của snapshot đích (mới hơn)
   *     responses:
   *       200:
   *         description: Kết quả so sánh hai snapshots
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/:id/snapshots/compare", projectController.compareSnapshots);

  /**
   * @swagger
   * /api/projects/{id}/evidences:
   *   get:
   *     tags: [Projects]
   *     summary: Lấy danh sách evidences của dự án (có phân trang)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10, maximum: 100 }
   *     responses:
   *       200:
   *         description: Danh sách evidences
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { evidences: [] }
   *               meta: { page: 1, limit: 10, total: 0, totalPages: 0 }
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/:id/evidences", projectController.getEvidences);

  /**
   * @swagger
   * /api/projects/{id}/architecture:
   *   get:
   *     tags: [Projects]
   *     summary: Lấy bản đồ kiến trúc (architecture map) của snapshot
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: snapshotId
   *         schema: { type: string }
   *         description: ID snapshot cần xem (mặc định snapshot mới nhất)
   *     responses:
   *       200:
   *         description: Architecture map data
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *   post:
   *     tags: [Projects]
   *     summary: Tạo (generate) bản đồ kiến trúc từ snapshot
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Architecture map đã được tạo
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/:id/architecture", projectController.getArchitecture);
  router.post("/:id/architecture", projectController.generateArchitecture);

  /**
   * @swagger
   * /api/projects/{id}/architecture/refine:
   *   post:
   *     tags: [Projects]
   *     summary: Tinh chỉnh bản đồ kiến trúc bằng AI
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       202:
   *         description: Refine job đã được tạo
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post("/:id/architecture/refine", projectController.refineArchitecture);

  return router;
}
