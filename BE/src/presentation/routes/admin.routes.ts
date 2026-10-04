import { Router } from "express";
import type { AdminUserController } from "../controllers/AdminUserController.js";
import type { AdminJobController } from "../controllers/AdminJobController.js";
import type { AdminAuditController } from "../controllers/AdminAuditController.js";
import type { AdminSettingsController } from "../controllers/AdminSettingsController.js";
import type { AdminMetricsController } from "../controllers/AdminMetricsController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { UserRole } from "../../domain/entities/User.js";

export interface AdminControllersConfig {
  userController: AdminUserController;
  jobController: AdminJobController;
  auditController: AdminAuditController;
  settingsController: AdminSettingsController;
  metricsController: AdminMetricsController;
}

export function createAdminRouter(
  controllers: AdminControllersConfig,
  jwtTokenService: JwtTokenService,
): Router {
  const router = Router();
  const {
    userController,
    jobController,
    auditController,
    settingsController,
    metricsController,
  } = controllers;

  // All admin routes require authentication and SYSTEM_ADMINISTRATOR role
  router.use(createAuthenticateMiddleware(jwtTokenService));
  router.use(authorize(UserRole.SYSTEM_ADMINISTRATOR));

  // ────────────────────────────────────────────────────────────
  // 1. User Management (SA-02)
  // ────────────────────────────────────────────────────────────
  router.get("/users", userController.getUsers);
  router.post("/users/invite", userController.inviteUser);
  router.patch("/users/:id/role", userController.updateRole);
  router.patch("/users/:id/suspend", userController.suspendUser);
  router.patch("/users/:id/reactivate", userController.reactivateUser);

  // ────────────────────────────────────────────────────────────
  // 2. Mining Jobs Monitor (SA-03)
  // ────────────────────────────────────────────────────────────
  /**
   * @swagger
   * /api/admin/jobs:
   *   get:
   *     tags: [Admin - Mining Jobs]
   *     summary: Lấy toàn bộ danh sách mining jobs của hệ thống
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 10 }
   *       - in: query
   *         name: status
   *         schema: { type: string, enum: [queued, running, completed, failed, cancelled] }
   *       - in: query
   *         name: kind
   *         schema: { type: string, enum: [scan, mine, abstract] }
   *       - in: query
   *         name: projectId
   *         schema: { type: string }
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *         description: Tìm theo tên dự án hoặc email người yêu cầu
   *     responses:
   *       200:
   *         description: Danh sách mining jobs thành công
   */
  router.get("/jobs", jobController.getJobs);

  /**
   * @swagger
   * /api/admin/jobs/{id}/cancel:
   *   post:
   *     tags: [Admin - Mining Jobs]
   *     summary: Quản trị viên hủy một mining job đang chạy hoặc trong hàng đợi
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Hủy job thành công
   */
  router.post("/jobs/:id/cancel", jobController.cancelJob);

  // ────────────────────────────────────────────────────────────
  // 3. Audit Log (SA-05)
  // ────────────────────────────────────────────────────────────
  /**
   * @swagger
   * /api/admin/audit-logs:
   *   get:
   *     tags: [Admin - Audit Logs]
   *     summary: Lấy nhật ký kiểm toán hệ thống
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 20 }
   *       - in: query
   *         name: action
   *         schema: { type: string }
   *       - in: query
   *         name: userId
   *         schema: { type: string }
   *       - in: query
   *         name: targetType
   *         schema: { type: string }
   *       - in: query
   *         name: from
   *         schema: { type: string, format: date-time }
   *       - in: query
   *         name: to
   *         schema: { type: string, format: date-time }
   *     responses:
   *       200:
   *         description: Danh sách sự kiện kiểm toán
   */
  router.get("/audit-logs", auditController.getAuditLogs);

  // ────────────────────────────────────────────────────────────
  // 4. System Settings (SA-04)
  // ────────────────────────────────────────────────────────────
  /**
   * @swagger
   * /api/admin/settings:
   *   get:
   *     tags: [Admin - System Settings]
   *     summary: Lấy thông tin cấu hình hệ thống
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Cấu hình hệ thống hiện tại
   *   put:
   *     tags: [Admin - System Settings]
   *     summary: Cập nhật cấu hình hệ thống
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               maxConcurrentJobs: { type: integer, example: 5 }
   *               maxRepoSizeMb: { type: integer, example: 500 }
   *               miningTimeoutMinutes: { type: integer, example: 60 }
   *               defaultLlmProvider: { type: string, enum: [gemini, claude, openai, none] }
   *               maintenanceMode: { type: boolean }
   *               allowPublicRegistration: { type: boolean }
   *     responses:
   *       200:
   *         description: Cập nhật cấu hình thành công
   */
  router.get("/settings", settingsController.getSettings);
  router.put("/settings", settingsController.updateSettings);

  /**
   * @swagger
   * /api/admin/settings/api-keys:
   *   post:
   *     tags: [Admin - System Settings]
   *     summary: Tạo API key mới
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name]
   *             properties:
   *               name: { type: string, example: "CI Integration Key" }
   *     responses:
   *       201:
   *         description: API key tạo thành công
   */
  router.post("/settings/api-keys", settingsController.createApiKey);

  /**
   * @swagger
   * /api/admin/settings/api-keys/{id}:
   *   delete:
   *     tags: [Admin - System Settings]
   *     summary: Thu hồi API key
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Thu hồi API key thành công
   */
  router.delete("/settings/api-keys/:id", settingsController.revokeApiKey);

  // ────────────────────────────────────────────────────────────
  // 5. Dashboard Metrics & Services Status (SA-01)
  // ────────────────────────────────────────────────────────────
  /**
   * @swagger
   * /api/admin/metrics:
   *   get:
   *     tags: [Admin - Metrics & Health]
   *     summary: Lấy số liệu tài nguyên server và thống kê ứng dụng
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Metrics hệ thống
   */
  router.get("/metrics", metricsController.getMetrics);

  /**
   * @swagger
   * /api/admin/services/status:
   *   get:
   *     tags: [Admin - Metrics & Health]
   *     summary: Kiểm tra tình trạng kết nối các dịch vụ (DB, Git, SMTP, AI)
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Trạng thái các dịch vụ
   */
  router.get("/services/status", metricsController.getServicesStatus);

  /**
   * @swagger
   * /api/admin/logs:
   *   get:
   *     tags: [Admin - Metrics & Health]
   *     summary: Xem logs hệ thống phân trang
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 25 }
   *       - in: query
   *         name: level
   *         schema: { type: string, enum: [info, warn, error] }
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Logs hệ thống
   */
  router.get("/logs", metricsController.getLogs);

  return router;
}
