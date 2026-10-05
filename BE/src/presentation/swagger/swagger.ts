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
            status: {
              type: "string",
              enum: ["active", "suspended"],
              example: "active",
            },
            isVerified: { type: "boolean", example: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        AdminUser: {
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
            status: {
              type: "string",
              enum: ["active", "suspended"],
              example: "active",
            },
            isVerified: { type: "boolean", example: true },
            tokenVersion: { type: "integer", example: 1 },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        InviteUserRequest: {
          type: "object",
          required: ["name", "email", "role"],
          properties: {
            name: { type: "string", example: "Jane Doe" },
            email: { type: "string", format: "email", example: "jane.doe@example.com" },
            role: {
              type: "string",
              enum: ["developer-analyst", "project-maintainer", "system-administrator"],
              example: "developer-analyst",
            },
            temporaryPassword: { type: "string", example: "ArchTime#2026!" },
          },
        },
        UpdateRoleRequest: {
          type: "object",
          required: ["role"],
          properties: {
            role: {
              type: "string",
              enum: ["developer-analyst", "project-maintainer", "system-administrator"],
              example: "project-maintainer",
            },
          },
        },
        SuspendUserRequest: {
          type: "object",
          properties: {
            reason: { type: "string", example: "Policy violation" },
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
        WorkspaceComponent: {
          type: "object",
          required: ["id", "name", "kind", "description"],
          properties: {
            id: { type: "string", example: "web" },
            name: { type: "string", example: "Web Application" },
            kind: { type: "string", example: "UI" },
            description: { type: "string", example: "User-facing application interface" },
          },
        },
        WorkspaceDependency: {
          type: "object",
          required: ["id", "source", "target", "label"],
          properties: {
            id: { type: "string", example: "e1" },
            source: { type: "string", example: "web" },
            target: { type: "string", example: "api" },
            label: { type: "string", example: "HTTPS" },
          },
        },
        WorkspaceDiagram: {
          type: "object",
          required: ["components", "dependencies", "revision"],
          properties: {
            components: {
              type: "array",
              items: { $ref: "#/components/schemas/WorkspaceComponent" },
            },
            dependencies: {
              type: "array",
              items: { $ref: "#/components/schemas/WorkspaceDependency" },
            },
            revision: { type: "integer", example: 1 },
            confirmedAt: { type: "string", format: "date-time", nullable: true },
            confirmedBy: { type: "string", nullable: true },
          },
        },
        WorkspaceRule: {
          type: "object",
          required: ["id", "name", "source", "target", "constraint", "severity", "rationale", "enabled"],
          properties: {
            id: { type: "string", example: "r1" },
            name: { type: "string", example: "UI should not access DB directly" },
            source: { type: "string", example: "web" },
            target: { type: "string", example: "db" },
            constraint: { type: "string", enum: ["forbidden", "required"], example: "forbidden" },
            severity: { type: "string", enum: ["error", "warning"], example: "error" },
            rationale: { type: "string", example: "Presentation layer must call backend APIs." },
            enabled: { type: "boolean", example: true },
          },
        },
        WorkspaceDecision: {
          type: "object",
          required: ["id", "number", "title", "status", "context", "decision", "alternatives", "consequences", "componentIds"],
          properties: {
            id: { type: "string", example: "d1" },
            number: { type: "integer", example: 1 },
            title: { type: "string", example: "Use PostgreSQL for transactional datastore" },
            status: { type: "string", enum: ["Proposed", "Accepted", "Deprecated"], example: "Accepted" },
            context: { type: "string", example: "Need ACID transactions for billing" },
            decision: { type: "string", example: "Adopt PostgreSQL as the primary RDBMS" },
            alternatives: { type: "string", example: "MongoDB, MySQL" },
            consequences: { type: "string", example: "Requires relational schema migrations" },
            componentIds: {
              type: "array",
              items: { type: "string" },
              example: ["db"],
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Workspace: {
          type: "object",
          description: "Dữ liệu kiến trúc workspace của một dự án",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            projectId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            revision: { type: "integer", example: 1 },
            diagram: { $ref: "#/components/schemas/WorkspaceDiagram" },
            rules: {
              type: "array",
              items: { $ref: "#/components/schemas/WorkspaceRule" },
            },
            decisions: {
              type: "array",
              items: { $ref: "#/components/schemas/WorkspaceDecision" },
            },
            updatedBy: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d0" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        // ── Admin SA Schemas ───────────────────────────────────────────────
        AdminMiningJob: {
          type: "object",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            projectId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d0" },
            projectName: { type: "string", example: "backend-core" },
            requestedBy: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d2" },
            requestedByEmail: { type: "string", example: "dev@archtime.io" },
            kind: { type: "string", enum: ["scan", "mine", "abstract"], example: "mine" },
            status: { type: "string", enum: ["queued", "running", "completed", "failed", "cancelled"], example: "running" },
            progress: { type: "number", example: 45 },
            stage: { type: "string", example: "Cloning repository" },
            startedAt: { type: "string", format: "date-time" },
            finishedAt: { type: "string", format: "date-time" },
            cancelledAt: { type: "string", format: "date-time" },
            cancelledBy: { type: "string", example: "admin@archtime.io" },
            errorMessage: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        AuditLog: {
          type: "object",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            action: { type: "string", example: "USER_INVITED" },
            userId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d0" },
            userEmail: { type: "string", example: "admin@archtime.io" },
            targetType: { type: "string", example: "USER" },
            targetId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d2" },
            details: { type: "object" },
            ipAddress: { type: "string", example: "127.0.0.1" },
            userAgent: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ApiKey: {
          type: "object",
          properties: {
            id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
            name: { type: "string", example: "CI Production Pipeline" },
            keyPrefix: { type: "string", example: "arch_live_a1b2..." },
            createdAt: { type: "string", format: "date-time" },
            lastUsedAt: { type: "string", format: "date-time" },
            revokedAt: { type: "string", format: "date-time" },
            createdBy: { type: "string", example: "admin@archtime.io" },
          },
        },
        SystemSettings: {
          type: "object",
          properties: {
            maxConcurrentJobs: { type: "integer", example: 5 },
            maxRepoSizeMb: { type: "integer", example: 500 },
            miningTimeoutMinutes: { type: "integer", example: 60 },
            defaultLlmProvider: { type: "string", enum: ["gemini", "claude", "openai", "none"], example: "gemini" },
            maintenanceMode: { type: "boolean", example: false },
            allowPublicRegistration: { type: "boolean", example: true },
            apiKeys: {
              type: "array",
              items: { $ref: "#/components/schemas/ApiKey" },
            },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        SystemMetrics: {
          type: "object",
          properties: {
            server: {
              type: "object",
              properties: {
                cpuUsagePercent: { type: "number", example: 12.5 },
                cpuCores: { type: "integer", example: 8 },
                memoryUsageMb: { type: "number", example: 142.5 },
                totalMemoryMb: { type: "number", example: 16384 },
                memoryUsagePercent: { type: "number", example: 55.2 },
                nodeUptimeSeconds: { type: "number", example: 3600 },
                osUptimeSeconds: { type: "number", example: 86400 },
                platform: { type: "string", example: "win32" },
                nodeVersion: { type: "string", example: "v20.10.0" },
              },
            },
            database: {
              type: "object",
              properties: {
                totalProjects: { type: "integer", example: 15 },
                totalUsers: { type: "integer", example: 42 },
                activeUsers: { type: "integer", example: 38 },
                suspendedUsers: { type: "integer", example: 4 },
                totalSnapshots: { type: "integer", example: 120 },
                jobs: {
                  type: "object",
                  properties: {
                    total: { type: "integer", example: 50 },
                    queued: { type: "integer", example: 2 },
                    running: { type: "integer", example: 1 },
                    completed: { type: "integer", example: 45 },
                    failed: { type: "integer", example: 2 },
                  },
                },
              },
            },
          },
        },
        ServicesStatus: {
          type: "object",
          properties: {
            database: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["connected", "disconnected"], example: "connected" },
                latencyMs: { type: "number", example: 4.2 },
              },
            },
            git: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["operational", "degraded"], example: "operational" },
                version: { type: "string", example: "git version 2.43.0" },
              },
            },
            smtp: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["configured", "not_configured"], example: "configured" },
                host: { type: "string", example: "smtp.sendgrid.net" },
              },
            },
            aiProviders: {
              type: "object",
              properties: {
                gemini: { type: "string", enum: ["configured", "not_configured"], example: "configured" },
                claude: { type: "string", enum: ["configured", "not_configured"], example: "not_configured" },
                openai: { type: "string", enum: ["configured", "not_configured"], example: "not_configured" },
              },
            },
          },
        },
        // ── Project Maintainer (PM) Schemas ────────────────────────────────
        ProjectDashboard: {
          type: "object",
          properties: {
            project: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                repoUrl: { type: "string" },
                visibility: { type: "string" },
                status: { type: "string" },
              },
            },
            healthScore: { type: "integer", example: 85 },
            architecture: {
              type: "object",
              properties: {
                revision: { type: "integer" },
                componentsCount: { type: "integer" },
                dependenciesCount: { type: "integer" },
                isConfirmed: { type: "boolean" },
                confirmedAt: { type: "string", format: "date-time" },
              },
            },
            rules: {
              type: "object",
              properties: {
                total: { type: "integer" },
                active: { type: "integer" },
                compliancePercent: { type: "number", example: 92 },
                violationsCount: { type: "integer" },
              },
            },
            decisions: {
              type: "object",
              properties: {
                total: { type: "integer" },
                accepted: { type: "integer" },
                proposed: { type: "integer" },
              },
            },
            approvals: {
              type: "object",
              properties: {
                pendingCount: { type: "integer" },
                totalCount: { type: "integer" },
              },
            },
            team: {
              type: "object",
              properties: {
                totalMembers: { type: "integer" },
                maintainersCount: { type: "integer" },
                membersCount: { type: "integer" },
              },
            },
          },
        },
        RuleEvaluationSummary: {
          type: "object",
          properties: {
            totalRules: { type: "integer", example: 5 },
            evaluatedRules: { type: "integer", example: 4 },
            satisfiedCount: { type: "integer", example: 3 },
            violationCount: { type: "integer", example: 1 },
            errorCount: { type: "integer", example: 1 },
            warningCount: { type: "integer", example: 0 },
            compliancePercent: { type: "number", example: 75 },
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ruleId: { type: "string" },
                  ruleName: { type: "string" },
                  source: { type: "string" },
                  target: { type: "string" },
                  constraint: { type: "string", enum: ["forbidden", "required"] },
                  severity: { type: "string", enum: ["error", "warning"] },
                  status: { type: "string", enum: ["satisfied", "violation"] },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        ApprovalRequest: {
          type: "object",
          properties: {
            id: { type: "string", example: "appr-123" },
            projectId: { type: "string" },
            title: { type: "string", example: "Approve microservices split" },
            description: { type: "string" },
            type: {
              type: "string",
              enum: ["architecture_change", "rule_exception", "snapshot_baseline", "member_invite"],
            },
            status: { type: "string", enum: ["pending", "approved", "rejected"] },
            requestedBy: { type: "string" },
            reviewedBy: { type: "string" },
            reviewedAt: { type: "string", format: "date-time" },
            reviewNote: { type: "string" },
            data: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ProjectInvitation: {
          type: "object",
          properties: {
            id: { type: "string" },
            projectId: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["maintainer", "member"] },
            token: { type: "string" },
            invitedBy: { type: "string" },
            status: { type: "string", enum: ["pending", "accepted", "declined", "expired"] },
            expiresAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ProjectReport: {
          type: "object",
          properties: {
            id: { type: "string" },
            projectId: { type: "string" },
            title: { type: "string" },
            type: {
              type: "string",
              enum: ["architecture_summary", "rules_compliance", "evolution_history", "full_audit"],
            },
            generatedBy: { type: "string" },
            status: { type: "string", enum: ["ready", "generating", "failed"] },
            summary: { type: "string" },
            data: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
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
      { name: "Projects - Dashboard", description: "Tổng quan chỉ số sức khỏe và hoạt động dự án (PM-01)" },
      { name: "Projects - Diagram & Rules", description: "Quản lý Component Diagram và Architecture Rules (PM-02, PM-03)" },
      { name: "Projects - Decisions (ADR)", description: "Hồ sơ quyết định thiết kế kiến trúc (PM-04)" },
      { name: "Projects - Approvals", description: "Hàng đợi xét duyệt các thay đổi kiến trúc (PM-05)" },
      { name: "Projects - Invitations", description: "Mời thành viên và quản lý lời mời dự án (PM-06)" },
      { name: "Projects - Reports", description: "Tạo và tải báo cáo tổng hợp kiến trúc dự án (PM-07)" },
      { name: "Admin - User Management", description: "Quản trị người dùng hệ thống (System Administrator)" },
      { name: "Admin - Mining Jobs", description: "Giám sát và quản lý các tác vụ mining toàn hệ thống" },
      { name: "Admin - Audit Logs", description: "Nhật ký kiểm toán hoạt động hệ thống" },
      { name: "Admin - System Settings", description: "Cấu hình tham số hệ thống và quản lý API keys" },
      { name: "Admin - Metrics & Health", description: "Giám sát tài nguyên máy chủ và tình trạng các dịch vụ" },
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
