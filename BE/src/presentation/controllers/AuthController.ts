import type { Request, Response, NextFunction } from "express";
import type { RegisterUseCase } from "../../application/use-cases/RegisterUseCase.js";
import type { VerifyEmailUseCase } from "../../application/use-cases/VerifyEmailUseCase.js";
import type { ResendOtpUseCase } from "../../application/use-cases/ResendOtpUseCase.js";
import type { LoginUseCase } from "../../application/use-cases/LoginUseCase.js";
import type { RefreshTokenUseCase } from "../../application/use-cases/RefreshTokenUseCase.js";
import type { GetCurrentUserUseCase } from "../../application/use-cases/GetCurrentUserUseCase.js";
import type { PasswordResetUseCase } from "../../application/use-cases/PasswordResetUseCase.js";
import type { ChangePasswordUseCase } from "../../application/use-cases/ChangePasswordUseCase.js";
import { BadRequestError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import { validatePassword } from "../../shared/utils/validators.js";

export class AuthController {
  constructor(
    private readonly registerUC: RegisterUseCase,
    private readonly verifyEmailUC: VerifyEmailUseCase,
    private readonly resendOtpUC: ResendOtpUseCase,
    private readonly loginUC: LoginUseCase,
    private readonly refreshUC: RefreshTokenUseCase,
    private readonly getMeUC: GetCurrentUserUseCase,
    private readonly passwordResetUC: PasswordResetUseCase,
    private readonly changePasswordUC: ChangePasswordUseCase,
  ) {}

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.passwordResetUC.request(req.body ?? {});
      sendSuccess(res, result);
    } catch (err) { next(err); }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.passwordResetUC.reset(req.body ?? {});
      sendSuccess(res, result, { message: "Password reset successfully." });
    } catch (err) { next(err); }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { oldPassword, newPassword, confirmNewPassword } = req.body ?? {};
      if (
        typeof oldPassword !== "string" || !oldPassword ||
        typeof newPassword !== "string" || !newPassword
      ) {
        throw new BadRequestError(
          "Fields required: oldPassword, newPassword, confirmNewPassword.",
          "VALIDATION_ERROR",
        );
      }
      if (newPassword !== confirmNewPassword) {
        throw new BadRequestError("New passwords do not match.", "VALIDATION_ERROR");
      }
      const result = await this.changePasswordUC.execute({
        userId: req.user!.userId,
        oldPassword,
        newPassword,
      });
      sendSuccess(res, result, { message: "Password changed successfully." });
    } catch (err) { next(err); }
  };

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, password, confirmPassword } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
      };

      if (!name || !email || !password || !confirmPassword) {
        throw new BadRequestError(
          "All fields are required: name, email, password, confirmPassword.",
          "VALIDATION_ERROR",
        );
      }
      if (password !== confirmPassword) {
        throw new BadRequestError("Passwords do not match.", "VALIDATION_ERROR");
      }

      validatePassword(password);
      const result = await this.registerUC.execute({ name, email, password });
      sendSuccess(res, result, {
        statusCode: 201,
        message: "Account created. Please check your email for OTP.",
      });
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, otp } = req.body as { email?: string; otp?: string };

      if (!email || !otp) {
        throw new BadRequestError("Fields required: email, otp.", "VALIDATION_ERROR");
      }

      const { user, tokens } = await this.verifyEmailUC.execute({ email, otp });
      sendSuccess(res, { user, ...tokens }, { message: "Email verified successfully." });
    } catch (err) {
      next(err);
    }
  };

  resendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email?: string };

      if (!email) {
        throw new BadRequestError("Field required: email.", "VALIDATION_ERROR");
      }

      const result = await this.resendOtpUC.execute({ email });
      sendSuccess(res, result, { message: "OTP sent successfully." });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        throw new BadRequestError("Fields required: email, password.", "VALIDATION_ERROR");
      }

      const { user, tokens } = await this.loginUC.execute({ email, password });
      sendSuccess(res, { user, ...tokens }, { message: "Login successful." });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };

      if (!refreshToken) {
        throw new BadRequestError("Field required: refreshToken.", "VALIDATION_ERROR");
      }

      const result = await this.refreshUC.execute({ refreshToken });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const user = await this.getMeUC.execute({ userId });
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  };
}
