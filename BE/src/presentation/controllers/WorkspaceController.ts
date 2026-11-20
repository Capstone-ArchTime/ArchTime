import type { Request, Response, NextFunction } from "express";
import type { GetProjectWorkspaceUseCase } from "../../application/use-cases/workspace/GetProjectWorkspaceUseCase.js";
import type { SaveProjectWorkspaceUseCase } from "../../application/use-cases/workspace/SaveProjectWorkspaceUseCase.js";
import type { SetComponentPathsUseCase } from "../../application/use-cases/workspace/SetComponentPathsUseCase.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class WorkspaceController {
  constructor(
    private readonly getProjectWorkspaceUseCase: GetProjectWorkspaceUseCase,
    private readonly saveProjectWorkspaceUseCase: SaveProjectWorkspaceUseCase,
    private readonly setComponentPathsUseCase?: SetComponentPathsUseCase,
  ) {}

  /** PUT /:id/workspace/components/:componentId/paths — body { pathPrefixes: string[], expectedRevision? }. */
  public setComponentPaths = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();
      if (!this.setComponentPathsUseCase) throw new Error("Component paths are not configured.");
      const { pathPrefixes, expectedRevision } = req.body ?? {};
      const result = await this.setComponentPathsUseCase.execute({
        projectId: req.params.id,
        componentId: req.params.componentId,
        pathPrefixes,
        expectedRevision: typeof expectedRevision === "number" ? expectedRevision : undefined,
        userId,
      });
      sendSuccess(res, result, { message: "Component paths saved." });
    } catch (error) {
      next(error);
    }
  };

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
