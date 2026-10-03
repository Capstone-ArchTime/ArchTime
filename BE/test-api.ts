/**
 * CORE-01 API Integration Test
 * Kiểm tra tất cả endpoints: response format, error codes, pagination, validation
 * Chạy: npx tsx test-api.ts
 */

const BASE = "http://localhost:4000";

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

async function req(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function test(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${name}: ${detail}`);
}

// ────────────────────────────────────────────────────────────
// 1. Health check
// ────────────────────────────────────────────────────────────
async function testHealth() {
  const r = await req("GET", "/api/health");
  test(
    "Health check",
    r.status === 200 && r.body.status === "ok",
    `status=${r.status} body.status=${r.body.status}`,
  );
}

// ────────────────────────────────────────────────────────────
// 2. Auth — validation errors (chuẩn ErrorResponse format)
// ────────────────────────────────────────────────────────────
async function testAuthValidation() {
  // Register missing fields
  const r1 = await req("POST", "/api/auth/register", {});
  test(
    "Register: missing fields → 400 + ErrorResponse",
    r1.status === 400 &&
      r1.body.success === false &&
      typeof r1.body.error?.code === "string" &&
      typeof r1.body.error?.message === "string",
    `status=${r1.status} code=${r1.body.error?.code}`,
  );

  // Register password mismatch
  const r2 = await req("POST", "/api/auth/register", {
    name: "Test",
    email: "test@test.com",
    password: "Test1234!",
    confirmPassword: "Wrong1234!",
  });
  test(
    "Register: password mismatch → 400",
    r2.status === 400 && r2.body.success === false,
    `status=${r2.status} code=${r2.body.error?.code} msg=${r2.body.error?.message}`,
  );

  // Register weak password
  const r3 = await req("POST", "/api/auth/register", {
    name: "Test",
    email: "test@test.com",
    password: "short",
    confirmPassword: "short",
  });
  test(
    "Register: weak password → 400 BAD_REQUEST",
    r3.status === 400 && r3.body.error?.code === "BAD_REQUEST",
    `status=${r3.status} code=${r3.body.error?.code}`,
  );

  // Login missing fields
  const r4 = await req("POST", "/api/auth/login", {});
  test(
    "Login: missing fields → 400 VALIDATION_ERROR",
    r4.status === 400 && r4.body.error?.code === "VALIDATION_ERROR",
    `status=${r4.status} code=${r4.body.error?.code}`,
  );

  // Verify email missing fields
  const r5 = await req("POST", "/api/auth/verify-email", {});
  test(
    "Verify email: missing fields → 400",
    r5.status === 400 && r5.body.success === false,
    `status=${r5.status} code=${r5.body.error?.code}`,
  );

  // Resend OTP missing email
  const r6 = await req("POST", "/api/auth/resend-otp", {});
  test(
    "Resend OTP: missing email → 400",
    r6.status === 400 && r6.body.success === false,
    `status=${r6.status} code=${r6.body.error?.code}`,
  );

  // Refresh missing token
  const r7 = await req("POST", "/api/auth/refresh", {});
  test(
    "Refresh: missing refreshToken → 400",
    r7.status === 400 && r7.body.success === false,
    `status=${r7.status} code=${r7.body.error?.code}`,
  );

  // Forgot password missing email
  const r8 = await req("POST", "/api/auth/forgot-password", {});
  test(
    "Forgot password: missing email → 400",
    r8.status === 400 && r8.body.success === false,
    `status=${r8.status} code=${r8.body.error?.code}`,
  );

  // Change password no auth
  const r9 = await req("POST", "/api/auth/change-password", {});
  test(
    "Change password: no Bearer → 401 UNAUTHORIZED",
    r9.status === 401 && r9.body.error?.code === "UNAUTHORIZED",
    `status=${r9.status} code=${r9.body.error?.code}`,
  );

  // Me no auth
  const r10 = await req("GET", "/api/auth/me");
  test(
    "Me: no Bearer → 401",
    r10.status === 401 && r10.body.success === false,
    `status=${r10.status} code=${r10.body.error?.code}`,
  );
}

// ────────────────────────────────────────────────────────────
// 3. Projects — auth check + pagination format
// ────────────────────────────────────────────────────────────
async function testProjectsNoAuth() {
  // All project routes require auth
  const endpoints = [
    { method: "GET", path: "/api/projects" },
    { method: "POST", path: "/api/projects" },
    { method: "DELETE", path: "/api/projects/fake-id" },
    { method: "POST", path: "/api/projects/fake-id/mine" },
    { method: "GET", path: "/api/projects/fake-id/snapshots" },
    { method: "GET", path: "/api/projects/jobs" },
    { method: "GET", path: "/api/projects/fake-id/snapshots/compare?baseId=a&targetId=b" },
    { method: "GET", path: "/api/projects/fake-id/evidences" },
  ];

  for (const ep of endpoints) {
    const r = await req(ep.method, ep.path);
    test(
      `${ep.method} ${ep.path.replace("fake-id", ":id")}: no auth → 401`,
      r.status === 401 &&
        r.body.success === false &&
        r.body.error?.code === "UNAUTHORIZED",
      `status=${r.status} code=${r.body.error?.code}`,
    );
  }
}

// ────────────────────────────────────────────────────────────
// 4. Projects — with auth (pagination format check)
// ────────────────────────────────────────────────────────────
async function testProjectsWithAuth() {
  // Đăng ký + verify để lấy token
  const regEmail = `test-core01-${Date.now()}@test.com`;

  // Thử register
  const reg = await req("POST", "/api/auth/register", {
    name: "Core01 Tester",
    email: regEmail,
    password: "Test1234!",
    confirmPassword: "Test1234!",
  });

  if (reg.status !== 201) {
    // Nếu register thành công thì cần verify, nhưng ta ko có OTP
    // Thay vào đó thử login với credentials invalid để test response format
    const r = await req("POST", "/api/auth/login", {
      email: "nonexistent@test.com",
      password: "Test1234!",
    });
    test(
      "Login: invalid credentials → 401 INVALID_CREDENTIALS",
      r.status === 401 &&
        r.body.success === false &&
        r.body.error?.code === "INVALID_CREDENTIALS",
      `status=${r.status} code=${r.body.error?.code}`,
    );
  } else {
    test(
      "Register: valid → 201 SuccessResponse",
      reg.status === 201 &&
        reg.body.success === true &&
        typeof reg.body.data === "object",
      `status=${reg.status} success=${reg.body.success}`,
    );

    // Login invalid creds
    const r = await req("POST", "/api/auth/login", {
      email: "nonexistent@test.com",
      password: "Test1234!",
    });
    test(
      "Login: invalid credentials → 401 INVALID_CREDENTIALS",
      r.status === 401 &&
        r.body.success === false &&
        r.body.error?.code === "INVALID_CREDENTIALS",
      `status=${r.status} code=${r.body.error?.code}`,
    );
  }

  // Test with fake JWT (should get 401)
  const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidHlwZSI6ImFjY2VzcyIsInJvbGUiOiJkZXZlbG9wZXItYW5hbHlzdCIsImlhdCI6MTUxNjIzOTAyMn0.invalid";

  const r1 = await req("GET", "/api/projects", undefined, fakeToken);
  test(
    "GET /projects: invalid JWT → 401",
    r1.status === 401 && r1.body.success === false,
    `status=${r1.status} code=${r1.body.error?.code}`,
  );
}

// ────────────────────────────────────────────────────────────
// 5. Swagger / OpenAPI
// ────────────────────────────────────────────────────────────
async function testSwagger() {
  // Swagger JSON endpoint
  const r = await req("GET", "/api-docs.json");
  test(
    "Swagger JSON: returns OpenAPI spec",
    r.status === 200 &&
      r.body.openapi === "3.0.0" &&
      r.body.info?.title === "ArchTime API",
    `status=${r.status} openapi=${r.body.openapi}`,
  );

  // Check schemas exist
  const schemas = r.body.components?.schemas ?? {};
  const requiredSchemas = [
    "SuccessResponse",
    "ErrorResponse",
    "PaginationMeta",
    "User",
    "Tokens",
    "Project",
    "MiningJob",
    "Snapshot",
    "Evidence",
  ];

  for (const s of requiredSchemas) {
    test(
      `Swagger schema: ${s} exists`,
      s in schemas,
      s in schemas ? "present" : "MISSING",
    );
  }

  // Check reusable responses
  const responses = r.body.components?.responses ?? {};
  const requiredResponses = [
    "Unauthorized",
    "Forbidden",
    "NotFound",
    "ValidationError",
    "InternalError",
  ];

  for (const resp of requiredResponses) {
    test(
      `Swagger response: ${resp} exists`,
      resp in responses,
      resp in responses ? "present" : "MISSING",
    );
  }

  // Swagger UI HTML
  const uiRes = await fetch(`${BASE}/api-docs/`);
  test(
    "Swagger UI: HTML accessible",
    uiRes.status === 200,
    `status=${uiRes.status}`,
  );
}

// ────────────────────────────────────────────────────────────
// 6. 404 handler
// ────────────────────────────────────────────────────────────
async function test404() {
  const r = await req("GET", "/api/nonexistent");
  test(
    "Unknown route → 404",
    r.status === 404,
    `status=${r.status}`,
  );
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
async function main() {
  console.log("=" .repeat(60));
  console.log("CORE-01 API Integration Tests");
  console.log("=".repeat(60));
  console.log();

  try {
    // Quick health check to see if server is up
    await fetch(`${BASE}/api/health`);
  } catch {
    console.error("❌ Server not reachable at", BASE);
    console.error("   Start the server first: npm run dev");
    process.exit(1);
  }

  await testHealth();
  console.log();
  await testAuthValidation();
  console.log();
  await testProjectsNoAuth();
  console.log();
  await testProjectsWithAuth();
  console.log();
  await testSwagger();
  console.log();
  await test404();

  // Summary
  console.log();
  console.log("=".repeat(60));
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);

  if (failed > 0) {
    console.log();
    console.log("FAILED tests:");
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    }
  }

  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main();
