import test from "node:test";
import assert from "node:assert/strict";
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { GetAdminUsersUseCase } from "../src/application/use-cases/admin/GetAdminUsersUseCase.ts";
import { UpdateUserRoleUseCase } from "../src/application/use-cases/admin/UpdateUserRoleUseCase.ts";
import { SuspendUserUseCase } from "../src/application/use-cases/admin/SuspendUserUseCase.ts";
import { ReactivateUserUseCase } from "../src/application/use-cases/admin/ReactivateUserUseCase.ts";
import { InviteUserUseCase } from "../src/application/use-cases/admin/InviteUserUseCase.ts";
import { LoginUseCase } from "../src/application/use-cases/LoginUseCase.ts";
import { RefreshTokenUseCase } from "../src/application/use-cases/RefreshTokenUseCase.ts";
import { createAuthenticateMiddleware } from "../src/presentation/middlewares/authenticate.ts";
import { authorize } from "../src/presentation/middlewares/authorize.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

function createMockUserRepo(initialUsers = []) {
  const users = [...initialUsers];

  return {
    users,
    async findById(id) {
      return users.find((u) => u.id === id) || null;
    },
    async findByEmail(email) {
      return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
    },
    async existsByEmail(email) {
      return users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    },
    async create(data) {
      const newUser = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        status: data.status || UserStatus.ACTIVE,
        isVerified: data.isVerified ?? false,
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.push(newUser);
      return newUser;
    },
    async findPaginated(filter) {
      let filtered = [...users];

      if (filter.role) {
        filtered = filtered.filter((u) => u.role === filter.role);
      }
      if (filter.status) {
        filtered = filtered.filter((u) => u.status === filter.status);
      }
      if (filter.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase();
        filtered = filtered.filter(
          (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        );
      }

      const total = filtered.length;
      const page = filter.page || 1;
      const limit = filter.limit || 10;
      const skip = (page - 1) * limit;
      const items = filtered.slice(skip, skip + limit);

      return { items, total };
    },
    async updateRole(userId, role) {
      const user = users.find((u) => u.id === userId);
      if (!user) return null;
      user.role = role;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.updatedAt = new Date();
      return user;
    },
    async updateStatus(userId, status) {
      const user = users.find((u) => u.id === userId);
      if (!user) return null;
      user.status = status;
      if (status === UserStatus.SUSPENDED) {
        user.tokenVersion = (user.tokenVersion || 0) + 1;
      }
      user.updatedAt = new Date();
      return user;
    },
    async revokeSessions(userId) {
      const user = users.find((u) => u.id === userId);
      if (user) {
        user.tokenVersion = (user.tokenVersion || 0) + 1;
      }
    },
    async countByRole(role) {
      return users.filter((u) => u.role === role && u.status === UserStatus.ACTIVE).length;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GetAdminUsersUseCase
// ─────────────────────────────────────────────────────────────────────────────
test("GetAdminUsersUseCase: returns paginated safe users with meta", async () => {
  const repo = createMockUserRepo([
    {
      id: "u1",
      name: "Alice Admin",
      email: "alice@archtime.io",
      passwordHash: "secret1",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
    {
      id: "u2",
      name: "Bob Dev",
      email: "bob@archtime.io",
      passwordHash: "secret2",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
    {
      id: "u3",
      name: "Charlie Suspended",
      email: "charlie@archtime.io",
      passwordHash: "secret3",
      role: UserRole.PROJECT_MAINTAINER,
      status: UserStatus.SUSPENDED,
      isVerified: true,
      tokenVersion: 1,
    },
  ]);

  const useCase = new GetAdminUsersUseCase(repo);
  const result = await useCase.execute({ page: 1, limit: 2 });

  assert.equal(result.users.length, 2);
  assert.equal(result.meta.total, 3);
  assert.equal(result.meta.page, 1);
  assert.equal(result.meta.limit, 2);
  assert.equal(result.meta.totalPages, 2);
  // Ensure passwordHash is omitted
  assert.equal(result.users[0].passwordHash, undefined);
  assert.equal(result.users[1].passwordHash, undefined);
});

test("GetAdminUsersUseCase: filters by role and status and search", async () => {
  const repo = createMockUserRepo([
    {
      id: "u1",
      name: "Alice Admin",
      email: "alice@archtime.io",
      passwordHash: "secret1",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
    },
    {
      id: "u2",
      name: "Bob Dev",
      email: "bob@archtime.io",
      passwordHash: "secret2",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.ACTIVE,
      isVerified: true,
    },
    {
      id: "u3",
      name: "Charlie Dev",
      email: "charlie@archtime.io",
      passwordHash: "secret3",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.SUSPENDED,
      isVerified: true,
    },
  ]);

  const useCase = new GetAdminUsersUseCase(repo);

  // Filter role = DEVELOPER_ANALYST
  const devResult = await useCase.execute({ role: UserRole.DEVELOPER_ANALYST });
  assert.equal(devResult.users.length, 2);

  // Filter status = SUSPENDED
  const suspendedResult = await useCase.execute({ status: UserStatus.SUSPENDED });
  assert.equal(suspendedResult.users.length, 1);
  assert.equal(suspendedResult.users[0].name, "Charlie Dev");

  // Search keyword "alice"
  const searchResult = await useCase.execute({ search: "alice" });
  assert.equal(searchResult.users.length, 1);
  assert.equal(searchResult.users[0].email, "alice@archtime.io");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. InviteUserUseCase
// ─────────────────────────────────────────────────────────────────────────────
test("InviteUserUseCase: invites user, sets active and verified", async () => {
  const repo = createMockUserRepo([]);
  const mockHasher = {
    hashPassword: async (pwd) => `hashed:${pwd}`,
  };
  let sentEmail = null;
  const mockEmailService = {
    async sendInvitation(to, tempPwd, role) {
      sentEmail = { to, tempPwd, role };
    },
    async sendOtp() {},
    async sendPasswordReset() {},
  };

  const useCase = new InviteUserUseCase(repo, mockHasher, mockEmailService);
  const result = await useCase.execute({
    name: "Diana Prince",
    email: "diana@archtime.io",
    role: UserRole.PROJECT_MAINTAINER,
  });

  assert.ok(result.user);
  assert.equal(result.user.name, "Diana Prince");
  assert.equal(result.user.email, "diana@archtime.io");
  assert.equal(result.user.role, UserRole.PROJECT_MAINTAINER);
  assert.equal(result.user.status, UserStatus.ACTIVE);
  assert.equal(result.user.isVerified, true);
  assert.ok(result.temporaryPassword.length >= 8);
  assert.equal(sentEmail.to, "diana@archtime.io");
});

test("InviteUserUseCase: rejects duplicate email with 409 Conflict", async () => {
  const repo = createMockUserRepo([
    {
      id: "u1",
      name: "Existing User",
      email: "existing@archtime.io",
      passwordHash: "h",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.ACTIVE,
      isVerified: true,
    },
  ]);
  const mockHasher = { hashPassword: async (pwd) => pwd };

  const useCase = new InviteUserUseCase(repo, mockHasher);
  await assert.rejects(
    () =>
      useCase.execute({
        name: "New Name",
        email: "existing@archtime.io",
        role: UserRole.DEVELOPER_ANALYST,
      }),
    (err) => err instanceof AppError && err.statusCode === 409,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. UpdateUserRoleUseCase & Last Admin Protection
// ─────────────────────────────────────────────────────────────────────────────
test("UpdateUserRoleUseCase: prevents demoting the last System Administrator", async () => {
  const repo = createMockUserRepo([
    {
      id: "admin-1",
      name: "Sole Admin",
      email: "admin@archtime.io",
      passwordHash: "h",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
    {
      id: "dev-1",
      name: "Bob Dev",
      email: "bob@archtime.io",
      passwordHash: "h",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
  ]);

  const useCase = new UpdateUserRoleUseCase(repo);

  await assert.rejects(
    () =>
      useCase.execute({
        currentUserId: "admin-1",
        targetUserId: "admin-1",
        newRole: UserRole.DEVELOPER_ANALYST,
      }),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Cannot demote the last System Administrator/i);
      return true;
    },
  );
});

test("UpdateUserRoleUseCase: successfully updates role when multiple admins exist", async () => {
  const repo = createMockUserRepo([
    {
      id: "admin-1",
      name: "Admin One",
      email: "admin1@archtime.io",
      passwordHash: "h",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
    {
      id: "admin-2",
      name: "Admin Two",
      email: "admin2@archtime.io",
      passwordHash: "h",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
  ]);

  const useCase = new UpdateUserRoleUseCase(repo);
  const updated = await useCase.execute({
    currentUserId: "admin-1",
    targetUserId: "admin-2",
    newRole: UserRole.PROJECT_MAINTAINER,
  });

  assert.equal(updated.role, UserRole.PROJECT_MAINTAINER);
  assert.equal(updated.tokenVersion, 1); // Sessions revoked on role change
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SuspendUserUseCase & ReactivateUserUseCase
// ─────────────────────────────────────────────────────────────────────────────
test("SuspendUserUseCase: prevents self-suspension", async () => {
  const repo = createMockUserRepo([
    {
      id: "admin-1",
      name: "Admin",
      email: "admin@archtime.io",
      passwordHash: "h",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
  ]);

  const useCase = new SuspendUserUseCase(repo);
  await assert.rejects(
    () =>
      useCase.execute({
        currentUserId: "admin-1",
        targetUserId: "admin-1",
      }),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /cannot suspend your own account/i);
      return true;
    },
  );
});

test("SuspendUserUseCase: prevents suspending the last System Administrator", async () => {
  const repo = createMockUserRepo([
    {
      id: "admin-1",
      name: "Admin One",
      email: "admin1@archtime.io",
      passwordHash: "h",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
    {
      id: "super-admin",
      name: "Another Operator",
      email: "op@archtime.io",
      passwordHash: "h",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.SUSPENDED, // already suspended
      isVerified: true,
      tokenVersion: 0,
    },
  ]);

  const useCase = new SuspendUserUseCase(repo);
  await assert.rejects(
    () =>
      useCase.execute({
        currentUserId: "super-admin",
        targetUserId: "admin-1",
      }),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Cannot suspend the last System Administrator/i);
      return true;
    },
  );
});

test("SuspendUserUseCase: suspends target user and increments tokenVersion", async () => {
  const repo = createMockUserRepo([
    {
      id: "admin-1",
      name: "Admin",
      email: "admin@archtime.io",
      passwordHash: "h",
      role: UserRole.SYSTEM_ADMINISTRATOR,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 2,
    },
    {
      id: "dev-1",
      name: "Dev",
      email: "dev@archtime.io",
      passwordHash: "h",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.ACTIVE,
      isVerified: true,
      tokenVersion: 0,
    },
  ]);

  const suspendUseCase = new SuspendUserUseCase(repo);
  const reactivateUseCase = new ReactivateUserUseCase(repo);

  const suspended = await suspendUseCase.execute({
    currentUserId: "admin-1",
    targetUserId: "dev-1",
    reason: "Policy violation",
  });

  assert.equal(suspended.status, UserStatus.SUSPENDED);
  assert.equal(suspended.tokenVersion, 1);

  // Reactivate user
  const reactivated = await reactivateUseCase.execute({
    targetUserId: "dev-1",
  });
  assert.equal(reactivated.status, UserStatus.ACTIVE);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Auth Enforcement on Suspended Users
// ─────────────────────────────────────────────────────────────────────────────
test("LoginUseCase: blocks suspended users from logging in", async () => {
  const repo = createMockUserRepo([
    {
      id: "user-suspended",
      name: "Suspended Guy",
      email: "suspended@archtime.io",
      passwordHash: "hash-pass",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.SUSPENDED,
      isVerified: true,
      tokenVersion: 0,
    },
  ]);

  const mockHasher = {
    comparePassword: async (plain, hash) => plain === "secret" && hash === "hash-pass",
  };
  const mockJwt = {
    generateTokens: () => ({ accessToken: "at", refreshToken: "rt" }),
  };

  const loginUseCase = new LoginUseCase(repo, mockHasher, mockJwt);

  await assert.rejects(
    () => loginUseCase.execute({ email: "suspended@archtime.io", password: "secret" }),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /Account has been suspended/i);
      return true;
    },
  );
});

test("RefreshTokenUseCase: blocks token refresh for suspended users", async () => {
  const repo = createMockUserRepo([
    {
      id: "u-susp",
      name: "Suspended",
      email: "susp@archtime.io",
      passwordHash: "h",
      role: UserRole.DEVELOPER_ANALYST,
      status: UserStatus.SUSPENDED,
      isVerified: true,
      tokenVersion: 0,
    },
  ]);

  const mockJwt = {
    verifyRefreshToken: (token) => ({ userId: "u-susp", version: 0 }),
    generateAccessToken: () => "new-at",
  };

  const refreshUseCase = new RefreshTokenUseCase(repo, mockJwt);

  await assert.rejects(
    () => refreshUseCase.execute({ refreshToken: "valid-rt" }),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      assert.match(err.message, /Account has been suspended/i);
      return true;
    },
  );
});
