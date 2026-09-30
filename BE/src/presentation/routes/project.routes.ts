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
  router.delete("/:id", projectController.deleteProject);

  return router;
}
