import { Router } from "express";
import type { AuthController } from "../controllers/AuthController.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import type { IRateLimiter } from "../../domain/interfaces/IRateLimiter.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import { createAuthRateLimits } from "../middlewares/authRateLimits.js";

export function createAuthRouter(
  authController: AuthController,
  jwtService: JwtTokenService,
  limiter: IRateLimiter,
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtService);
  // Limits per route are listed in presentation/middlewares/authRateLimits.ts (and docs/auth-hardening.md).
  const limit = createAuthRateLimits(limiter);

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
   *     description: |
   *       Tạo tài khoản và gửi mã OTP 6 chữ số về email. Tài khoản chưa kích hoạt cho đến khi xác minh OTP.
   *       Giới hạn tần suất: 10 lần/giờ cho mỗi IP và 3 lần/giờ cho mỗi email (vượt quá thì 429 RATE_LIMITED).
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
   *       429:
   *         description: Vượt giới hạn tần suất (theo IP hoặc theo email). Header Retry-After và error.retryAfterSeconds cho biết sau bao nhiêu giây được thử lại
   *         headers:
   *           Retry-After: { description: Số giây phải chờ, schema: { type: integer } }
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "RATE_LIMITED", message: "Too many requests. Try again in 42 seconds.", retryAfterSeconds: 42 }
   */
  router.post("/register", limit.register, authController.register);

  /**
   * @swagger
   * /api/auth/verify-email:
   *   post:
   *     tags: [Auth]
   *     summary: Xác minh email bằng OTP
   *     description: |
   *       Kiểm tra mã OTP 6 chữ số. Thành công sẽ kích hoạt tài khoản và trả về JWT tokens.
   *       Mỗi mã chỉ được đoán sai tối đa 5 lần; sau đó mã bị khóa (429 OTP_LOCKED, không có Retry-After) và phải gửi lại mã mới qua /api/auth/resend-otp.
   *       Ngoài ra giới hạn 10 yêu cầu/15 phút cho mỗi email và 60 yêu cầu/15 phút cho mỗi IP (429 RATE_LIMITED).
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
   *       429:
   *         description: Quá nhiều yêu cầu (RATE_LIMITED, có Retry-After và retryAfterSeconds) hoặc mã đã bị khóa vì đoán sai 5 lần (OTP_LOCKED, cần gửi lại mã mới)
   *         headers:
   *           Retry-After: { description: Số giây phải chờ (chỉ với RATE_LIMITED), schema: { type: integer } }
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "OTP_LOCKED", message: "Too many wrong codes. Request a new code to continue." }
   */
  router.post("/verify-email", limit.verifyEmail, authController.verifyEmail);

  /**
   * @swagger
   * /api/auth/resend-otp:
   *   post:
   *     tags: [Auth]
   *     summary: Gửi lại OTP
   *     description: |
   *       Hủy OTP cũ và gửi mã 6 chữ số mới về email.
   *       Luôn trả lời giống nhau dù email không tồn tại hoặc đã xác minh (không gửi mail trong hai trường hợp đó), để không lộ email nào có tài khoản.
   *       Giới hạn tần suất: 1 lần/60 giây và 5 lần/giờ cho mỗi email, 20 lần/giờ cho mỗi IP.
   *       Khi bị chặn, retryAfterSeconds cho biết chính xác khi nào được gửi lại.
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
   *         description: Yêu cầu đã được ghi nhận. Cùng một dạng trả lời cho mọi email (có tài khoản chưa xác minh, chưa có tài khoản, hoặc đã xác minh)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { message: "If this email has an account waiting to be verified, a new code has been sent to it. It expires in 10 minutes.", expiresAt: "2026-10-30T10:10:00.000Z" }
   *               message: "OTP sent successfully."
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       429:
   *         description: Vượt giới hạn tần suất. Header Retry-After và error.retryAfterSeconds cho biết sau bao nhiêu giây được gửi lại
   *         headers:
   *           Retry-After: { description: Số giây phải chờ, schema: { type: integer } }
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "RATE_LIMITED", message: "Too many requests. Try again in 42 seconds.", retryAfterSeconds: 42 }
   */
  router.post("/resend-otp", limit.resendOtp, authController.resendOtp);

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Đăng nhập bằng email và mật khẩu
   *     description: |
   *       Xác thực người dùng và trả về access token + refresh token.
   *       Chỉ đếm các lần đăng nhập sai (401): tối đa 10 lần/15 phút cho mỗi tài khoản (email hoặc username) và 100 lần/15 phút cho mỗi IP.
   *       Đăng nhập thành công sẽ xóa bộ đếm của tài khoản.
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
   *       429:
   *         description: Quá nhiều lần đăng nhập sai. Header Retry-After và error.retryAfterSeconds cho biết sau bao nhiêu giây được thử lại
   *         headers:
   *           Retry-After: { description: Số giây phải chờ, schema: { type: integer } }
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "RATE_LIMITED", message: "Too many requests. Try again in 600 seconds.", retryAfterSeconds: 600 }
   */
  router.post("/login", limit.login, authController.login);

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
   *     description: |
   *       Trả về profile của user đang đăng nhập. Yêu cầu Bearer token hợp lệ.
   *       Chỉ gồm các trường liệt kê dưới đây; không bao giờ trả về passwordHash, githubId hay tokenVersion.
   *       `signInMethods.password` = tài khoản có mật khẩu dùng được (tài khoản tạo bằng GitHub thì chưa có);
   *       `signInMethods.github` = đã liên kết GitHub.
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
   *                 user:
   *                   id: "64f1..."
   *                   name: "Jane Doe"
   *                   email: "dev@archtime.io"
   *                   username: "jane.doe"
   *                   role: "developer-analyst"
   *                   status: "active"
   *                   isVerified: true
   *                   createdAt: "2026-01-15T08:00:00.000Z"
   *                   updatedAt: "2026-03-02T10:30:00.000Z"
   *                   signInMethods: { password: true, github: false }
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get("/me", authenticate, authController.me);

  /**
   * @swagger
   * /api/auth/me:
   *   patch:
   *     tags: [Auth]
   *     summary: Cập nhật profile của chính mình (tên hiển thị, username)
   *     description: |
   *       Gửi ít nhất một trường. `username` = null hoặc "" để xóa username.
   *       Email không đổi được ở đây (cần xác minh lại); role và trạng thái do System Administrator thay đổi.
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string, maxLength: 100, example: "Jane Doe" }
   *               username:
   *                 type: string
   *                 nullable: true
   *                 pattern: '^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$'
   *                 example: "jane.doe"
   *     responses:
   *       200:
   *         description: Profile đã cập nhật; `user` có cùng dạng với GET /auth/me (kèm signInMethods)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               message: Profile updated.
   *               data:
   *                 user: { id: "64f1...", name: "Jane Doe", username: "jane.doe", email: "dev@archtime.io", role: "developer-analyst" }
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       409:
   *         description: Username đã có người dùng
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.patch("/me", authenticate, authController.updateProfile);

  /**
   * @swagger
   * /api/auth/logout-all:
   *   post:
   *     tags: [Auth]
   *     summary: Đăng xuất khỏi mọi thiết bị
   *     description: |
   *       Thu hồi mọi access token và refresh token của tài khoản, kể cả phiên hiện tại.
   *       Sau khi gọi, client phải đăng nhập lại. Hành động được ghi vào audit log.
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Đã thu hồi mọi phiên
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post("/logout-all", authenticate, authController.logoutAll);

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
   *         description: Yêu cầu đã được ghi nhận (cùng một câu trả lời dù email có tài khoản hay không)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       429:
   *         description: Giới hạn 1 lần/60 giây và 5 lần/giờ cho mỗi email, 20 lần/giờ cho mỗi IP. Header Retry-After và error.retryAfterSeconds cho biết sau bao nhiêu giây được thử lại. Bộ đếm chỉ dựa vào chuỗi email gửi lên, không phụ thuộc email có tài khoản hay không
   *         headers:
   *           Retry-After: { description: Số giây phải chờ, schema: { type: integer } }
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "RATE_LIMITED", message: "Too many requests. Try again in 42 seconds.", retryAfterSeconds: 42 }
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
   *       429:
   *         description: Giới hạn 10 yêu cầu/15 phút cho mỗi email. Header Retry-After và error.retryAfterSeconds cho biết sau bao nhiêu giây được thử lại
   *         headers:
   *           Retry-After: { description: Số giây phải chờ, schema: { type: integer } }
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "RATE_LIMITED", message: "Too many requests. Try again in 600 seconds.", retryAfterSeconds: 600 }
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
  router.post("/forgot-password", limit.forgotPassword, authController.forgotPassword);
  router.post("/reset-password", limit.resetPassword, authController.resetPassword);
  router.post("/change-password", authenticate, authController.changePassword);

  /**
   * @swagger
   * /api/auth/set-password:
   *   post:
   *     tags: [Auth]
   *     summary: Đặt mật khẩu lần đầu cho tài khoản chưa có mật khẩu (tạo bằng GitHub)
   *     description: |
   *       Chỉ dùng được khi tài khoản chưa có mật khẩu (`signInMethods.password` = false trong GET /api/auth/me).
   *       Tài khoản đã có mật khẩu sẽ bị từ chối với 409; khi đó hãy dùng /api/auth/change-password.
   *       Không đăng xuất các phiên hiện tại, vì trước đó không có mật khẩu nào để người khác dùng.
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [newPassword, confirmNewPassword]
   *             properties:
   *               newPassword: { type: string, minLength: 8, maxLength: 72 }
   *               confirmNewPassword: { type: string }
   *     responses:
   *       200:
   *         description: Đã đặt mật khẩu; từ giờ có thể đăng nhập bằng email và mật khẩu này
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *             example:
   *               success: true
   *               data: { message: "Password set.", signInMethods: { password: true, github: true } }
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       409:
   *         description: Tài khoản đã có mật khẩu
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             example:
   *               success: false
   *               error: { code: "CONFLICT", message: "This account already has a password; change it instead." }
   */
  router.post("/set-password", authenticate, authController.setPassword);
  return router;
}
