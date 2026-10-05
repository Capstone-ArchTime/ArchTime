import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { notFoundHandler } from "./presentation/middlewares/notFoundHandler.js";
import { errorHandler } from "./presentation/middlewares/errorHandler.js";
import healthRouter from "./presentation/routes/health.routes.js";
import { createAuthRouter } from "./presentation/routes/auth.routes.js";
import { createProjectRouter } from "./presentation/routes/project.routes.js";
import { setupSwagger } from "./presentation/swagger/swagger.js";
import {
  authController,
  projectController,
  jwtTokenService,
  memberController,
  projectRoleMiddleware,
  workspaceController,
} from "./container.js";
import { createGitHubRouter } from './presentation/routes/github.routes.js';
import { GitHubIdentityService } from './infrastructure/services/GitHubIdentityService.js';
import { GitHubLoginUseCase } from './application/use-cases/GitHubLoginUseCase.js';
import { MongoUserRepository } from './infrastructure/repositories/MongoUserRepository.js';
import { createAuthenticateMiddleware } from "./presentation/middlewares/authenticate.js";

export const app = express();

// ── Core Middleware ──
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());

// ── Swagger UI ──
setupSwagger(app);

// ── Routes ──
app.use("/api/health", healthRouter);
app.use('/api/auth/github', createGitHubRouter(env, new GitHubIdentityService(env.githubClientId, env.githubClientSecret, env.githubCallbackUrl), new GitHubLoginUseCase(), new MongoUserRepository(), jwtTokenService));
app.use("/api/auth", createAuthRouter(authController, jwtTokenService));
app.use(
  "/api/projects",
  createProjectRouter(
    projectController,
    jwtTokenService,
    memberController,
    projectRoleMiddleware,
    workspaceController,
  ),
);
app.get(
  "/api/team/members",
  createAuthenticateMiddleware(jwtTokenService),
  memberController.getTeamMembers,
);


// ── Error Handling ──
app.use(notFoundHandler);
app.use(errorHandler);
