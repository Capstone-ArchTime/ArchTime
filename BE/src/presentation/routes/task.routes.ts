import { Router, type RequestHandler } from "express";
import type { ImportTasksUseCase, LinkCommitsToTasksUseCase, ListTasksUseCase } from "../../application/use-cases/tasks/TaskUseCases.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { ProjectAction } from "../middlewares/projectRole.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export interface TaskUseCases {
  list: ListTasksUseCase;
  importTasks: ImportTasksUseCase;
  link: LinkCommitsToTasksUseCase;
}

/**
 * @swagger
 * tags:
 *   name: Tasks
 *   description: Task và sprint của dự án, nhập từ file export của Jira, liên kết với commit (F-13, RF-07, UC-36 – UC-39)
 */
/** Mounted at /api/projects. Reading needs "read"; importing and re-linking are maintainer work ("write"). */
export function createTaskRouter(useCases: TaskUseCases, jwtTokenService: JwtTokenService, projectRoleMiddleware: (action: ProjectAction) => RequestHandler): Router {
  const router = Router();
  const auth = createAuthenticateMiddleware(jwtTokenService);

  /**
   * @swagger
   * /api/projects/{id}/tasks:
   *   get:
   *     tags: [Tasks]
   *     summary: Danh sách task (kể cả task đã bị đánh dấu removed), sprint kèm tiến độ Done / tổng, commit liên quan
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses:
   *       200: { description: "{ tasks: [{ key, summary, status, statusCategory, assignee, storyPoints, sprintId, sprintName, removed, commits }], sprints: [{ sprintId, name, state, progress: { done, total, percent } }], backlog, totals, lastImportedAt }" }
   *       403: { description: Không có quyền đọc dự án }
   */
  router.get("/:id/tasks", auth, projectRoleMiddleware("read"), async (req, res, next) => {
    try { sendSuccess(res, await useCases.list.execute(req.params.id)); } catch (error) { next(error); }
  });

  /**
   * @swagger
   * /api/projects/{id}/tasks/import:
   *   post:
   *     tags: [Tasks]
   *     summary: Nhập task và sprint từ file JSON export của Jira (UC-37)
   *     description: >
   *       Nhập lại không tạo task trùng (cập nhật theo key); task không còn trong file được đánh dấu removed.
   *       Cả file bị từ chối nếu có task thiếu key (MSG22) hoặc giá trị sai kiểu; khi đó không ghi gì.
   *       Gửi nội dung file trong `file` (chuỗi JSON) hoặc đối tượng đã parse trong `export`.
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     requestBody:
   *       required: true
   *       content: { application/json: { schema: { type: object, properties: { file: { type: string }, export: { type: object } } } } }
   *     responses:
   *       200: { description: "{ created, updated, unchanged, removed, restored, sprints, sprintsRemoved, links: { commits, linked, unknownKeys } }" }
   *       400: { description: "MSG22 (task thiếu key) hoặc file không hợp lệ; error.fields.messageId = MSG22" }
   *       403: { description: Chỉ maintainer được nhập }
   */
  router.post("/:id/tasks/import", auth, projectRoleMiddleware("write"), async (req, res, next) => {
    try {
      const file = req.body?.file ?? req.body?.export;
      sendSuccess(res, await useCases.importTasks.execute(req.params.id, file), { message: "Tasks imported." });
    } catch (error) { next(error); }
  });

  /**
   * @swagger
   * /api/projects/{id}/tasks/link:
   *   post:
   *     tags: [Tasks]
   *     summary: Liên kết lại mọi commit đã mine với task theo khoá trong commit message (ARCH-12, T22)
   *     security: [{ BearerAuth: [] }]
   *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
   *     responses:
   *       200: { description: "{ commits, linked, unknownKeys }" }
   */
  router.post("/:id/tasks/link", auth, projectRoleMiddleware("write"), async (req, res, next) => {
    try { sendSuccess(res, await useCases.link.relinkAll(req.params.id)); } catch (error) { next(error); }
  });

  return router;
}
