// ── Mã lỗi chuẩn hóa ──────────────────────────────────────────────────────────
// FE dùng code này để phân biệt loại lỗi thay vì parse message text
export type ErrorCode =
  // Auth
  | "INVALID_CREDENTIALS"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "SESSION_REVOKED"
  | "EMAIL_NOT_VERIFIED"
  | "EMAIL_ALREADY_VERIFIED"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "OTP_LOCKED" // too many wrong guesses on one emailed code: a new code must be requested (HTTP 429)
  | "RESET_TOKEN_INVALID"
  | "RESET_TOKEN_EXPIRED"
  // Resource
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  // Permission
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  // Input
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  // Server
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

// ── Base ──────────────────────────────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── 400 ───────────────────────────────────────────────────────────────────────
export class BadRequestError extends AppError {
  constructor(message = "Bad request", code: ErrorCode = "BAD_REQUEST") {
    super(400, code, message);
  }
}

export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;
  constructor(message = "Validation failed", fields?: Record<string, string>) {
    super(400, "VALIDATION_ERROR", message);
    this.fields = fields;
  }
}

// ── 401 ───────────────────────────────────────────────────────────────────────
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code: ErrorCode = "UNAUTHORIZED") {
    super(401, code, message);
  }
}

// ── 403 ───────────────────────────────────────────────────────────────────────
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code: ErrorCode = "FORBIDDEN") {
    super(403, code, message);
  }
}

// ── 404 ───────────────────────────────────────────────────────────────────────
export class NotFoundError extends AppError {
  constructor(message = "Not found", code: ErrorCode = "NOT_FOUND") {
    super(404, code, message);
  }
}

// ── 429 ───────────────────────────────────────────────────────────────────────
/** A rate limit was hit. The error handler sends it as 429 with a Retry-After header and `retryAfterSeconds` in the body. */
export class TooManyRequestsError extends AppError {
  public readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
    super(429, "RATE_LIMITED", `Too many requests. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`);
    this.retryAfterSeconds = seconds;
  }
}

// ── 409 ───────────────────────────────────────────────────────────────────────
export class ConflictError extends AppError {
  constructor(message = "Resource already exists", code: ErrorCode = "ALREADY_EXISTS") {
    super(409, code, message);
  }
}
