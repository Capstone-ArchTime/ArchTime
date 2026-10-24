import type { Request, Response, NextFunction } from "express";
import type { OnboardingPathUseCases } from "../../application/use-cases/onboarding/OnboardingPathUseCases.js";
import type { OnboardingLearningUseCases } from "../../application/use-cases/onboarding/OnboardingLearningUseCases.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import { NotFoundError, UnauthorizedError } from "../../shared/errors/AppError.js";

export class OnboardingController {
  constructor(
    private readonly mentors: OnboardingPathUseCases,
    private readonly learners: OnboardingLearningUseCases,
  ) {}

  /** The signed-in user and the project the route guard has already checked. */
  private scope(req: Request): { userId: string; projectId: string } {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedError();
    if (!req.project) throw new NotFoundError("Workspace not found.");
    return { userId, projectId: req.project.id };
  }

  private handle(action: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await action(req, res);
      } catch (error) {
        next(error);
      }
    };
  }

  // ── Mentors: the project's paths ──

  public list = this.handle(async (req, res) => {
    const { projectId } = this.scope(req);
    sendSuccess(res, { paths: await this.mentors.list(projectId) });
  });

  public create = this.handle(async (req, res) => {
    const { userId, projectId } = this.scope(req);
    sendSuccess(res, { path: await this.mentors.create(projectId, userId, req.body) }, { statusCode: 201 });
  });

  public get = this.handle(async (req, res) => {
    const { projectId } = this.scope(req);
    sendSuccess(res, { path: await this.mentors.get(projectId, req.params.pathId) });
  });

  public update = this.handle(async (req, res) => {
    const { userId, projectId } = this.scope(req);
    sendSuccess(res, { path: await this.mentors.update(projectId, userId, req.params.pathId, req.body) });
  });

  public remove = this.handle(async (req, res) => {
    const { projectId } = this.scope(req);
    await this.mentors.remove(projectId, req.params.pathId);
    sendSuccess(res, { deleted: true });
  });

  // ── Mentors: giving a path to people and seeing how far they have got ──

  public progress = this.handle(async (req, res) => {
    const { projectId } = this.scope(req);
    sendSuccess(res, await this.mentors.progress(projectId, req.params.pathId));
  });

  public assign = this.handle(async (req, res) => {
    const { userId, projectId } = this.scope(req);
    sendSuccess(res, await this.mentors.assign(projectId, req.params.pathId, userId, req.body?.userIds));
  });

  public unassign = this.handle(async (req, res) => {
    const { projectId } = this.scope(req);
    await this.mentors.unassign(projectId, req.params.pathId, req.params.userId);
    sendSuccess(res, { unassigned: true });
  });

  // ── Learners: only ever their own paths and progress ──

  public myPaths = this.handle(async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedError();
    sendSuccess(res, { paths: await this.learners.myPaths(userId) });
  });

  public mine = this.handle(async (req, res) => {
    const { userId, projectId } = this.scope(req);
    sendSuccess(res, await this.learners.view(projectId, req.params.pathId, userId));
  });

  public complete = this.handle(async (req, res) => {
    const { userId, projectId } = this.scope(req);
    sendSuccess(res, await this.learners.complete(projectId, req.params.pathId, req.params.stepId, userId));
  });

  public answer = this.handle(async (req, res) => {
    const { userId, projectId } = this.scope(req);
    sendSuccess(res, await this.learners.answer(projectId, req.params.pathId, req.params.stepId, userId, req.body?.choice));
  });
}
