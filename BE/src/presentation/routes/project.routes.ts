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
   * /api/projects/{id}/snapshots:
   *   get:
   *     tags: [Projects]
   *     summary: Lấy danh sách snapshots của dự án (có phân trang)
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

  router.post("/jobs/:jobId/cancel", projectController.cancelMiningJob);
  router.delete("/:id", projectController.deleteProject);
  router.post("/:id/scan", projectController.scanProject);
  router.post("/:id/mine", projectController.mineProject);
  router.get("/:id/mining", projectController.getMiningOverview);
  router.get("/:id/mining/estimate", projectController.estimateMining);
  router.get("/:id/snapshots", projectController.getSnapshots);
  router.get("/:id/snapshots/compare", projectController.compareSnapshots);
  router.get("/:id/evidences", projectController.getEvidences);
  router.get("/:id/architecture", projectController.getArchitecture);
  router.post("/:id/architecture", projectController.generateArchitecture);
  router.post("/:id/architecture/refine", projectController.refineArchitecture);

  // ────────────────────────────────────────────────────────────
  // Project Maintainer Routes (PM-01 to PM-07)
  // ────────────────────────────────────────────────────────────
  if (pmController) {
    // PM-01: Dashboard
    router.get("/:id/dashboard", checkRole("read"), pmController.getDashboard);

    // PM-02: Diagram
    router.get("/:id/diagram", checkRole("read"), pmController.getDiagram);
    router.put("/:id/diagram", checkRole("write"), pmController.saveDiagram);
    router.post("/:id/diagram/confirm", checkRole("write"), pmController.confirmDiagram);

    // PM-03: Architecture Rules & Evaluation
    router.get("/:id/rules", checkRole("read"), pmController.getRules);
    router.post("/:id/rules", checkRole("write"), pmController.createRule);
    router.put("/:id/rules/:ruleId", checkRole("write"), pmController.updateRule);
    router.delete("/:id/rules/:ruleId", checkRole("write"), pmController.deleteRule);
    router.patch("/:id/rules/:ruleId/toggle", checkRole("write"), pmController.toggleRule);
    router.get("/:id/rules/evaluate", checkRole("read"), pmController.evaluateRules);

    // PM-04: Design Decisions (ADR)
    router.get("/:id/decisions", checkRole("read"), pmController.getDecisions);
    router.post("/:id/decisions", checkRole("write"), pmController.createDecision);
    router.get("/:id/decisions/:decisionId", checkRole("read"), pmController.getDecisionDetail);
    router.put("/:id/decisions/:decisionId", checkRole("write"), pmController.updateDecision);
    router.delete("/:id/decisions/:decisionId", checkRole("write"), pmController.deleteDecision);

    // PM-05: Approval Queue
    router.get("/:id/approvals", checkRole("read"), pmController.getApprovals);
    router.post("/:id/approvals", checkRole("write"), pmController.createApproval);
    router.get("/:id/approvals/:approvalId", checkRole("read"), pmController.getApprovalDetail);
    router.post("/:id/approvals/:approvalId/approve", checkRole("admin"), pmController.approveRequest);
    router.post("/:id/approvals/:approvalId/reject", checkRole("admin"), pmController.rejectRequest);

    // PM-06: Team Invitations
    router.post("/:id/members/invite", checkRole("admin"), pmController.inviteMember);
    router.get("/:id/invitations", checkRole("admin"), pmController.getInvitations);
    router.delete("/:id/invitations/:invitationId", checkRole("admin"), pmController.cancelInvitation);

    // PM-07: Reports
    router.get("/:id/reports", checkRole("read"), pmController.getReports);
    router.post("/:id/reports/generate", checkRole("write"), pmController.generateReport);
    router.get("/:id/reports/:reportId", checkRole("read"), pmController.getReportDetail);
    router.get("/:id/reports/:reportId/download", checkRole("read"), pmController.downloadReport);
  }

  return router;
}
