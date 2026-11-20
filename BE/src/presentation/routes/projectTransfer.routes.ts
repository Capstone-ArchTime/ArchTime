import { Router, type RequestHandler } from "express";
import type { TransferProjectUseCase } from "../../application/use-cases/projects/TransferProjectUseCase.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { ProjectAction } from "../middlewares/projectRole.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

/** Mounted at /api/projects: moving a personal workspace into an organization (RF-11, UC-29). */
export function createProjectTransferRouter(transfer: TransferProjectUseCase, jwtTokenService: JwtTokenService, projectRoleMiddleware: (action: ProjectAction) => RequestHandler): Router {
  const router = Router();
  const auth = createAuthenticateMiddleware(jwtTokenService);
  const userId = (req: Parameters<RequestHandler>[0]) => {
    const id = req.user?.userId;
    if (!id) throw new UnauthorizedError();
    return id;
  };

  /**
   * @swagger
   * /api/projects/{id}/transfer:
   *   get:
   *     tags: [Projects]
   *     summary: Xem trước việc chuyển dự án cá nhân vào tổ chức (UC-29)
   *     description: Cho biết tổ chức đã có repo này chưa (MSG18) và thành viên nào sẽ mất quyền truy cập.
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *       - { in: query, name: organizationId, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: "{ project, organization, duplicate, membersLosingAccess }" }
   *       403: { description: Không phải chủ dự án, hoặc không phải chủ tổ chức }
   *       409: { description: Dự án đã thuộc một tổ chức }
   *   post:
   *     tags: [Projects]
   *     summary: Chuyển dự án cá nhân vào tổ chức, cùng snapshot, evidence, workspace và path (RF-11, UC-29)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content: { application/json: { schema: { type: object, required: [organizationId], properties: { organizationId: { type: string } } } } }
   *     responses:
   *       200: { description: "{ project, preview }" }
   *       409: { description: "MSG18: tổ chức đã có workspace cho repo này; hoặc dự án đã thuộc một tổ chức" }
   */
  router.get("/:id/transfer", auth, projectRoleMiddleware("owner"), async (req, res, next) => {
    try { sendSuccess(res, await transfer.preview({ projectId: req.params.id, organizationId: req.query.organizationId, userId: userId(req) })); } catch (error) { next(error); }
  });
  router.post("/:id/transfer", auth, projectRoleMiddleware("owner"), async (req, res, next) => {
    try {
      sendSuccess(res, await transfer.execute({ projectId: req.params.id, organizationId: req.body?.organizationId, userId: userId(req) }), { message: "Workspace moved into the organization." });
    } catch (error) { next(error); }
  });
  return router;
}
