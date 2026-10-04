import { Router } from "express";
import type { AdminUserController } from "../controllers/AdminUserController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { UserRole } from "../../domain/entities/User.js";

export function createAdminRouter(
  adminUserController: AdminUserController,
  jwtTokenService: JwtTokenService,
): Router {
  const router = Router();

  // All admin routes require authentication and SYSTEM_ADMINISTRATOR role
  router.use(createAuthenticateMiddleware(jwtTokenService));
  router.use(authorize(UserRole.SYSTEM_ADMINISTRATOR));

  /**
   * @swagger
   * tags:
   *   name: Admin - User Management
   *   description: Quản trị người dùng hệ thống (System Administrator)
   */

  /**
   * @swagger
   * /api/admin/users:
   *   get:
   *     tags: [Admin - User Management]
   *     summary: Lấy danh sách người dùng (phân trang, tìm kiếm, lọc)
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Số trang
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Số bản ghi mỗi trang (tối đa 100)
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Tìm kiếm theo tên hoặc email
   *       - in: query
   *         name: role
   *         schema:
   *           type: string
   *           enum: [developer-analyst, project-maintainer, system-administrator]
   *         description: Lọc theo vai trò hệ thống
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, suspended]
   *         description: Lọc theo trạng thái tài khoản
   *     responses:
   *       200:
   *         description: Danh sách người dùng thành công
   *       401:
   *         description: Chưa xác thực
   *       403:
   *         description: Không có quyền truy cập (yêu cầu System Administrator)
   */
  router.get("/users", adminUserController.getUsers);

  /**
   * @swagger
   * /api/admin/users/invite:
   *   post:
   *     tags: [Admin - User Management]
   *     summary: Mời người dùng mới vào hệ thống
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, email, role]
   *             properties:
   *               name:
   *                 type: string
   *                 example: Jane Doe
   *               email:
   *                 type: string
   *                 format: email
   *                 example: jane.doe@example.com
   *               role:
   *                 type: string
   *                 enum: [developer-analyst, project-maintainer, system-administrator]
   *                 example: project-maintainer
   *               temporaryPassword:
   *                 type: string
   *                 example: P@ssw0rd123!
   *     responses:
   *       201:
   *         description: Người dùng được tạo thành công
   *       400:
   *         description: Dữ liệu không hợp lệ
   *       409:
   *         description: Email đã tồn tại trong hệ thống
   */
  router.post("/users/invite", adminUserController.inviteUser);

  /**
   * @swagger
   * /api/admin/users/{id}/role:
   *   patch:
   *     tags: [Admin - User Management]
   *     summary: Cập nhật vai trò hệ thống của người dùng
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID người dùng
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
   *                 enum: [developer-analyst, project-maintainer, system-administrator]
   *                 example: project-maintainer
   *     responses:
   *       200:
   *         description: Cập nhật vai trò thành công
   *       400:
   *         description: Vai trò không hợp lệ hoặc không thể hạ quyền Quản trị viên cuối cùng
   *       404:
   *         description: Không tìm thấy người dùng
   */
  router.patch("/users/:id/role", adminUserController.updateRole);

  /**
   * @swagger
   * /api/admin/users/{id}/suspend:
   *   patch:
   *     tags: [Admin - User Management]
   *     summary: Khóa / đình chỉ tài khoản người dùng
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID người dùng
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reason:
   *                 type: string
   *                 example: Vi phạm điều khoản sử dụng
   *     responses:
   *       200:
   *         description: Đình chỉ tài khoản thành công
   *       400:
   *         description: Không thể tự đình chỉ chính mình hoặc quản trị viên cuối cùng
   *       404:
   *         description: Không tìm thấy người dùng
   */
  router.patch("/users/:id/suspend", adminUserController.suspendUser);

  /**
   * @swagger
   * /api/admin/users/{id}/reactivate:
   *   patch:
   *     tags: [Admin - User Management]
   *     summary: Kích hoạt lại tài khoản người dùng bị đình chỉ
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID người dùng
   *     responses:
   *       200:
   *         description: Kích hoạt lại tài khoản thành công
   *       404:
   *         description: Không tìm thấy người dùng
   */
  router.patch("/users/:id/reactivate", adminUserController.reactivateUser);

  return router;
}
