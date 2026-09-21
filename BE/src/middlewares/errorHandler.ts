import type { NextFunction, Request, Response } from "express";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  console.error(err);
  res.status(500).json({ error: message });
}
