import type { Request, Response, NextFunction } from "express";
import type { ProjectChatUseCase } from "../../application/use-cases/llm/ProjectChatUseCase.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import { NotFoundError, UnauthorizedError } from "../../shared/errors/AppError.js";

export class ProjectChatController {
  constructor(private readonly useCase: ProjectChatUseCase) {}

  public chat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();
      if (!req.project) throw new NotFoundError("Project not found.");
      sendSuccess(res, await this.useCase.execute({ project: req.project, userId, messages: req.body?.messages }));
    } catch (error) {
      next(error);
    }
  };
}
