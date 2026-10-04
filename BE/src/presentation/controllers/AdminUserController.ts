import type { Request, Response, NextFunction } from "express";
import type { GetAdminUsersUseCase } from "../../application/use-cases/admin/GetAdminUsersUseCase.js";
import type { UpdateUserRoleUseCase } from "../../application/use-cases/admin/UpdateUserRoleUseCase.js";
import type { SuspendUserUseCase } from "../../application/use-cases/admin/SuspendUserUseCase.js";
import type { ReactivateUserUseCase } from "../../application/use-cases/admin/ReactivateUserUseCase.js";
import type { InviteUserUseCase } from "../../application/use-cases/admin/InviteUserUseCase.js";
import type { UserRole, UserStatus } from "../../domain/entities/User.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class AdminUserController {
  constructor(
    private readonly getAdminUsersUseCase: GetAdminUsersUseCase,
    private readonly updateUserRoleUseCase: UpdateUserRoleUseCase,
    private readonly suspendUserUseCase: SuspendUserUseCase,
    private readonly reactivateUserUseCase: ReactivateUserUseCase,
    private readonly inviteUserUseCase: InviteUserUseCase,
  ) {}

  public getUsers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const role = typeof req.query.role === "string" ? (req.query.role as UserRole) : undefined;
      const status = typeof req.query.status === "string" ? (req.query.status as UserStatus) : undefined;

      const result = await this.getAdminUsersUseCase.execute({
        page,
        limit,
        search,
        role,
        status,
      });

      sendSuccess(res, { users: result.users }, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  public inviteUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name, email, role, temporaryPassword } = req.body;

      const result = await this.inviteUserUseCase.execute({
        name,
        email,
        role: role as UserRole,
        temporaryPassword,
      });

      sendSuccess(res, result, {
        statusCode: 201,
        message: "User invited successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  public updateRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: targetUserId } = req.params;
      const { role: newRole } = req.body;
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const updatedUser = await this.updateUserRoleUseCase.execute({
        currentUserId,
        targetUserId,
        newRole: newRole as UserRole,
      });

      sendSuccess(res, { user: updatedUser }, {
        message: "User role updated successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  public suspendUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: targetUserId } = req.params;
      const { reason } = req.body;
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const updatedUser = await this.suspendUserUseCase.execute({
        currentUserId,
        targetUserId,
        reason,
      });

      sendSuccess(res, { user: updatedUser }, {
        message: "User suspended successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  public reactivateUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: targetUserId } = req.params;

      const updatedUser = await this.reactivateUserUseCase.execute({
        targetUserId,
      });

      sendSuccess(res, { user: updatedUser }, {
        message: "User reactivated successfully.",
      });
    } catch (error) {
      next(error);
    }
  };
}
