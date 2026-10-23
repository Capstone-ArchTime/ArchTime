import { Router } from "express";
import type { OrganizationController } from "../controllers/OrganizationController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";

/**
 * Organizations (T28). Access is checked in the use cases: members see an organization, owners change it. A
 * non-member gets 404 so organization ids cannot be probed. System Administrators have no access to organization content.
 */
export function createOrganizationRouter(controller: OrganizationController, jwtTokenService: JwtTokenService): Router {
  const router = Router();
  router.use(createAuthenticateMiddleware(jwtTokenService));

  /**
   * @swagger
   * /api/organizations:
   *   post:
   *     tags: [Organizations]
   *     summary: Tạo tổ chức; người tạo trở thành Organization Owner
   *     security: [{ BearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name]
   *             properties:
   *               name: { type: string, minLength: 2, maxLength: 100, example: "Acme Engineering" }
   *               description: { type: string, maxLength: 500 }
   *     responses:
   *       201:
   *         description: "{ organization: { id, name, description, createdBy, myRole: owner, memberCount: 1 } }"
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *   get:
   *     tags: [Organizations]
   *     summary: Các tổ chức tôi là thành viên, kèm role của tôi
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200:
   *         description: "{ organizations: [{ id, name, myRole, memberCount }] }"
   */
  router.post("/", controller.create);
  router.get("/", controller.listMine);

  /**
   * @swagger
   * /api/organizations/{orgId}:
   *   get:
   *     tags: [Organizations]
   *     summary: Chi tiết tổ chức (thành viên)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ organization }"
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *   patch:
   *     tags: [Organizations]
   *     summary: Đổi tên / mô tả (Organization Owner)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string, minLength: 2, maxLength: 100 }
   *               description: { type: string, maxLength: 500 }
   *     responses:
   *       200:
   *         description: "{ organization }"
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   */
  router.get("/:orgId", controller.get);
  router.patch("/:orgId", controller.update);

  /**
   * @swagger
   * /api/organizations/{orgId}/members:
   *   get:
   *     tags: [Organizations]
   *     summary: Danh sách thành viên (thành viên xem được)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ members: [{ id, userId, name, email, role, addedBy, createdAt }] }"
   *   post:
   *     tags: [Organizations]
   *     summary: Thêm thành viên bằng email của tài khoản đã có (Organization Owner)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email]
   *             properties:
   *               email: { type: string, format: email }
   *               role: { type: string, enum: [owner, member], default: member }
   *     responses:
   *       201:
   *         description: "{ member }"
   *       404:
   *         description: Không có tài khoản nào dùng email này
   *       409:
   *         description: Người này đã là thành viên
   */
  router.get("/:orgId/members", controller.listMembers);
  router.post("/:orgId/members", controller.addMember);

  /**
   * @swagger
   * /api/organizations/{orgId}/members/{memberId}:
   *   patch:
   *     tags: [Organizations]
   *     summary: Đổi role thành viên (Organization Owner); không hạ được owner cuối cùng
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *       - { in: path, name: memberId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [role]
   *             properties:
   *               role: { type: string, enum: [owner, member] }
   *     responses:
   *       200:
   *         description: "{ member }"
   *   delete:
   *     tags: [Organizations]
   *     summary: Gỡ thành viên (Owner) hoặc tự rời tổ chức; người bị gỡ mất quyền ở mọi project của tổ chức
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *       - { in: path, name: memberId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ removedProjectMemberships }"
   *       400:
   *         description: Không gỡ được owner cuối cùng
   */
  router.patch("/:orgId/members/:memberId", controller.updateMemberRole);
  router.delete("/:orgId/members/:memberId", controller.removeMember);

  /**
   * @swagger
   * /api/organizations/{orgId}/credentials:
   *   get:
   *     tags: [Organizations]
   *     summary: Credential repo của tổ chức (Organization Owner); không bao giờ trả về token
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: "{ credentials: [{ id, name, provider, last4, usedBy, createdBy, rotatedAt, lastUsedAt }] }"
   *   post:
   *     tags: [Organizations]
   *     summary: Thêm credential (token được mã hóa AES-256-GCM khi lưu)
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, token]
   *             properties:
   *               name: { type: string, maxLength: 80, example: "GitHub bot (read-only)" }
   *               provider: { type: string, enum: [github, gitlab, bitbucket, other], default: github }
   *               token: { type: string, minLength: 8, maxLength: 1024, writeOnly: true }
   *     responses:
   *       201:
   *         description: "{ credential } - chỉ có last4, không có token"
   *       409:
   *         description: Tên credential đã tồn tại trong tổ chức
   */
  router.get("/:orgId/credentials", controller.listCredentials);
  router.post("/:orgId/credentials", controller.createCredential);

  /**
   * @swagger
   * /api/organizations/{orgId}/credentials/{credentialId}:
   *   put:
   *     tags: [Organizations]
   *     summary: Thay token (rotate); các project dùng credential này nhận token mới ở job kế tiếp
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *       - { in: path, name: credentialId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [token]
   *             properties:
   *               token: { type: string, minLength: 8, maxLength: 1024, writeOnly: true }
   *     responses:
   *       200:
   *         description: "{ credential }"
   *   delete:
   *     tags: [Organizations]
   *     summary: Xóa credential; bị từ chối (409) khi còn project dùng nó
   *     security: [{ BearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: orgId, required: true, schema: { type: string } }
   *       - { in: path, name: credentialId, required: true, schema: { type: string } }
   *     responses:
   *       200:
   *         description: Đã xóa
   *       409:
   *         description: Còn project dùng credential này
   */
  router.put("/:orgId/credentials/:credentialId", controller.rotateCredential);
  router.delete("/:orgId/credentials/:credentialId", controller.deleteCredential);

  return router;
}
