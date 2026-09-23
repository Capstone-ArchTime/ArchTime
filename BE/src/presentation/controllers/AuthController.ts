import type { Request, Response, NextFunction } from "express";
import type { RegisterUseCase } from "../../application/use-cases/RegisterUseCase.js";
import type { VerifyEmailUseCase } from "../../application/use-cases/VerifyEmailUseCase.js";
import type { ResendOtpUseCase } from "../../application/use-cases/ResendOtpUseCase.js";
import type { LoginUseCase } from "../../application/use-cases/LoginUseCase.js";
import type { RefreshTokenUseCase } from "../../application/use-cases/RefreshTokenUseCase.js";
import type { GetCurrentUserUseCase } from "../../application/use-cases/GetCurrentUserUseCase.js";
import type { ForgotPasswordUseCase } from "../../application/use-cases/ForgotPasswordUseCase.js";
import type { ResetPasswordUseCase } from "../../application/use-cases/ResetPasswordUseCase.js";
import type { ChangePasswordUseCase } from "../../application/use-cases/ChangePasswordUseCase.js";
import { BadRequestError } from "../../shared/errors/AppError.js";
import { validatePassword } from "../../shared/utils/validators.js";

export class AuthController {
  constructor(
    private readonly registerUC: RegisterUseCase,
    private readonly verifyEmailUC: VerifyEmailUseCase,
    private readonly resendOtpUC: ResendOtpUseCase,
    private readonly loginUC: LoginUseCase,
    private readonly refreshUC: RefreshTokenUseCase,
    private readonly getMeUC: GetCurrentUserUseCase,
    private readonly forgotPasswordUC: ForgotPasswordUseCase,
    private readonly resetPasswordUC: ResetPasswordUseCase,
    private readonly changePasswordUC: ChangePasswordUseCase,
  ) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, password, confirmPassword } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
      };

      if (!name || !email || !password || !confirmPassword) {
        throw new BadRequestError("All fields are required: name, email, password, confirmPassword.");
      }
      if (password !== confirmPassword) {
        throw new BadRequestError("Passwords do not match.");
      }

      validatePassword(password);

      const result = await this.registerUC.execute({ name, email, password });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, otp } = req.body as { email?: string; otp?: string };

      if (!email || !otp) {
        throw new BadRequestError("Fields required: email, otp.");
      }

      const { user, tokens } = await this.verifyEmailUC.execute({ email, otp });
      res.status(200).json({ user, ...tokens });
    } catch (err) {
      next(err);
    }
  };

  resendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email?: string };

      if (!email) {
        throw new BadRequestError("Field required: email.");
      }

      const result = await this.resendOtpUC.execute({ email });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        throw new BadRequestError("Fields required: email, password.");
      }

      const { user, tokens } = await this.loginUC.execute({ email, password });
      res.status(200).json({ user, ...tokens });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };

      if (!refreshToken) {
        throw new BadRequestError("Field required: refreshToken.");
      }

      const result = await this.refreshUC.execute({ refreshToken });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const user = await this.getMeUC.execute({ userId });
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email?: string };

      if (!email) {
        throw new BadRequestError("Field required: email.");
      }

      const result = await this.forgotPasswordUC.execute({ email });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, otp, newPassword, confirmNewPassword } = req.body as {
        email?: string;
        otp?: string;
        newPassword?: string;
        confirmNewPassword?: string;
      };

      if (!email || !otp || !newPassword || !confirmNewPassword) {
        throw new BadRequestError("All fields are required: email, otp, newPassword, confirmNewPassword.");
      }
      if (newPassword !== confirmNewPassword) {
        throw new BadRequestError("Passwords do not match.");
      }

      validatePassword(newPassword);

      const result = await this.resetPasswordUC.execute({ email, otp, newPassword });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { oldPassword, newPassword, confirmNewPassword } = req.body as {
        oldPassword?: string;
        newPassword?: string;
        confirmNewPassword?: string;
      };

      if (!oldPassword || !newPassword || !confirmNewPassword) {
        throw new BadRequestError("All fields are required: oldPassword, newPassword, confirmNewPassword.");
      }
      if (newPassword !== confirmNewPassword) {
        throw new BadRequestError("New passwords do not match.");
      }

      validatePassword(newPassword);

      const result = await this.changePasswordUC.execute({ userId, oldPassword, newPassword });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}
