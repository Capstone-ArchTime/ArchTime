import type { Request, Response, NextFunction } from "express";
import type { RegisterProjectUseCase } from "../../application/use-cases/projects/RegisterProjectUseCase.js";
import type { GetAllProjectsUseCase } from "../../application/use-cases/projects/GetAllProjectsUseCase.js";
import type { DeleteProjectUseCase } from "../../application/use-cases/projects/DeleteProjectUseCase.js";
import type { MineProjectUseCase } from "../../application/use-cases/projects/MineProjectUseCase.js";
import type { GetSnapshotsUseCase } from "../../application/use-cases/projects/GetSnapshotsUseCase.js";
import type { GetMiningJobsUseCase } from "../../application/use-cases/projects/GetMiningJobsUseCase.js";

export class ProjectController {
  constructor(
    private readonly registerProjectUseCase: RegisterProjectUseCase,
    private readonly getAllProjectsUseCase: GetAllProjectsUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
    private readonly mineProjectUseCase: MineProjectUseCase,
    private readonly getSnapshotsUseCase: GetSnapshotsUseCase,
    private readonly getMiningJobsUseCase: GetMiningJobsUseCase,
  ) {}

  public registerProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name, description, repoUrl, visibility, token } = req.body;
      const userId = (req as any).user?.userId;
      
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const project = await this.registerProjectUseCase.execute({
        name,
        description,
        repoUrl,
        visibility,
        token,
        userId,
      });

      res.status(201).json({
        success: true,
        message: "Project registered successfully",
        data: { project },
      });
    } catch (error: any) {
      next(error);
    }
  };

  public getProjects = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const projects = await this.getAllProjectsUseCase.execute(userId);

      res.status(200).json({
        success: true,
        data: { projects },
      });
    } catch (error: any) {
      next(error);
    }
  };

  public deleteProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.userId;
      
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const success = await this.deleteProjectUseCase.execute(id, userId);

      if (success) {
        res.status(200).json({ success: true, message: "Project deleted successfully" });
      } else {
        res.status(404).json({ success: false, message: "Project not found or unauthorized" });
      }
    } catch (error: any) {
      next(error);
    }
  };

  public mineProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const jobId = await this.mineProjectUseCase.execute(id, userId);
      res.status(200).json({ success: true, data: { jobId } });
    } catch (error: any) {
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
      const snapshots = await this.getSnapshotsUseCase.execute(id);
      res.status(200).json({ success: true, data: { snapshots } });
    } catch (error: any) {
      next(error);
    }
  };

  public getMiningJobs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const jobs = await this.getMiningJobsUseCase.execute();
      res.status(200).json({ success: true, data: { jobs } });
    } catch (error: any) {
      next(error);
    }
  };
}
