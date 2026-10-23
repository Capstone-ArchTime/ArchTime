import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUserRole, UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { UpdateProfileUseCase } from "../src/application/use-cases/UpdateProfileUseCase.ts";
import { LogoutAllDevicesUseCase } from "../src/application/use-cases/LogoutAllDevicesUseCase.ts";
import { UpdateUserRoleUseCase } from "../src/application/use-cases/admin/UpdateUserRoleUseCase.ts";
import { InviteUserUseCase } from "../src/application/use-cases/admin/InviteUserUseCase.ts";
import { AppError } from "../src/shared/errors/AppError.ts";

function userRepo(initial) {
  const users = initial.map((u) => ({ tokenVersion: 0, status: UserStatus.ACTIVE, isVerified: true, role: UserRole.USER, ...u }));
  return {
    users,
    async findById(id) { return users.find((u) => u.id === id) ?? null; },
    async existsByEmail(email) { return users.some((u) => u.email === email); },
    async existsByUsername(username, exceptUserId) {
      return users.some((u) => u.username === username && u.id !== exceptUserId);
    },
    async updateProfile(userId, patch) {
      const user = users.find((u) => u.id === userId);
      if (!user) return null;
      if (patch.name !== undefined) user.name = patch.name;
      if (patch.username === null) delete user.username;
      else if (patch.username !== undefined) user.username = patch.username;
      return user;
    },
    async revokeSessions(userId) {
      const user = users.find((u) => u.id === userId);
      if (user) user.tokenVersion += 1;
    },
    async updateRole(userId, role) {
      const user = users.find((u) => u.id === userId);
      if (!user) return null;
      user.role = role;
      return user;
    },
    async countByRole(role) { return users.filter((u) => u.role === role).length; },
    async create(data) { const u = { id: `u${users.length + 1}`, ...data }; users.push(u); return u; },
  };
}

const rejectsWith = (status) => (err) => err instanceof AppError && err.statusCode === status;

// ── T12: profile ─────────────────────────────────────────────────────────────

test("UpdateProfile: changes name and username, trims and lower-cases, never returns the password hash", async () => {
  const repo = userRepo([{ id: "u1", name: "Old", email: "a@x.io", passwordHash: "secret" }]);
  const user = await new UpdateProfileUseCase(repo).execute({ userId: "u1", name: "  Jane Doe ", username: "Jane.Doe" });
  assert.equal(user.name, "Jane Doe");
  assert.equal(user.username, "jane.doe");
  assert.equal(user.passwordHash, undefined);
});

test("UpdateProfile: null clears the username, undefined leaves fields alone", async () => {
  const repo = userRepo([{ id: "u1", name: "Jane", email: "a@x.io", username: "jane" }]);
  const user = await new UpdateProfileUseCase(repo).execute({ userId: "u1", username: null });
  assert.equal(user.username, undefined);
  assert.equal(user.name, "Jane");
});

test("UpdateProfile: rejects a taken username with 409, but keeping your own is fine", async () => {
  const repo = userRepo([
    { id: "u1", name: "A", email: "a@x.io", username: "alice" },
    { id: "u2", name: "B", email: "b@x.io", username: "bob" },
  ]);
  const uc = new UpdateProfileUseCase(repo);
  await assert.rejects(uc.execute({ userId: "u2", username: "alice" }), rejectsWith(409));
  const same = await uc.execute({ userId: "u1", username: "alice", name: "Alice" });
  assert.equal(same.name, "Alice");
});

test("UpdateProfile: validates input", async () => {
  const uc = new UpdateProfileUseCase(userRepo([{ id: "u1", name: "A", email: "a@x.io" }]));
  await assert.rejects(uc.execute({ userId: "u1" }), rejectsWith(400), "nothing to update");
  await assert.rejects(uc.execute({ userId: "u1", name: "   " }), rejectsWith(400));
  await assert.rejects(uc.execute({ userId: "u1", name: "x".repeat(101) }), rejectsWith(400));
  for (const bad of ["ab", "-jane", "jane-", "ja ne", "x".repeat(33), 42]) {
    await assert.rejects(uc.execute({ userId: "u1", username: bad }), rejectsWith(400), String(bad));
  }
  await assert.rejects(uc.execute({ userId: "missing", name: "A" }), rejectsWith(404));
});

test("UpdateProfile: a duplicate-key race on the unique index becomes 409", async () => {
  const repo = userRepo([{ id: "u1", name: "A", email: "a@x.io" }]);
  repo.updateProfile = async () => { throw Object.assign(new Error("E11000"), { code: 11000 }); };
  await assert.rejects(new UpdateProfileUseCase(repo).execute({ userId: "u1", username: "alice" }), rejectsWith(409));
});

// ── T46: sign out everywhere ─────────────────────────────────────────────────

test("LogoutAllDevices: bumps the token version so every issued token stops working", async () => {
  const repo = userRepo([{ id: "u1", name: "A", email: "a@x.io", tokenVersion: 3 }]);
  const result = await new LogoutAllDevicesUseCase(repo).execute({ userId: "u1" });
  assert.equal(repo.users[0].tokenVersion, 4);
  assert.match(result.message, /all devices/i);
  await assert.rejects(new LogoutAllDevicesUseCase(repo).execute({ userId: "nope" }), rejectsWith(404));
});

// ── T14: two system roles ────────────────────────────────────────────────────

test("System roles are only User and System Administrator; the retired maintainer role reads as User", () => {
  assert.deepEqual(Object.values(UserRole).sort(), ["developer-analyst", "system-administrator"]);
  assert.equal(normalizeUserRole("project-maintainer"), UserRole.USER);
  assert.equal(normalizeUserRole("developer-analyst"), UserRole.USER);
  assert.equal(normalizeUserRole("system-administrator"), UserRole.SYSTEM_ADMINISTRATOR);
  assert.equal(normalizeUserRole(undefined), UserRole.USER);
});

test("Admins can no longer assign or invite with the retired project-maintainer system role", async () => {
  const repo = userRepo([
    { id: "a1", name: "Admin", email: "admin@x.io", role: UserRole.SYSTEM_ADMINISTRATOR },
    { id: "u1", name: "Dev", email: "dev@x.io" },
  ]);
  await assert.rejects(
    new UpdateUserRoleUseCase(repo).execute({ currentUserId: "a1", targetUserId: "u1", newRole: "project-maintainer" }),
    rejectsWith(400),
  );
  await assert.rejects(
    new InviteUserUseCase(repo, { hashPassword: async (p) => p }).execute({ name: "New", email: "new@x.io", role: "project-maintainer" }),
    rejectsWith(400),
  );
});
