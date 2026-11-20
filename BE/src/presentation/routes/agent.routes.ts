import { Router, type RequestHandler } from "express";
import type { AgentController } from "../controllers/AgentController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { ProjectAction } from "../middlewares/projectRole.js";

/**
 * @swagger
 * tags:
 *   name: Agent
 *   description: Ngữ cảnh kiến trúc cho coding agent bằng project token (RF-09, UC-42 – UC-44, BR-30, BR-31)
 * components:
 *   securitySchemes:
 *     AgentToken:
 *       type: http
 *       scheme: bearer
 *       description: Project token dạng atk_..., tạo ở trang Agent Access
 */

/** Mounted at /api/agent: called by coding agents with a project token, never with a person's session. */
export function createAgentRouter(controller: AgentController): Router {
  const router = Router();
  /**
   * @swagger
   * /api/agent/context:
   *   get:
   *     tags: [Agent]
   *     summary: Ngữ cảnh kiến trúc của một file (UC-44)
   *     description: >
   *       Component chứa file (prefix dài nhất), các component được phép / bị cấm phụ thuộc, ADR liên quan và quy ước
   *       commit, lấy từ sơ đồ đã xác nhận. Không có source code (BR-31).
   *     security: [{ AgentToken: [] }]
   *     parameters: [{ in: query, name: file, required: true, schema: { type: string }, example: "BE/src/billing/invoice.ts" }]
   *     responses:
   *       200: { description: "{ file, component, allowedDependencies, forbiddenDependencies, forbiddenCallers, decisions, commitConvention, diagram, guidance }" }
   *       400: { description: Thiếu file hoặc đường dẫn không hợp lệ }
   *       401: { description: Token không hợp lệ, hết hạn hoặc đã thu hồi }
   *       409: { description: Sơ đồ chưa được xác nhận }
   */
  router.get("/context", controller.agentAuth, controller.context);
  /**
   * @swagger
   * /api/agent/agents-md:
   *   get:
   *     tags: [Agent]
   *     summary: AGENTS.md sinh từ sơ đồ đã xác nhận
   *     security: [{ AgentToken: [] }]
   *     responses: { 200: { description: text/markdown } }
   */
  router.get("/agents-md", controller.agentAuth, controller.agentsMd);
  return router;
}

/** Mounted at /api/projects: token management and the AGENTS.md download, for people. */
export function createAgentTokenRouter(controller: AgentController, jwtTokenService: JwtTokenService, projectRoleMiddleware: (action: ProjectAction) => RequestHandler): Router {
  const router = Router();
  const auth = createAuthenticateMiddleware(jwtTokenService);
  /**
   * @swagger
   * /api/projects/{id}/agent-tokens:
   *   get:
   *     tags: [Agent]
   *     summary: Danh sách project token (không bao giờ trả token hay hash)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: "{ tokens: [{ id, name, prefix, createdAt, expiresAt, revokedAt, lastUsedAt, status }] }" } }
   *   post:
   *     tags: [Agent]
   *     summary: Tạo project token (UC-42) - token chỉ hiện một lần
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content: { application/json: { schema: { type: object, required: [name], properties: { name: { type: string, maxLength: 80 }, expiresInDays: { type: integer, minimum: 1, maximum: 90, default: 30 } } } } }
   *     responses:
   *       200: { description: "{ token: 'atk_...', record }" }
   *       400: { description: Tên hoặc thời hạn không hợp lệ }
   *       409: { description: Đã có đủ 10 token đang hoạt động }
   */
  router.get("/:id/agent-tokens", auth, projectRoleMiddleware("admin"), controller.listTokens);
  router.post("/:id/agent-tokens", auth, projectRoleMiddleware("admin"), controller.createToken);
  /**
   * @swagger
   * /api/projects/{id}/agent-tokens/{tokenId}:
   *   delete:
   *     tags: [Agent]
   *     summary: Thu hồi project token (UC-43)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: path, name: tokenId, required: true, schema: { type: string } }
   *     responses: { 200: { description: "{ token }" }, 404: { description: Không có token đang hoạt động } }
   */
  router.delete("/:id/agent-tokens/:tokenId", auth, projectRoleMiddleware("admin"), controller.revokeToken);
  /**
   * @swagger
   * /api/projects/{id}/agents-md:
   *   get:
   *     tags: [Agent]
   *     summary: Tải AGENTS.md sinh từ sơ đồ đã xác nhận
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses: { 200: { description: text/markdown }, 409: { description: Sơ đồ chưa được xác nhận } }
   */
  router.get("/:id/agents-md", auth, projectRoleMiddleware("read"), controller.downloadAgentsMd);
  return router;
}
