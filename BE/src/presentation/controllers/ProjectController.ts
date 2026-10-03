import type { Request, Response, NextFunction } from "express";
import type { RegisterProjectUseCase } from "../../application/use-cases/projects/RegisterProjectUseCase.js";
import type { GetAllProjectsUseCase } from "../../application/use-cases/projects/GetAllProjectsUseCase.js";
import type { DeleteProjectUseCase } from "../../application/use-cases/projects/DeleteProjectUseCase.js";
import type { MineProjectUseCase } from "../../application/use-cases/projects/MineProjectUseCase.js";
import type { GetSnapshotsUseCase } from "../../application/use-cases/projects/GetSnapshotsUseCase.js";
import type { GetMiningJobsUseCase } from "../../application/use-cases/projects/GetMiningJobsUseCase.js";
import type { CompareSnapshotsUseCase } from "../../application/use-cases/projects/CompareSnapshotsUseCase.js";
import type { GetEvidencesUseCase } from "../../application/use-cases/projects/GetEvidencesUseCase.js";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess, parsePaginationParams, buildPaginationMeta } from "../../shared/utils/apiResponse.js";

export class ProjectController {
  constructor(
    private readonly registerProjectUseCase: RegisterProjectUseCase,
    private readonly getAllProjectsUseCase: GetAllProjectsUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
    private readonly mineProjectUseCase: MineProjectUseCase,
    private readonly getSnapshotsUseCase: GetSnapshotsUseCase,
    private readonly getMiningJobsUseCase: GetMiningJobsUseCase,
    private readonly compareSnapshotsUseCase: CompareSnapshotsUseCase,
    private readonly getEvidencesUseCase: GetEvidencesUseCase,
  ) {}

  public registerProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const { name, description, repoUrl, visibility, token } = req.body;

      const project = await this.registerProjectUseCase.execute({
        name,
        description,
        repoUrl,
        visibility,
        token,
        userId,
      });

      sendSuccess(res, { project }, {
        statusCode: 201,
        message: "Project registered successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  public getProjects = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const { page, limit, skip } = parsePaginationParams(req.query);
      const { items, total } = await this.getAllProjectsUseCase.execute(
        userId,
        skip,
        limit,
      );

      sendSuccess(res, { projects: items }, {
        meta: buildPaginationMeta(total, page, limit),
      });
    } catch (error) {
      next(error);
    }
  };

  public deleteProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const { id } = req.params;
      const deleted = await this.deleteProjectUseCase.execute(id, userId);

      if (!deleted) throw new NotFoundError("Project not found or unauthorized.");

      sendSuccess(res, null, { message: "Project deleted successfully." });
    } catch (error) {
      next(error);
    }
  };

  public mineProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const { id } = req.params;
      const jobId = await this.mineProjectUseCase.execute(id, userId);

      sendSuccess(res, { jobId }, { message: "Mining job started." });
    } catch (error) {
      next(error);
    }
  };

  public getSnapshots = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { page, limit, skip } = parsePaginationParams(req.query);
      const { items, total } = await this.getSnapshotsUseCase.execute(
        id,
        skip,
        limit,
      );

      sendSuccess(res, { snapshots: items }, {
        meta: buildPaginationMeta(total, page, limit),
      });
    } catch (error) {
      next(error);
    }
  };

  public getMiningJobs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { page, limit, skip } = parsePaginationParams(req.query);
      const { items, total } = await this.getMiningJobsUseCase.execute(
        skip,
        limit,
      );

      sendSuccess(res, { jobs: items }, {
        meta: buildPaginationMeta(total, page, limit),
      });
    } catch (error) {
      next(error);
    }
  };

  public compareSnapshots = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { baseId, targetId } = req.query;
      if (
        !baseId || !targetId ||
        typeof baseId !== "string" ||
        typeof targetId !== "string"
      ) {
        throw new BadRequestError(
          "Missing required query parameters: baseId, targetId.",
          "VALIDATION_ERROR",
        );
      }

      const result = await this.compareSnapshotsUseCase.execute(baseId, targetId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  public getEvidences = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { page, limit, skip } = parsePaginationParams(req.query);
      const { items, total } = await this.getEvidencesUseCase.execute(
        id,
        skip,
        limit,
      );

      sendSuccess(res, { evidences: items }, {
        meta: buildPaginationMeta(total, page, limit),
      });
    } catch (error) {
      next(error);
    }
  };
}
