import type { Request, Response, NextFunction } from "express";
import type { InviteProjectMemberUseCase } from "../../application/use-cases/members/InviteProjectMemberUseCase.js";
import type { GetProjectMembersUseCase } from "../../application/use-cases/members/GetProjectMembersUseCase.js";
import type { UpdateProjectMemberRoleUseCase } from "../../application/use-cases/members/UpdateProjectMemberRoleUseCase.js";
import type { RemoveProjectMemberUseCase } from "../../application/use-cases/members/RemoveProjectMemberUseCase.js";
import type { GetTeamMembersUseCase } from "../../application/use-cases/members/GetTeamMembersUseCase.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import type { ProjectMemberRole } from "../../domain/entities/ProjectMember.js";

export class MemberController {
  constructor(
    private readonly inviteProjectMemberUseCase: InviteProjectMemberUseCase,
    private readonly getProjectMembersUseCase: GetProjectMembersUseCase,
    private readonly updateProjectMemberRoleUseCase: UpdateProjectMemberRoleUseCase,
    private readonly removeProjectMemberUseCase: RemoveProjectMemberUseCase,
    private readonly getTeamMembersUseCase: GetTeamMembersUseCase,
  ) {}

  public inviteMember = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const { email, name, role } = req.body;
      const invitedBy = req.user?.userId;

      const member = await this.inviteProjectMemberUseCase.execute({
        projectId,
        email,
        name,
        role: role as ProjectMemberRole,
        invitedBy,
      });

      sendSuccess(res, { member }, {
        statusCode: 201,
        message: "Member invited successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  public getProjectMembers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const members = await this.getProjectMembersUseCase.execute(projectId);

      sendSuccess(res, { members });
    } catch (error) {
      next(error);
    }
  };

  public updateMemberRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { memberId } = req.params;
      const { role } = req.body;

      const member = await this.updateProjectMemberRoleUseCase.execute(
        memberId,
        role as ProjectMemberRole,
      );

      sendSuccess(res, { member }, {
        message: "Member role updated successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  public removeMember = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: projectId, memberId } = req.params;
      await this.removeProjectMemberUseCase.execute(projectId, memberId);

      sendSuccess(res, null, {
        message: "Member removed from project successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  public getTeamMembers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();

      const { project, q } = req.query;
      const members = await this.getTeamMembersUseCase.execute({
        userId: req.user.userId,
        userRole: req.user.role,
        projectId: typeof project === "string" ? project : undefined,
        query: typeof q === "string" ? q : undefined,
      });

      sendSuccess(res, { members });
    } catch (error) {
      next(error);
    }
  };
}
