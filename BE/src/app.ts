import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { notFoundHandler } from "./presentation/middlewares/notFoundHandler.js";
import { errorHandler } from "./presentation/middlewares/errorHandler.js";
import healthRouter from "./presentation/routes/health.routes.js";
import { createAuthRouter } from "./presentation/routes/auth.routes.js";
import { setupSwagger } from "./presentation/swagger/swagger.js";
import { authController, jwtTokenService } from "./container.js";

export const app = express();

// ── Core Middleware ──
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

// ── Swagger UI ──
setupSwagger(app);

// ── Routes ──
app.use("/api/health", healthRouter);
app.use("/api/auth", createAuthRouter(authController, jwtTokenService));

// ── Error Handling ──
app.use(notFoundHandler);
app.use(errorHandler);
