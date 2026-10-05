import type { NextFunction, Request, Response } from "express";
import { AppError, ValidationError } from "../../shared/errors/AppError.js";
import type { ErrorResponse } from "../../shared/utils/apiResponse.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  // ── Lỗi từ AppError (có code chuẩn) ──────────────────────────────────────
  if (err instanceof ValidationError) {
    const body: ErrorResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof AppError) {
    const body: ErrorResponse = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // ── Lỗi không xác định (500) ─────────────────────────────────────────────
  const message =
    err instanceof Error ? err.message : "Internal server error";

  if (process.env.NODE_ENV !== "production") {
    console.error("[ErrorHandler]", err);
  }

  const body: ErrorResponse = {
    success: false,
    error: { code: "INTERNAL_ERROR", message },
  };
  res.status(500).json(body);
}
