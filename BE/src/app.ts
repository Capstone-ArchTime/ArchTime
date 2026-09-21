import express from "express";
import cors from "cors";
import { env } from "@/config/env.js";
import { notFoundHandler } from "@/middlewares/notFoundHandler.js";
import { errorHandler } from "@/middlewares/errorHandler.js";
import healthRouter from "@/routes/health.routes.js";

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.use("/api/health", healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);
