import type { Request, Response, NextFunction } from "express";
import type { ProjectChatUseCase } from "../../application/use-cases/llm/ProjectChatUseCase.js";
import type { ChatHistoryUseCases } from "../../application/use-cases/llm/ChatHistoryUseCases.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import { NotFoundError, UnauthorizedError } from "../../shared/errors/AppError.js";

export class ProjectChatController {
  constructor(
    private readonly useCase: ProjectChatUseCase,
    private readonly history: ChatHistoryUseCases,
  ) {}

  /** The signed-in user and the project the middleware already checked. */
  private scope(req: Request): { userId: string; projectId: string } {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedError();
    if (!req.project) throw new NotFoundError("Workspace not found.");
    return { userId, projectId: req.project.id };
  }

  public chat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = this.scope(req);
      sendSuccess(res, await this.useCase.execute({ project: req.project!, userId, messages: req.body?.messages, conversationId: req.body?.conversationId }));
    } catch (error) {
      next(error);
    }
  };

  public listConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, projectId } = this.scope(req);
      sendSuccess(res, { conversations: await this.history.list(projectId, userId) });
    } catch (error) {
      next(error);
    }
  };

  public getConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, projectId } = this.scope(req);
      sendSuccess(res, { conversation: await this.history.get(projectId, userId, req.params.conversationId) });
    } catch (error) {
      next(error);
    }
  };

  public deleteConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, projectId } = this.scope(req);
      await this.history.remove(projectId, userId, req.params.conversationId);
      sendSuccess(res, { deleted: true });
    } catch (error) {
      next(error);
    }
  };
}
