import type { Response } from "express";
import type { ErrorCode } from "../errors/AppError.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Kết quả đã phân trang từ DB — use case trả về kiểu này */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>; // validation chi tiết từng trường
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Gửi response thành công có cấu trúc chuẩn */
export function sendSuccess<T>(
  res: Response,
  data: T,
  options: {
    statusCode?: number;
    message?: string;
    meta?: PaginationMeta;
  } = {},
): void {
  const { statusCode = 200, message, meta } = options;
  const body: SuccessResponse<T> = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  res.status(statusCode).json(body);
}

/** Tạo metadata phân trang từ total và params */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/** Parse và validate tham số phân trang từ query string */
export function parsePaginationParams(query: Record<string, unknown>): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const rawLimit = parseInt(String(query.limit ?? "10"), 10) || 10;
  const limit = Math.min(Math.max(1, rawLimit), 100); // giới hạn 1–100
  return { page, limit, skip: (page - 1) * limit };
}
