import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ArchTime API",
      version: "0.1.0",
      description:
        "Evidence-based software architecture evolution reconstruction API. " +
        "Mine Git history and source code to rebuild how a system's architecture changed over time.",
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Paste the **accessToken** returned from /api/auth/login or /api/auth/verify-email",
        },
      },
      schemas: {
        // ── Cấu trúc response chuẩn ────────────────────────────────────────
        PaginationMeta: {
          type: "object",
          description: "Metadata phân trang đính kèm trong response danh sách",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 10 },
            total: { type: "integer", example: 42 },
            totalPages: { type: "integer", example: 5 },
          },
        },
        SuccessResponse: {
          type: "object",
          description: "Cấu trúc response thành công chuẩn",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object", description: "Payload thực tế của response" },
            message: { type: "string", example: "Thao tác thành công." },
            meta: { $ref: "#/components/schemas/PaginationMeta" },
          },
        },
        ErrorResponse: {
          type: "object",
          description: "Cấu trúc response lỗi chuẩn",
          required: ["success", "error"],
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  description: "Mã lỗi chuẩn để FE xử lý phân loại",
                  enum: [
                    "INVALID_CREDENTIALS", "TOKEN_EXPIRED", "TOKEN_INVALID", "SESSION_REVOKED",
                    "EMAIL_NOT_VERIFIED", "EMAIL_ALREADY_VERIFIED", "OTP_INVALID", "OTP_EXPIRED",
                    "RESET_TOKEN_INVALID", "RESET_TOKEN_EXPIRED",
                    "NOT_FOUND", "ALREADY_EXISTS", "CONFLICT",
                    "UNAUTHORIZED", "FORBIDDEN",
                    "VALIDATION_ERROR", "BAD_REQUEST",
                    "INTERNAL_ERROR", "SERVICE_UNAVAILABLE",
                  ],
                  example: "VALIDATION_ERROR",
                },
                message: { type: "string", example: "Fields required: email, password." },
                fields: {
                  type: "object",
                  description: "Chi tiết lỗi từng trường (chỉ có khi code = VALIDATION_ERROR)",
                  additionalProperties: { type: "string" },
                  example: { email: "Invalid email format", password: "Password too short" },
                },
              },
            },
          },
        },
        // ── Domain schemas ─────────────────────────────────────────────────
        User: {
          type: "object",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            name: { type: "string", example: "Jane Doe" },
            email: { type: "string", format: "email", example: "dev@archtime.io" },
            role: {
              type: "string",
              enum: [
                "developer-analyst",
                "project-maintainer",
                "system-administrator",
              ],
              example: "developer-analyst",
            },
            isVerified: { type: "boolean", example: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Tokens: {
          type: "object",
          properties: {
            accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiJ9..." },
            refreshToken: { type: "string", example: "eyJhbGciOiJIUzI1NiJ9..." },
          },
        },
        Project: {
          type: "object",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            name: { type: "string", example: "My Repo" },
            description: { type: "string", example: "A sample project" },
            repoUrl: { type: "string", format: "uri", example: "https://github.com/org/repo" },
            visibility: { type: "string", enum: ["public", "private"], example: "public" },
            status: {
              type: "string",
              enum: ["pending", "mining", "done", "failed"],
              example: "done",
            },
            userId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        MiningJob: {
          type: "object",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d2" },
            projectId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            requestedBy: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            status: {
              type: "string",
              enum: ["queued", "running", "completed", "failed"],
              example: "completed",
            },
            stage: { type: "string", example: "Parsing AST" },
            progress: { type: "number", example: 75 },
            error: { type: "string", example: "Clone failed: repository not found" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Snapshot: {
          type: "object",
          description: "Một snapshot kiến trúc tại thời điểm commit",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d3" },
            projectId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            hash: { type: "string", example: "a1b2c3d4e5f6" },
            version: { type: "string", example: "v1.2.0" },
            title: { type: "string", example: "feat: add payment module" },
            author: { type: "string", example: "dev@archtime.io" },
            date: { type: "string", format: "date-time" },
            branches: {
              type: "array",
              items: { type: "string" },
              example: ["main", "develop"],
            },
            files: { type: "integer", example: 42 },
            archChanges: { type: "integer", example: 3 },
            depAdded: { type: "integer", example: 5 },
            depRemoved: { type: "integer", example: 2 },
            nodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  type: { type: "string" },
                },
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  source: { type: "string" },
                  target: { type: "string" },
                  type: { type: "string" },
                },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Evidence: {
          type: "object",
          description: "Bằng chứng kiến trúc trích xuất từ Git history",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d4" },
            projectId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            changeTitle: { type: "string", example: "Extract payment-service from monolith" },
            type: {
              type: "string",
              enum: ["MODULE EXTRACTION", "DEPENDENCY CHANGE", "MODULE SPLIT"],
              example: "MODULE EXTRACTION",
            },
            repository: { type: "string", example: "https://github.com/org/repo" },
            commit: { type: "string", example: "a1b2c3d" },
            files: { type: "integer", example: 12 },
            date: { type: "string", format: "date-time" },
            summary: { type: "string", example: "Payment logic extracted into a separate module with dedicated dependencies." },
            depsAdded: { type: "integer", example: 3 },
            depsRemoved: { type: "integer", example: 1 },
            sourceFiles: {
              type: "array",
              items: { type: "string" },
              example: ["src/payment/PaymentService.java", "src/payment/PaymentRepository.java"],
            },
            diffBefore: { type: "string", example: "- import com.app.payment.*;" },
            diffAfter: { type: "string", example: "+ import com.payment.service.*;" },
          },
        },
        ProjectMember: {
          type: "object",
          description: "Thành viên dự án với vai trò cụ thể",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d5" },
            projectId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            userId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d0" },
            email: { type: "string", format: "email", example: "dev@archtime.io" },
            name: { type: "string", example: "Alice Dev" },
            role: {
              type: "string",
              enum: ["developer-analyst", "project-maintainer"],
              example: "developer-analyst",
            },
            status: {
              type: "string",
              enum: ["active", "invited"],
              example: "active",
            },
            invitedBy: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d0" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TeamMember: {
          type: "object",
          description: "Thông tin thành viên nhóm tổng hợp qua các dự án",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d5" },
            name: { type: "string", example: "Alice Dev" },
            email: { type: "string", format: "email", example: "dev@archtime.io" },
            role: {
              type: "string",
              enum: ["developer-analyst", "project-maintainer"],
              example: "developer-analyst",
            },
            status: {
              type: "string",
              enum: ["active", "invited"],
              example: "active",
            },
            projects: {
              type: "array",
              items: { type: "string" },
              example: ["64f1a2b3c4d5e6f7a8b9c0d1"],
            },
          },
        },
      },

      // ── Responses tái sử dụng ─────────────────────────────────────────────
      responses: {
        Unauthorized: {
          description: "Thiếu hoặc sai Bearer token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                success: false,
                error: { code: "UNAUTHORIZED", message: "Invalid or expired access token." },
              },
            },
          },
        },
        Forbidden: {
          description: "Không đủ quyền thực hiện hành động này",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                success: false,
                error: { code: "FORBIDDEN", message: "Forbidden." },
              },
            },
          },
        },
        NotFound: {
          description: "Không tìm thấy tài nguyên",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                success: false,
                error: { code: "NOT_FOUND", message: "Not found." },
              },
            },
          },
        },
        ValidationError: {
          description: "Dữ liệu đầu vào không hợp lệ",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: "Fields required: email, password.",
                },
              },
            },
          },
        },
        InternalError: {
          description: "Lỗi server không xác định",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                success: false,
                error: { code: "INTERNAL_ERROR", message: "Internal server error" },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Xác thực và quản lý tài khoản" },
      { name: "GitHub OAuth", description: "Đăng nhập qua GitHub" },
      { name: "Projects", description: "Quản lý dự án và kho code" },
      { name: "Health", description: "Kiểm tra trạng thái server" },
    ],
  },
  // Scan all route files for @swagger JSDoc comments
  apis: ["./src/presentation/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "ArchTime API Docs",
      swaggerOptions: {
        persistAuthorization: true, // Keep token after page refresh
        docExpansion: "list",
        filter: true,
        tagsSorter: "alpha",
      },
    }),
  );

  // Also expose raw spec as JSON for external tools
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
