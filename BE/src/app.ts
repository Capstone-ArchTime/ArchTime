import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { notFoundHandler } from "./presentation/middlewares/notFoundHandler.js";
import { errorHandler } from "./presentation/middlewares/errorHandler.js";
import healthRouter from "./presentation/routes/health.routes.js";
import { createAuthRouter } from "./presentation/routes/auth.routes.js";
import { createProjectRouter } from "./presentation/routes/project.routes.js";
import { setupSwagger } from "./presentation/swagger/swagger.js";
import { createAdminRouter } from "./presentation/routes/admin.routes.js";
import {
  authController,
  projectController,
  jwtTokenService,
  memberController,
  projectRoleMiddleware,
  workspaceController,
  adminControllersConfig,
  projectMaintainerController,
  llmController,
  projectChatController,
  organizationController,
  onboardingController,
} from "./container.js";
import { createOrganizationRouter } from "./presentation/routes/organization.routes.js";
import { createRevisionRouter } from "./presentation/routes/revision.routes.js";
import { createLearningRouter, createOnboardingRouter } from "./presentation/routes/onboarding.routes.js";
import { createLlmRouter } from "./presentation/routes/llm.routes.js";
import { createProjectChatRouter } from "./presentation/routes/projectChat.routes.js";
import { createGitHubRouter } from './presentation/routes/github.routes.js';
import { GitHubIdentityService } from './infrastructure/services/GitHubIdentityService.js';
import { GitHubLoginUseCase } from './application/use-cases/GitHubLoginUseCase.js';
import { MongoUserRepository } from './infrastructure/repositories/MongoUserRepository.js';
import { createAuthenticateMiddleware } from "./presentation/middlewares/authenticate.js";
import { createInvitationRouter } from "./presentation/routes/invitation.routes.js";

export const app = express();

// ── Core Middleware ──
app.use(cors({ origin: env.corsOrigin, credentials: true }));
// A learning path can hold 50 steps of up to 4000 characters each (Vietnamese text takes up to 3 bytes a character), more than the 100 KB default.
app.use(express.json({ limit: "2mb" }));

// ── Swagger UI ──
setupSwagger(app);

// ── Routes ──
app.use("/api/health", healthRouter);
app.use('/api/auth/github', createGitHubRouter(env, new GitHubIdentityService(env.githubClientId, env.githubClientSecret, env.githubCallbackUrl), new GitHubLoginUseCase(), new MongoUserRepository(), jwtTokenService));
app.use("/api/auth", createAuthRouter(authController, jwtTokenService));
app.use("/api/projects", createProjectChatRouter(projectChatController, jwtTokenService, projectRoleMiddleware));
app.use("/api/projects", createRevisionRouter(jwtTokenService, projectRoleMiddleware));
app.use("/api/projects", createOnboardingRouter(onboardingController, jwtTokenService, projectRoleMiddleware));
app.use("/api/onboarding", createLearningRouter(onboardingController, jwtTokenService));
app.use(
  "/api/projects",
  createProjectRouter(
    projectController,
    jwtTokenService,
    memberController,
    projectRoleMiddleware,
    workspaceController,
    projectMaintainerController,
  ),
);
app.use("/api/invitations", createInvitationRouter(projectMaintainerController));
app.get(
  "/api/team/members",
  createAuthenticateMiddleware(jwtTokenService),
  memberController.getTeamMembers,
);
app.use("/api/llm", createLlmRouter(llmController, jwtTokenService));
app.use("/api/organizations", createOrganizationRouter(organizationController, jwtTokenService));
app.use("/api/admin", createAdminRouter(adminControllersConfig, jwtTokenService));

// ── Error Handling ──
app.use(notFoundHandler);
app.use(errorHandler);
