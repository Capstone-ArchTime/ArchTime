import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  const message =
    err instanceof Error ? err.message : "Internal server error";
  console.error(err);
  res.status(500).json({ error: message });
}
