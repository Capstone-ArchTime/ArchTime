import { Router } from "express";
import type { ProjectController } from "../controllers/ProjectController.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";

export function createProjectRouter(
  projectController: ProjectController,
  jwtTokenService: JwtTokenService
): Router {
  const router = Router();

  // Apply auth middleware to all project routes
  router.use(createAuthenticateMiddleware(jwtTokenService));

  router.post("/", projectController.registerProject);
  router.get("/", projectController.getProjects);
  router.get("/jobs", projectController.getMiningJobs); // must be before /:id
  router.post("/jobs/:jobId/cancel", projectController.cancelMiningJob);
  router.delete("/:id", projectController.deleteProject);
  router.post("/:id/scan", projectController.scanProject);
  router.post("/:id/mine", projectController.mineProject);
  router.get("/:id/mining", projectController.getMiningOverview);
  router.get("/:id/mining/estimate", projectController.estimateMining);
  router.get("/:id/snapshots", projectController.getSnapshots);
  router.get("/:id/snapshots/compare", projectController.compareSnapshots);
  router.get("/:id/evidences", projectController.getEvidences);
  router.get("/:id/architecture", projectController.getArchitecture);
  router.post("/:id/architecture", projectController.generateArchitecture);

  return router;
}
