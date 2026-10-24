import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import swaggerJsdoc from "swagger-jsdoc";

// A route whose @swagger comment is not valid YAML does not fail anything at run time: it just drops out of the OpenAPI
// document (a colon followed by a space inside an unquoted summary is enough). This turns that into a failing test.
test("every @swagger comment in the route files is valid, so no documented route silently drops out of the API document", () => {
  const spec = swaggerJsdoc({
    failOnErrors: true,
    definition: { openapi: "3.0.0", info: { title: "ArchTime API", version: "test" } },
    apis: ["./src/presentation/routes/*.ts"],
  });
  assert.ok(Object.keys(spec.paths).length > 50, "the document lists the routes");
  for (const path of [
    "/api/projects/{id}/architecture/runs",
    "/api/llm/runs/{runId}/feedback",
    "/api/projects/{id}/onboarding-paths",
    "/api/projects/{id}/onboarding-paths/{pathId}/steps/{stepId}/answer",
    "/api/onboarding/me",
  ]) {
    assert.ok(spec.paths[path], `${path} is documented`);
  }
});
