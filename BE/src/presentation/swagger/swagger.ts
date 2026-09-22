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
      },
    },
    tags: [
      { name: "Auth", description: "Authentication and account management" },
      { name: "Health", description: "Server health check" },
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
      },
    }),
  );

  // Also expose raw spec as JSON for external tools
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
