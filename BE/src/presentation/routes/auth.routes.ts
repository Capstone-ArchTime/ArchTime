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
   *   description: Authentication and account management
   */

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     tags: [Auth]
   *     summary: Register a new account
   *     description: Creates a new user account and sends a 6-digit OTP to the provided email for verification. The account is inactive until the OTP is verified.
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
   *         description: Account created. OTP sent to email.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message: { type: string }
   *                 email: { type: string }
   *       400:
   *         description: Validation error (missing fields, passwords don't match)
   *       409:
   *         description: Email already registered
   */
  router.post("/register", authController.register);

  /**
   * @swagger
   * /api/auth/verify-email:
   *   post:
   *     tags: [Auth]
   *     summary: Verify email with OTP
   *     description: Validates the 6-digit OTP sent to the user's email. On success, activates the account and returns JWT tokens.
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
   *         description: Email verified. Returns user and JWT tokens.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *                 accessToken: { type: string }
   *                 refreshToken: { type: string }
   *       400:
   *         description: Invalid OTP, expired OTP, or no OTP found
   */
  router.post("/verify-email", authController.verifyEmail);

  /**
   * @swagger
   * /api/auth/resend-otp:
   *   post:
   *     tags: [Auth]
   *     summary: Resend OTP verification email
   *     description: Invalidates any previous OTP and sends a fresh 6-digit code to the email address.
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
   *         description: New OTP sent
   *       400:
   *         description: Email already verified
   *       404:
   *         description: No account found with this email
   */
  router.post("/resend-otp", authController.resendOtp);

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Login with email and password
   *     description: Authenticates a verified user and returns JWT access + refresh tokens.
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
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *                 accessToken: { type: string }
   *                 refreshToken: { type: string }
   *       401:
   *         description: Invalid email or password
   *       403:
   *         description: Email not verified — check your inbox for OTP
   */
  router.post("/login", authController.login);

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     tags: [Auth]
   *     summary: Refresh access token
   *     description: Exchanges a valid refresh token for a new short-lived access token.
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
   *         description: New access token issued
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 accessToken: { type: string }
   *       401:
   *         description: Invalid or expired refresh token
   */
  router.post("/refresh", authController.refresh);

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     tags: [Auth]
   *     summary: Get current authenticated user
   *     description: Returns the profile of the currently authenticated user. Requires a valid Bearer token.
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Current user profile
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *       401:
   *         description: Missing or invalid Bearer token
   */
  router.get("/me", authenticate, authController.me);

  /**
   * @swagger
   * /api/auth/forgot-password:
   *   post:
   *     tags: [Auth]
   *     summary: Request password reset OTP
   *     description: Sends a 6-digit OTP to the user's email if the account exists.
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
   *         description: OTP sent (or simulated success to prevent enumeration)
   *       400:
   *         description: Validation error
   */
  router.post("/forgot-password", authController.forgotPassword);

  /**
   * @swagger
   * /api/auth/reset-password:
   *   post:
   *     tags: [Auth]
   *     summary: Reset password using OTP
   *     description: Validates the OTP and sets a new password.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, otp, newPassword, confirmNewPassword]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               otp:
   *                 type: string
   *                 example: "123456"
   *               newPassword:
   *                 type: string
   *                 minLength: 8
   *               confirmNewPassword:
   *                 type: string
   *     responses:
   *       200:
   *         description: Password reset successful
   *       400:
   *         description: Invalid OTP, expired OTP, or passwords do not match
   */
  router.post("/reset-password", authController.resetPassword);

  /**
   * @swagger
   * /api/auth/change-password:
   *   post:
   *     tags: [Auth]
   *     summary: Change password
   *     description: Changes the password for the currently authenticated user. Requires Bearer token.
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
   *               oldPassword:
   *                 type: string
   *               newPassword:
   *                 type: string
   *                 minLength: 8
   *               confirmNewPassword:
   *                 type: string
   *     responses:
   *       200:
   *         description: Password changed successfully
   *       400:
   *         description: Invalid old password or new passwords do not match
   *       401:
   *         description: Unauthorized
   */
  router.post("/change-password", authenticate, authController.changePassword);

  return router;
}
