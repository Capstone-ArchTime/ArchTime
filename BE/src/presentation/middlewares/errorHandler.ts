import type { NextFunction, Request, Response } from "express";
import { AppError, TooManyRequestsError, ValidationError } from "../../shared/errors/AppError.js";
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

  if (err instanceof TooManyRequestsError) {
    const body: ErrorResponse = {
      success: false,
      error: { code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds },
    };
    res.set("Retry-After", String(err.retryAfterSeconds)).status(429).json(body);
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

  // ── Lỗi của Mongoose / MongoDB có thể nhận diện ─────────────────────────
  const name = (err as { name?: string } | null)?.name;
  if (name === "CastError") {
    const body: ErrorResponse = { success: false, error: { code: "BAD_REQUEST", message: "Invalid identifier." } };
    res.status(400).json(body);
    return;
  }
  if ((err as { code?: number } | null)?.code === 11000) {
    const body: ErrorResponse = { success: false, error: { code: "ALREADY_EXISTS", message: "This record already exists." } };
    res.status(409).json(body);
    return;
  }
  if (err instanceof SyntaxError && (err as { type?: string }).type === "entity.parse.failed") {
    const body: ErrorResponse = { success: false, error: { code: "BAD_REQUEST", message: "The request body is not valid JSON." } };
    res.status(400).json(body);
    return;
  }

  if ((err as { type?: string } | null)?.type === "entity.too.large") {
    const body: ErrorResponse = { success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." } };
    res.status(413).json(body);
    return;
  }

  // ── Lỗi không xác định (500) ─────────────────────────────────────────────
  // The detail goes to the server log only: it can name collections, fields or paths.
  console.error("[ErrorHandler]", err);

  const body: ErrorResponse = {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error." },
  };
  res.status(500).json(body);
}
