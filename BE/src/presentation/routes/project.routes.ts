import { Router, type RequestHandler } from "express";
import type { ProjectController } from "../controllers/ProjectController.js";
import type { MemberController } from "../controllers/MemberController.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { ProjectMaintainerController } from "../controllers/ProjectMaintainerController.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import type { ProjectAction } from "../middlewares/projectRole.js";

export function createProjectRouter(
  projectController: ProjectController,
  jwtTokenService: JwtTokenService,
  memberController?: MemberController,
  projectRoleMiddleware?: (action: ProjectAction) => RequestHandler,
  workspaceController?: WorkspaceController,
  pmController?: ProjectMaintainerController,
): Router {

  const router = Router();

  // Apply auth middleware to all project routes
  router.use(createAuthenticateMiddleware(jwtTokenService));

  const checkRole = (action: ProjectAction): RequestHandler => {
    return projectRoleMiddleware
      ? projectRoleMiddleware(action)
      : (_req, _res, next) => next();
  };

  /**
   * @swagger
   * tags:
   *   name: Projects
   *   description: Quản lý dự án, kho code và thành viên
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
   *       - in: query
   *         name: scope
   *         schema: { type: string, enum: [all, managed, participating, owned], default: all }
   *         description: Phạm vi dự án cần lấy (managed = quản lý, participating = tham gia, owned = sở hữu, all = tất cả)
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *         description: Từ khóa tìm kiếm theo tên hoặc mô tả dự án
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
   *     summary: Lấy danh sách mining jobs (có phân trang)
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

  // ── Team Member Routes (for Maintainer dashboard) ──
  if (memberController) {
    /**
     * @swagger
     * /api/projects/team/members:
     *   get:
     *     tags: [Projects]
     *     summary: Lấy danh sách thành viên nhóm tổng hợp (theo quyền quản trị hoặc dự án)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: query
     *         name: project
     *         schema: { type: string }
     *         description: ID dự án hoặc "all"
     *       - in: query
     *         name: q
     *         schema: { type: string }
     *         description: Tìm kiếm theo tên hoặc email
     *     responses:
     *       200:
     *         description: Danh sách thành viên nhóm
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     */
    router.get("/team/members", memberController.getTeamMembers);
  }

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
   *   get:
   *     tags: [Projects]
   *     summary: Lấy thông tin chi tiết một dự án
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
   *         description: Thông tin chi tiết dự án kèm quyền người dùng
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.get("/:id", checkRole("read"), projectController.getProjectById);

  /**
   * @swagger
   * /api/projects/{id}:
   *   delete:
   *     tags: [Projects]
   *     summary: Xóa dự án (Chỉ Owner / Maintainer / Admin)
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
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.delete("/:id", checkRole("admin"), projectController.deleteProject);

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
   *     summary: Bắt đầu mining Git history của dự án (Chỉ Maintainer / Admin)
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
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post("/:id/mine", checkRole("write"), projectController.mineProject);

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
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   */
  router.get("/:id/snapshots", checkRole("read"), projectController.getSnapshots);

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
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   */
  router.get(
    "/:id/snapshots/compare",
    checkRole("read"),
    projectController.compareSnapshots,
  );

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
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   */
  router.get("/:id/evidences", checkRole("read"), projectController.getEvidences);

  // ── Project Member Management Endpoints ──
  if (memberController) {
    /**
     * @swagger
     * /api/projects/{id}/members:
     *   get:
     *     tags: [Projects]
     *     summary: Lấy danh sách thành viên của dự án
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Danh sách thành viên dự án
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     *       403:
     *         $ref: '#/components/responses/Forbidden'
     *   post:
     *     tags: [Projects]
     *     summary: Mời thành viên mới vào dự án (Chỉ Maintainer / Admin)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [email, name]
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *                 example: dev@example.com
     *               name:
     *                 type: string
     *                 example: Alice Developer
     *               role:
     *                 type: string
     *                 enum: [developer-analyst, project-maintainer]
     *                 default: developer-analyst
     *     responses:
     *       201:
     *         description: Đã mời thành viên thành công
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       400:
     *         $ref: '#/components/responses/ValidationError'
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     *       403:
     *         $ref: '#/components/responses/Forbidden'
     */
    router.get("/:id/members", checkRole("read"), memberController.getProjectMembers);
    router.post("/:id/members", checkRole("admin"), memberController.inviteMember);

    /**
     * @swagger
     * /api/projects/{id}/members/{memberId}:
     *   patch:
     *     tags: [Projects]
     *     summary: Cập nhật vai trò thành viên trong dự án (Chỉ Maintainer / Admin)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: memberId
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [role]
     *             properties:
     *               role:
     *                 type: string
     *                 enum: [developer-analyst, project-maintainer]
     *     responses:
     *       200:
     *         description: Đã cập nhật vai trò thành công
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       400:
     *         $ref: '#/components/responses/ValidationError'
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     *       403:
     *         $ref: '#/components/responses/Forbidden'
     *   delete:
     *     tags: [Projects]
     *     summary: Xóa thành viên hoặc thu hồi lời mời (Chỉ Maintainer / Admin)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: memberId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Đã xóa thành viên thành công
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     *       403:
     *         $ref: '#/components/responses/Forbidden'
     */
    router.patch(
      "/:id/members/:memberId",
      checkRole("admin"),
      memberController.updateMemberRole,
    );
    router.delete(
      "/:id/members/:memberId",
      checkRole("admin"),
      memberController.removeMember,
    );
  }

  if (workspaceController) {
    /**
     * @swagger
     * /api/projects/{id}/workspace:
     *   get:
     *     tags: [Workspace]
     *     summary: Lấy dữ liệu kiến trúc workspace của dự án (diagram, rules, decisions)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *         description: Project ID
     *     responses:
     *       200:
     *         description: Dữ liệu workspace của dự án
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *             example:
     *               success: true
     *               data:
     *                 workspace:
     *                   id: "64f1a2b3c4d5e6f7a8b9c0d1"
     *                   projectId: "64f1a2b3c4d5e6f7a8b9c0d1"
     *                   revision: 1
     *                   diagram:
     *                     components: []
     *                     dependencies: []
     *                     revision: 1
     *                     confirmedAt: null
     *                   rules: []
     *                   decisions: []
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     *       403:
     *         $ref: '#/components/responses/Forbidden'
     *       404:
     *         $ref: '#/components/responses/NotFound'
   *   put:
   *     tags: [Workspace]
   *     summary: Lưu dữ liệu kiến trúc workspace (kiểm soát revision - Optimistic Concurrency Control)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: Project ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [diagram]
   *             properties:
   *               expectedRevision:
   *                 type: integer
   *                 example: 1
   *                 description: Revision hiện tại mà client đang có để kiểm tra xung đột
   *               diagram:
   *                 $ref: '#/components/schemas/WorkspaceDiagram'
   *               rules:
   *                 type: array
   *                 items:
   *                   $ref: '#/components/schemas/WorkspaceRule'
   *               decisions:
   *                 type: array
   *                 items:
   *                   $ref: '#/components/schemas/WorkspaceDecision'
   *     responses:
   *       200:
   *         description: Lưu dữ liệu workspace thành công
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       409:
   *         description: Xung đột revision (Optimistic Concurrency Control)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error:
   *                 code: CONFLICT
   *                 message: "Workspace revision conflict: expected revision 1, but current revision on server is 2. Please reload to avoid overwriting newer changes."
   */
    router.get(
      "/:id/workspace",
      checkRole("read"),
      workspaceController.getWorkspace,
    );
    router.put(
      "/:id/workspace",
      checkRole("write"),
      workspaceController.saveWorkspace,
    );
  }

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
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               snapshotId: { type: string, description: "Snapshot cần vẽ (mặc định snapshot mới nhất)" }
   *               modelId: { type: string, description: "Model AI (GET /api/llm/models); bỏ trống = model mặc định do Admin chọn" }
   *     responses:
   *       202:
   *         description: Refine job đã được tạo
   *       400:
   *         description: Model không tồn tại, bị tắt hoặc không dành cho user
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         description: Admin đã tắt quyền chọn model
   */
  router.post("/:id/architecture/refine", projectController.refineArchitecture);

  /**
   * @swagger
   * /api/projects/{id}/architecture/runs:
   *   get:
   *     tags: [Projects]
   *     summary: Lịch sử các lần AI vẽ kiến trúc của project (model, token input/output/total, latency, cost, chất lượng)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: query, name: page, schema: { type: integer, default: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
   *     responses:
   *       200:
   *         description: "{ runs, totals, meta }"
   */
  router.get("/:id/architecture/runs", projectController.getArchitectureRuns);

  /**
   * @swagger
   * /api/projects/{id}/architecture/reference:
   *   get:
   *     tags: [Projects]
   *     summary: Kiến trúc tham chiếu (do người dùng khai báo) để chấm điểm sơ đồ (Adjusted Rand Index)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: "{ components: [{ name, prefixes }] }" } }
   *   put:
   *     tags: [Projects]
   *     summary: Lưu kiến trúc tham chiếu (danh sách rỗng = xoá)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               components:
   *                 type: array
   *                 items: { type: object, properties: { name: { type: string, example: "Domain" }, prefixes: { type: array, items: { type: string }, example: ["BE/src/domain/"] } } }
   *     responses: { 200: { description: OK } }
   */
  router.get("/:id/architecture/reference", projectController.getArchitectureReference);
  router.put("/:id/architecture/reference", projectController.saveArchitectureReference);

  // ────────────────────────────────────────────────────────────
  // Project Maintainer Routes (PM-01 to PM-07)
  // ────────────────────────────────────────────────────────────
  if (pmController) {
    /**
     * @swagger
     * /api/projects/{id}/dashboard:
     *   get:
     *     tags: [Projects - Dashboard]
     *     summary: Lấy dữ liệu tổng quan và chỉ số sức khỏe dự án (PM-01)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Dữ liệu dashboard dự án
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ProjectDashboard'
     */
    router.get("/:id/dashboard", checkRole("read"), pmController.getDashboard);

    /**
     * @swagger
     * /api/projects/{id}/diagram:
     *   get:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Lấy sơ đồ thành phần kiến trúc dự án (PM-02)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Sơ đồ thành phần hiện tại
     *   put:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Lưu bản nháp sơ đồ thành phần kiến trúc (PM-02)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [diagram]
     *             properties:
     *               expectedRevision: { type: integer, example: 1 }
     *               diagram: { $ref: '#/components/schemas/WorkspaceDiagram' }
     *     responses:
     *       200:
     *         description: Lưu sơ đồ thành công
     */
    router.get("/:id/diagram", checkRole("read"), pmController.getDiagram);
    router.put("/:id/diagram", checkRole("write"), pmController.saveDiagram);

    /**
     * @swagger
     * /api/projects/{id}/diagram/confirm:
     *   post:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Xác nhận sơ đồ kiến trúc chính thức (PM-02)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Sơ đồ đã được xác nhận
     */
    router.post("/:id/diagram/confirm", checkRole("write"), pmController.confirmDiagram);

    /**
     * @swagger
     * /api/projects/{id}/rules:
     *   get:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Lấy danh sách quy tắc kiến trúc (PM-03)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: query
     *         name: search
     *         schema: { type: string }
     *       - in: query
     *         name: enabled
     *         schema: { type: boolean }
     *       - in: query
     *         name: constraint
     *         schema: { type: string, enum: [forbidden, required] }
     *       - in: query
     *         name: severity
     *         schema: { type: string, enum: [error, warning] }
     *     responses:
     *       200:
     *         description: Danh sách quy tắc
     *   post:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Tạo quy tắc kiến trúc mới (PM-03)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [name, source, target, constraint]
     *             properties:
     *               name: { type: string, example: "Web cannot call DB directly" }
     *               source: { type: string, example: "web" }
     *               target: { type: string, example: "db" }
     *               constraint: { type: string, enum: [forbidden, required], example: "forbidden" }
     *               severity: { type: string, enum: [error, warning], default: "error" }
     *               rationale: { type: string, example: "Must go through API gateway" }
     *               enabled: { type: boolean, default: true }
     *     responses:
     *       201:
     *         description: Quy tắc đã tạo
     */
    router.get("/:id/rules", checkRole("read"), pmController.getRules);
    router.post("/:id/rules", checkRole("write"), pmController.createRule);

    /**
     * @swagger
     * /api/projects/{id}/rules/{ruleId}:
     *   put:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Cập nhật quy tắc kiến trúc (PM-03)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: ruleId
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name: { type: string }
     *               source: { type: string }
     *               target: { type: string }
     *               constraint: { type: string, enum: [forbidden, required] }
     *               severity: { type: string, enum: [error, warning] }
     *               rationale: { type: string }
     *               enabled: { type: boolean }
     *     responses:
     *       200:
     *         description: Quy tắc đã cập nhật
     *   delete:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Xóa quy tắc kiến trúc (PM-03)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: ruleId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Quy tắc đã xóa
     */
    router.put("/:id/rules/:ruleId", checkRole("write"), pmController.updateRule);
    router.delete("/:id/rules/:ruleId", checkRole("write"), pmController.deleteRule);

    /**
     * @swagger
     * /api/projects/{id}/rules/{ruleId}/toggle:
     *   patch:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Bật hoặc tắt quy tắc kiến trúc (PM-03)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: ruleId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Trạng thái quy tắc đã thay đổi
     */
    router.patch("/:id/rules/:ruleId/toggle", checkRole("write"), pmController.toggleRule);

    /**
     * @swagger
     * /api/projects/{id}/rules/evaluate:
     *   get:
     *     tags: [Projects - Diagram & Rules]
     *     summary: Đánh giá tự động mức độ tuân thủ quy tắc kiến trúc (PM-03)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Kết quả đánh giá tuân thủ quy tắc
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/RuleEvaluationSummary'
     */
    router.get("/:id/rules/evaluate", checkRole("read"), pmController.evaluateRules);

    /**
     * @swagger
     * /api/projects/{id}/decisions:
     *   get:
     *     tags: [Projects - Decisions (ADR)]
     *     summary: Lấy danh sách quyết định thiết kế kiến trúc (ADR) (PM-04)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: query
     *         name: search
     *         schema: { type: string }
     *       - in: query
     *         name: status
     *         schema: { type: string, enum: [Proposed, Accepted, Deprecated] }
     *       - in: query
     *         name: page
     *         schema: { type: integer, default: 1 }
     *       - in: query
     *         name: limit
     *         schema: { type: integer, default: 10 }
     *     responses:
     *       200:
     *         description: Danh sách quyết định kiến trúc
     *   post:
     *     tags: [Projects - Decisions (ADR)]
     *     summary: Tạo quyết định thiết kế kiến trúc mới (PM-04)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [title, context, decision]
     *             properties:
     *               title: { type: string, example: "Use PostgreSQL for Datastore" }
     *               context: { type: string, example: "Need transactional ACID guarantees" }
     *               decision: { type: string, example: "Adopt PostgreSQL 16" }
     *               alternatives: { type: string, example: "MongoDB, MySQL" }
     *               consequences: { type: string, example: "Requires schema migrations" }
     *               status: { type: string, enum: [Proposed, Accepted, Deprecated], default: "Proposed" }
     *               componentIds: { type: array, items: { type: string }, example: ["db"] }
     *     responses:
     *       201:
     *         description: Quyết định thiết kế đã tạo
     */
    router.get("/:id/decisions", checkRole("read"), pmController.getDecisions);
    router.post("/:id/decisions", checkRole("write"), pmController.createDecision);

    /**
     * @swagger
     * /api/projects/{id}/decisions/{decisionId}:
     *   get:
     *     tags: [Projects - Decisions (ADR)]
     *     summary: Xem chi tiết quyết định thiết kế kiến trúc (PM-04)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: decisionId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Chi tiết quyết định thiết kế
     *   put:
     *     tags: [Projects - Decisions (ADR)]
     *     summary: Cập nhật quyết định thiết kế kiến trúc (PM-04)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: decisionId
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               title: { type: string }
     *               context: { type: string }
     *               decision: { type: string }
     *               alternatives: { type: string }
     *               consequences: { type: string }
     *               status: { type: string, enum: [Proposed, Accepted, Deprecated] }
     *               componentIds: { type: array, items: { type: string } }
     *     responses:
     *       200:
     *         description: Quyết định đã được cập nhật
     *   delete:
     *     tags: [Projects - Decisions (ADR)]
     *     summary: Xóa quyết định thiết kế kiến trúc (PM-04)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: decisionId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Quyết định đã bị xóa
     */
    router.get("/:id/decisions/:decisionId", checkRole("read"), pmController.getDecisionDetail);
    router.put("/:id/decisions/:decisionId", checkRole("write"), pmController.updateDecision);
    router.delete("/:id/decisions/:decisionId", checkRole("write"), pmController.deleteDecision);

    /**
     * @swagger
     * /api/projects/{id}/approvals:
     *   get:
     *     tags: [Projects - Approvals]
     *     summary: Lấy danh sách yêu cầu xét duyệt kiến trúc (PM-05)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: query
     *         name: status
     *         schema: { type: string, enum: [pending, approved, rejected] }
     *       - in: query
     *         name: type
     *         schema: { type: string, enum: [architecture_change, rule_exception, snapshot_baseline, member_invite] }
     *       - in: query
     *         name: page
     *         schema: { type: integer, default: 1 }
     *       - in: query
     *         name: limit
     *         schema: { type: integer, default: 10 }
     *     responses:
     *       200:
     *         description: Danh sách yêu cầu xét duyệt
     *   post:
     *     tags: [Projects - Approvals]
     *     summary: Gửi yêu cầu xét duyệt mới (PM-05)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [title]
     *             properties:
     *               title: { type: string, example: "Refactor order processing module" }
     *               description: { type: string }
     *               type: { type: string, enum: [architecture_change, rule_exception, snapshot_baseline, member_invite], default: "architecture_change" }
     *               data: { type: object }
     *     responses:
     *       201:
     *         description: Yêu cầu xét duyệt đã tạo
     */
    router.get("/:id/approvals", checkRole("read"), pmController.getApprovals);
    router.post("/:id/approvals", checkRole("write"), pmController.createApproval);

    /**
     * @swagger
     * /api/projects/{id}/approvals/{approvalId}:
     *   get:
     *     tags: [Projects - Approvals]
     *     summary: Xem chi tiết yêu cầu xét duyệt (PM-05)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: approvalId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Chi tiết yêu cầu xét duyệt
     */
    router.get("/:id/approvals/:approvalId", checkRole("read"), pmController.getApprovalDetail);

    /**
     * @swagger
     * /api/projects/{id}/approvals/{approvalId}/approve:
     *   post:
     *     tags: [Projects - Approvals]
     *     summary: Chấp thuận yêu cầu xét duyệt kiến trúc (PM-05)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: approvalId
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               reviewNote: { type: string, example: "Approved after verifying test coverage" }
     *     responses:
     *       200:
     *         description: Yêu cầu đã được chấp thuận
     */
    router.post("/:id/approvals/:approvalId/approve", checkRole("admin"), pmController.approveRequest);

    /**
     * @swagger
     * /api/projects/{id}/approvals/{approvalId}/reject:
     *   post:
     *     tags: [Projects - Approvals]
     *     summary: Từ chối yêu cầu xét duyệt kiến trúc (PM-05)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: approvalId
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [reviewNote]
     *             properties:
     *               reviewNote: { type: string, example: "Violates architecture layering rules" }
     *     responses:
     *       200:
     *         description: Yêu cầu đã bị từ chối
     */
    router.post("/:id/approvals/:approvalId/reject", checkRole("admin"), pmController.rejectRequest);

    /**
     * @swagger
     * /api/projects/{id}/members/invite:
     *   post:
     *     tags: [Projects - Invitations]
     *     summary: Gửi lời mời tham gia dự án qua email (PM-06)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [email]
     *             properties:
     *               email: { type: string, format: email, example: "architect@archtime.io" }
     *               role: { type: string, enum: [project-maintainer, developer-analyst], default: "developer-analyst" }
     *     responses:
     *       201:
     *         description: Lời mời đã được gửi
     */
    router.post("/:id/members/invite", checkRole("admin"), pmController.inviteMember);

    /**
     * @swagger
     * /api/projects/{id}/invitations:
     *   get:
     *     tags: [Projects - Invitations]
     *     summary: Lấy danh sách lời mời đang chờ xử lý của dự án (PM-06)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Danh sách lời mời
     */
    router.get("/:id/invitations", checkRole("admin"), pmController.getInvitations);

    /**
     * @swagger
     * /api/projects/{id}/invitations/{invitationId}:
     *   delete:
     *     tags: [Projects - Invitations]
     *     summary: Hủy lời mời tham gia dự án (PM-06)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: invitationId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Lời mời đã hủy
     */
    router.delete("/:id/invitations/:invitationId", checkRole("admin"), pmController.cancelInvitation);

    /**
     * @swagger
     * /api/projects/{id}/reports:
     *   get:
     *     tags: [Projects - Reports]
     *     summary: Lấy lịch sử báo cáo tổng hợp kiến trúc dự án (PM-07)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Lịch sử báo cáo
     */
    router.get("/:id/reports", checkRole("read"), pmController.getReports);

    /**
     * @swagger
     * /api/projects/{id}/reports/generate:
     *   post:
     *     tags: [Projects - Reports]
     *     summary: Tạo báo cáo tổng hợp kiến trúc dự án (PM-07)
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
     *               title: { type: string, example: "Monthly Architecture Compliance" }
     *               type: { type: string, enum: [architecture_summary, rules_compliance, evolution_history, full_audit], default: "architecture_summary" }
     *     responses:
     *       201:
     *         description: Báo cáo đã tạo thành công
     */
    router.post("/:id/reports/generate", checkRole("write"), pmController.generateReport);

    /**
     * @swagger
     * /api/projects/{id}/reports/{reportId}:
     *   get:
     *     tags: [Projects - Reports]
     *     summary: Xem chi tiết báo cáo kiến trúc (PM-07)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: reportId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Chi tiết báo cáo
     */
    router.get("/:id/reports/:reportId", checkRole("read"), pmController.getReportDetail);

    /**
     * @swagger
     * /api/projects/{id}/reports/{reportId}/download:
     *   get:
     *     tags: [Projects - Reports]
     *     summary: Tải báo cáo kiến trúc định dạng Markdown (PM-07)
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *       - in: path
     *         name: reportId
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: File markdown của báo cáo
     */
    router.get("/:id/reports/:reportId/download", checkRole("read"), pmController.downloadReport);
  }

  return router;
}
