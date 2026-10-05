import { Router } from "express";
import type { AuthController } from "../controllers/AuthController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";

export function createAuthRouter(
  authController: AuthController,
  jwtService: JwtTokenService,
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtService);

  /**
   * @swagger
   * tags:
   *   name: Auth
   *   description: Xác thực và quản lý tài khoản
   */

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     tags: [Auth]
   *     summary: Đăng ký tài khoản mới
   *     description: Tạo tài khoản và gửi mã OTP 6 chữ số về email. Tài khoản chưa kích hoạt cho đến khi xác minh OTP.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, email, password, confirmPassword]
   *             properties:
   *               name:
   *                 type: string
   *                 example: Jane Doe
   *               email:
   *                 type: string
   *                 format: email
   *                 example: dev@archtime.io
   *               password:
   *                 type: string
   *                 minLength: 8
   *                 example: Test1234!
   *               confirmPassword:
   *                 type: string
   *                 example: Test1234!
   *     responses:
   *       201:
   *         description: Tài khoản đã được tạo. OTP gửi về email.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { message: "Account created.", email: "dev@archtime.io" }
   *               message: "Account created. Please check your email for OTP."
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       409:
   *         description: Email đã được đăng ký
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "ALREADY_EXISTS", message: "Email already registered." }
   */
  router.post("/register", authController.register);

  /**
   * @swagger
   * /api/auth/verify-email:
   *   post:
   *     tags: [Auth]
   *     summary: Xác minh email bằng OTP
   *     description: Kiểm tra mã OTP 6 chữ số. Thành công sẽ kích hoạt tài khoản và trả về JWT tokens.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, otp]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: dev@archtime.io
   *               otp:
   *                 type: string
   *                 example: "482913"
   *     responses:
   *       200:
   *         description: Email đã xác minh. Trả về user và JWT tokens.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data:
   *                 user: { id: "64f1...", name: "Jane Doe", email: "dev@archtime.io", role: "developer-analyst" }
   *                 accessToken: "eyJhbGci..."
   *                 refreshToken: "eyJhbGci..."
   *               message: "Email verified successfully."
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   */
  router.post("/verify-email", authController.verifyEmail);

  /**
   * @swagger
   * /api/auth/resend-otp:
   *   post:
   *     tags: [Auth]
   *     summary: Gửi lại OTP
   *     description: Hủy OTP cũ và gửi mã 6 chữ số mới về email.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: dev@archtime.io
   *     responses:
   *       200:
   *         description: OTP mới đã được gửi
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: {}
   *               message: "OTP sent successfully."
   *       400:
   *         description: Email đã xác minh
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "EMAIL_ALREADY_VERIFIED", message: "Email already verified." }
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  router.post("/resend-otp", authController.resendOtp);

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Đăng nhập bằng email và mật khẩu
   *     description: Xác thực người dùng và trả về access token + refresh token.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: dev@archtime.io
   *               password:
   *                 type: string
   *                 example: Test1234!
   *     responses:
   *       200:
   *         description: Đăng nhập thành công
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data:
   *                 user: { id: "64f1...", name: "Jane Doe", email: "dev@archtime.io", role: "developer-analyst" }
   *                 accessToken: "eyJhbGci..."
   *                 refreshToken: "eyJhbGci..."
   *               message: "Login successful."
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         description: Sai email hoặc mật khẩu
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." }
   *       403:
   *         description: Email chưa xác minh
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "EMAIL_NOT_VERIFIED", message: "Please verify your email first." }
   */
  router.post("/login", authController.login);

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     tags: [Auth]
   *     summary: Làm mới access token
   *     description: Đổi refresh token hợp lệ lấy access token mới.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refreshToken]
   *             properties:
   *               refreshToken:
   *                 type: string
   *     responses:
   *       200:
   *         description: Access token mới đã cấp
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { accessToken: "eyJhbGci..." }
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post("/refresh", authController.refresh);

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     tags: [Auth]
   *     summary: Lấy thông tin người dùng hiện tại
   *     description: Trả về profile của user đang đăng nhập. Yêu cầu Bearer token hợp lệ.
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Thông tin user hiện tại
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data:
   *                 user: { id: "64f1...", name: "Jane Doe", email: "dev@archtime.io", role: "developer-analyst" }
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/me", authenticate, authController.me);

  /**
   * @swagger
   * /api/auth/forgot-password:
   *   post:
   *     tags: [Auth]
   *     summary: Gửi mã đặt lại mật khẩu qua email (có hiệu lực 10 phút)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email]
   *             properties:
   *               email: { type: string, format: email, example: dev@archtime.io }
   *     responses:
   *       200:
   *         description: Yêu cầu đã được ghi nhận; tối đa 1 email mỗi phút cho mỗi tài khoản
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   * /api/auth/reset-password:
   *   post:
   *     tags: [Auth]
   *     summary: Đặt lại mật khẩu và thu hồi phiên đăng nhập hiện tại
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, token, password, confirmPassword]
   *             properties:
   *               email: { type: string, format: email }
   *               token: { type: string, minLength: 32, maxLength: 32 }
   *               password: { type: string, minLength: 8, maxLength: 72 }
   *               confirmPassword: { type: string }
   *     responses:
   *       200:
   *         description: Mật khẩu đã đổi; vui lòng đăng nhập lại
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         description: Dữ liệu không hợp lệ hoặc mã đặt lại đã hết hạn / đã dùng
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   * /api/auth/change-password:
   *   post:
   *     tags: [Auth]
   *     summary: Thay đổi mật khẩu (khi đang đăng nhập)
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [oldPassword, newPassword, confirmNewPassword]
   *             properties:
   *               oldPassword: { type: string }
   *               newPassword: { type: string, minLength: 8, maxLength: 72 }
   *               confirmNewPassword: { type: string }
   *     responses:
   *       200:
   *         description: Mật khẩu đã thay đổi thành công
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post("/forgot-password", authController.forgotPassword);
  router.post("/reset-password", authController.resetPassword);
  router.post("/change-password", authenticate, authController.changePassword);
  return router;
}
