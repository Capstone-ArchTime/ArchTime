import type { Request, Response, NextFunction } from "express";
import type { GetProjectWorkspaceUseCase } from "../../application/use-cases/workspace/GetProjectWorkspaceUseCase.js";
import type { SaveProjectWorkspaceUseCase } from "../../application/use-cases/workspace/SaveProjectWorkspaceUseCase.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class WorkspaceController {
  constructor(
    private readonly getProjectWorkspaceUseCase: GetProjectWorkspaceUseCase,
    private readonly saveProjectWorkspaceUseCase: SaveProjectWorkspaceUseCase,
  ) {}

  public getWorkspace = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const workspace = await this.getProjectWorkspaceUseCase.execute(projectId);

      sendSuccess(res, { workspace });
    } catch (error) {
      next(error);
    }
  };

  public saveWorkspace = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const { id: projectId } = req.params;
      const { expectedRevision, diagram, rules, decisions } = req.body;

      const workspace = await this.saveProjectWorkspaceUseCase.execute({
        projectId,
        expectedRevision,
        diagram,
        rules,
        decisions,
        userId,
      });

      sendSuccess(res, { workspace }, {
        message: "Workspace saved successfully.",
      });
    } catch (error) {
      next(error);
    }
  };
}
