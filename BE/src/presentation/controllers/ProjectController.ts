import type { Request, Response, NextFunction } from "express";
import type { RegisterProjectUseCase } from "../../application/use-cases/projects/RegisterProjectUseCase.js";
import type { GetAllProjectsUseCase } from "../../application/use-cases/projects/GetAllProjectsUseCase.js";
import type { GetProjectByIdUseCase } from "../../application/use-cases/projects/GetProjectByIdUseCase.js";
import type { DeleteProjectUseCase } from "../../application/use-cases/projects/DeleteProjectUseCase.js";
import type { MineProjectUseCase } from "../../application/use-cases/projects/MineProjectUseCase.js";
import type { GetSnapshotsUseCase } from "../../application/use-cases/projects/GetSnapshotsUseCase.js";
import type { GetMiningJobsUseCase } from "../../application/use-cases/projects/GetMiningJobsUseCase.js";
import type { CompareSnapshotsUseCase } from "../../application/use-cases/projects/CompareSnapshotsUseCase.js";
import { MiningWorkflowUseCase } from "../../application/use-cases/projects/MiningWorkflowUseCase.js";
import { ArchitectureUseCase } from "../../application/use-cases/projects/ArchitectureUseCase.js";
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
    private readonly getProjectByIdUseCase: GetProjectByIdUseCase | undefined,
    private readonly miningWorkflowUseCase: MiningWorkflowUseCase = new MiningWorkflowUseCase(),
    private readonly architectureUseCase: ArchitectureUseCase = new ArchitectureUseCase(),
  ) {}

  public registerProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const { name, description, repoUrl, visibility, token, organizationId, credentialId } = req.body;

      const project = await this.registerProjectUseCase.execute({
        name,
        description,
        repoUrl,
        visibility,
        token,
        userId,
        organizationId,
        credentialId,
      });

      sendSuccess(res, { project }, {
        statusCode: 201,
        message: "Workspace registered successfully.",
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
      const scope = req.query.scope as any;
      const search = (req.query.search ?? req.query.q) as string | undefined;

      const { items, total } = await this.getAllProjectsUseCase.execute({
        userId,
        userRole: req.user?.role,
        scope,
        search,
        skip,
        limit,
      });

      sendSuccess(res, { projects: items }, {
        meta: buildPaginationMeta(total, page, limit),
      });
    } catch (error) {
      next(error);
    }
  };

  public getProjectById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const { id } = req.params;
      if (this.getProjectByIdUseCase) {
        const project = await this.getProjectByIdUseCase.execute(
          id,
          userId,
          req.user?.role,
          req.projectAccess,
        );
        sendSuccess(res, { project });
      } else {
        // Fallback to repository
        const project = req.project;
        if (!project) throw new NotFoundError("Workspace not found.");
        sendSuccess(res, { project });
      }
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

      // checkRole("owner") has already allowed only the project owner or an owner of its organization.
      const { id } = req.params;
      const deleted = await this.deleteProjectUseCase.execute(id);

      if (!deleted) throw new NotFoundError("Workspace not found or unauthorized.");

      sendSuccess(res, null, { message: "Workspace deleted successfully." });
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
      const jobId = await this.mineProjectUseCase.execute(id, userId, req.body);

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
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError();

      const summary = req.query.summary === "1" || req.query.summary === "true";
      const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;

      if (hasPagination) {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const result = (await this.getSnapshotsUseCase.execute(id, userId, {
          summary,
          skip,
          limit,
        })) as { items: any[]; total: number };

        sendSuccess(res, { snapshots: result.items }, {
          meta: buildPaginationMeta(result.total, page, limit),
        });
      } else {
        const snapshots = (await this.getSnapshotsUseCase.execute(
          id,
          userId,
          summary,
        )) as any[];
        sendSuccess(res, { snapshots });
      }
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
        req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
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

      const result = await this.compareSnapshotsUseCase.execute(baseId, targetId, req.params.id);
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

  public scanProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const jobId = await this.miningWorkflowUseCase.scan(req.params.id, userId);
      res.status(202).json({ success: true, data: { jobId } });
    } catch (error: any) {
      next(error);
    }
  };

  public getMiningOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const overview = await this.miningWorkflowUseCase.overview(req.params.id, userId);
      res.status(200).json({ success: true, data: overview });
    } catch (error: any) {
      next(error);
    }
  };

  public estimateMining = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const estimate = await this.miningWorkflowUseCase.estimate(req.params.id, userId, req.query);
      res.status(200).json({ success: true, data: estimate });
    } catch (error: any) {
      next(error);
    }
  };

  public cancelMiningJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const job = await this.miningWorkflowUseCase.cancel(req.params.jobId, { userId, role: req.user!.role });
      res.status(200).json({ success: true, data: { job } });
    } catch (error: any) {
      next(error);
    }
  };

  public getArchitecture = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const data = await this.architectureUseCase.get(req.params.id, userId, req.query.snapshotId);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      next(error);
    }
  };

  public generateArchitecture = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const data = await this.architectureUseCase.generate(req.params.id, userId, req.body);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      next(error);
    }
  };

  public refineArchitecture = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const jobId = await this.architectureUseCase.refine(req.params.id, userId, req.body);
      res.status(202).json({ success: true, data: { jobId } });
    } catch (error: any) {
      next(error);
    }
  };

  public getArchitectureReference = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      res.status(200).json({ success: true, data: { components: await this.architectureUseCase.getReference(req.params.id, userId) } });
    } catch (error: any) {
      next(error);
    }
  };

  public getArchitectureMatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      res.status(200).json({ success: true, data: await this.architectureUseCase.match(req.params.id, userId, req.query) });
    } catch (error: any) {
      next(error);
    }
  };

  public getArchitectureLineage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      res.status(200).json({ success: true, data: await this.architectureUseCase.lineage(req.params.id, userId) });
    } catch (error: any) {
      next(error);
    }
  };

  public getArchitectureEvaluation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      res.status(200).json({ success: true, data: await this.architectureUseCase.evaluation(req.params.id, userId, req.query) });
    } catch (error: any) {
      next(error);
    }
  };

  public saveArchitectureReference = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      res.status(200).json({ success: true, data: { components: await this.architectureUseCase.saveReference(req.params.id, userId, req.body) } });
    } catch (error: any) {
      next(error);
    }
  };

  public getArchitectureRuns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      // Maintainers and owners (who may write to the project) see every user's runs; anyone else, only their own.
      const { runs, totals, meta } = await this.architectureUseCase.runs(req.params.id, userId, req.query, req.projectAccess?.actions.has("write") === true);
      res.status(200).json({ success: true, data: { runs, totals }, meta });
    } catch (error: any) {
      next(error);
    }
  };
}
