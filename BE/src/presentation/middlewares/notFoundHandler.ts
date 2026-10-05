import type { Request, Response } from "express";
import type { ErrorResponse } from "../../shared/utils/apiResponse.js";

export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorResponse = {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  };
  res.status(404).json(body);
}
