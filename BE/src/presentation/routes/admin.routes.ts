import { Router } from "express";
import type { AdminUserController } from "../controllers/AdminUserController.js";
import type { AdminJobController } from "../controllers/AdminJobController.js";
import type { AdminAuditController } from "../controllers/AdminAuditController.js";
import type { AdminSettingsController } from "../controllers/AdminSettingsController.js";
import type { AdminMetricsController } from "../controllers/AdminMetricsController.js";
import type { AdminLlmController } from "../controllers/LlmController.js";
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
  llmController: AdminLlmController;
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
    llmController,
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

  // ────────────────────────────────────────────────────────────
  // AI models: registry, health, usage, comparison, benchmark
  // ────────────────────────────────────────────────────────────

  /**
   * @swagger
   * /api/admin/llm-models:
   *   get:
   *     tags: [Admin - AI Models]
   *     summary: Danh sách model AI (không bao giờ trả API key, chỉ hasApiKey + apiKeyLast4) kèm usage 30 ngày
   *     security: [{ BearerAuth: [] }]
   *     responses: { 200: { description: "{ models, defaultModelId, allowUserModelChoice, scoring, serverConfig }" } }
   *   post:
   *     tags: [Admin - AI Models]
   *     summary: Thêm model
   *     security: [{ BearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [displayName, provider, model]
   *             properties:
   *               key: { type: string, example: "claude-sonnet-5-5" }
   *               displayName: { type: string, example: "Claude Sonnet 5.5" }
   *               provider: { type: string, enum: [anthropic, gemini, openai-compatible] }
   *               model: { type: string, example: "claude-sonnet-5-5" }
   *               baseUrl: { type: string, example: "http://localhost:11434/v1" }
   *               apiKey: { type: string, description: "Mã hoá AES-256-GCM bằng LLM_SECRET_KEY" }
   *               pricing: { type: object, properties: { inputPerMTok: { type: number }, outputPerMTok: { type: number }, cacheReadPerMTok: { type: number } } }
   *               options: { type: object, properties: { effort: { type: string, enum: [low, medium, high] }, maxTokens: { type: integer }, timeoutMs: { type: integer }, temperature: { type: number }, jsonMode: { type: boolean } } }
   *               enabled: { type: boolean }
   *               visibleToUsers: { type: boolean }
   *               isDefault: { type: boolean }
   *     responses: { 201: { description: Created }, 409: { description: "Key đã tồn tại" } }
   */
  router.get("/llm-models", llmController.list);
  router.post("/llm-models", llmController.create);

  /**
   * @swagger
   * /api/admin/llm-models/leaderboard:
   *   get:
   *     tags: [Admin - AI Models]
   *     summary: So sánh model (ModelScore 0-100, breakdown quality/stability/latency/cost/tokens) và model đề xuất
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: query, name: mode, schema: { type: string, enum: [refine, name-only] } }
   *       - { in: query, name: windowDays, schema: { type: integer } }
   *       - { in: query, name: purpose, schema: { type: string, enum: [user, benchmark, all] } }
   *       - { in: query, name: preset, schema: { type: string, enum: [balanced, quality, budget, custom] } }
   *     responses: { 200: { description: OK } }
   * /api/admin/llm-models/test-all:
   *   post:
   *     tags: [Admin - AI Models]
   *     summary: Health check mọi model đang bật
   *     security: [{ BearerAuth: [] }]
   *     responses: { 200: { description: OK } }
   */
  router.get("/llm-models/leaderboard", llmController.leaderboard);
  router.post("/llm-models/test-all", llmController.testAll);

  /**
   * @swagger
   * /api/admin/llm-models/discover:
   *   post:
   *     tags: [Admin - AI Models]
   *     summary: Liệt kê model nhà cung cấp có cho một API key (đánh dấu model chat / miễn phí / đã thêm). Key chỉ dùng cho request này
   *     security: [{ BearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [provider]
   *             properties:
   *               provider: { type: string, enum: [anthropic, gemini, openai-compatible] }
   *               baseUrl: { type: string, example: "https://api.groq.com/openai/v1" }
   *               apiKey: { type: string }
   *               fromModelId: { type: string, description: "Dùng key đã lưu của model này" }
   *     responses: { 200: { description: "{ models: [{ id, chat, reason, free, pricing, contextWindow, registered }] }" } }
   */
  router.post("/llm-models/discover", llmController.discover);

  /**
   * @swagger
   * /api/admin/llm-models/{id}:
   *   patch:
   *     tags: [Admin - AI Models]
   *     summary: Sửa model (apiKey null = xoá key; bỏ trống = giữ nguyên)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: OK } }
   *   delete:
   *     tags: [Admin - AI Models]
   *     summary: Xoá model (model đã có lịch sử chạy thì chỉ tắt và ẩn)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: "{ deleted, archived }" } }
   * /api/admin/llm-models/{id}/default:
   *   post:
   *     tags: [Admin - AI Models]
   *     summary: Đặt làm model mặc định (dùng khi user không chọn model)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: OK } }
   * /api/admin/llm-models/{id}/test:
   *   post:
   *     tags: [Admin - AI Models]
   *     summary: Health check (gửi prompt rất nhỏ, đo latency và token, cập nhật health)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: "{ status, latencyMs, usage, error }" } }
   */
  router.patch("/llm-models/:id", llmController.update);
  router.delete("/llm-models/:id", llmController.remove);
  router.post("/llm-models/:id/default", llmController.setDefault);
  router.post("/llm-models/:id/test", llmController.test);

  /**
   * @swagger
   * /api/admin/llm-usage:
   *   get:
   *     tags: [Admin - AI Models]
   *     summary: Thống kê token / cost / số lần chạy / lỗi theo ngày, model hoặc user
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: query, name: from, schema: { type: string, format: date } }
   *       - { in: query, name: to, schema: { type: string, format: date } }
   *       - { in: query, name: modelId, schema: { type: string } }
   *       - { in: query, name: userId, schema: { type: string } }
   *       - { in: query, name: groupBy, schema: { type: string, enum: [day, model, user] } }
   *     responses: { 200: { description: "{ totals, groupBy, rows }" } }
   */
  router.get("/llm-usage", llmController.usage);

  /**
   * @swagger
   * /api/admin/llm-benchmarks:
   *   get:
   *     tags: [Admin - AI Models]
   *     summary: Các lần benchmark đã chạy
   *     security: [{ BearerAuth: [] }]
   *     responses: { 200: { description: OK } }
   *   post:
   *     tags: [Admin - AI Models]
   *     summary: Chạy 2-8 model trên cùng một snapshot để so sánh công bằng (không ghi đè kiến trúc của project)
   *     security: [{ BearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [projectId, snapshotId, modelIds]
   *             properties:
   *               projectId: { type: string }
   *               snapshotId: { type: string }
   *               modelIds: { type: array, items: { type: string } }
   *     responses: { 202: { description: "{ jobId, benchmarkId }" } }
   * /api/admin/llm-benchmarks/targets:
   *   get:
   *     tags: [Admin - AI Models]
   *     summary: Project và snapshot có thể dùng để benchmark
   *     security: [{ BearerAuth: [] }]
   *     responses: { 200: { description: OK } }
   * /api/admin/llm-benchmarks/{id}:
   *   get:
   *     tags: [Admin - AI Models]
   *     summary: Kết quả một lần benchmark
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: OK } }
   */
  router.get("/llm-benchmarks", llmController.benchmarks);
  router.post("/llm-benchmarks", llmController.startBenchmark);
  router.get("/llm-benchmarks/targets", llmController.benchmarkTargets);
  router.get("/llm-benchmarks/:id", llmController.benchmark);

  return router;
}
