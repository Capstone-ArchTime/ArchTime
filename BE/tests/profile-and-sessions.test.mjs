import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { normalizeUserRole, UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { GetCurrentUserUseCase } from "../src/application/use-cases/GetCurrentUserUseCase.ts";
import { ALREADY_HAS_PASSWORD, SetPasswordUseCase } from "../src/application/use-cases/SetPasswordUseCase.ts";
import { GITHUB_ONLY_PASSWORD_PREFIX, hasUsablePassword } from "../src/application/use-cases/SignInMethods.ts";
import { MongoUserRepository } from "../src/infrastructure/repositories/MongoUserRepository.ts";
import { UserModel } from "../src/infrastructure/database/models/UserModel.ts";
import { JwtTokenService } from "../src/infrastructure/services/JwtTokenService.ts";
import { AuthController } from "../src/presentation/controllers/AuthController.ts";
import { createAuthRouter } from "../src/presentation/routes/auth.routes.ts";
import { errorHandler } from "../src/presentation/middlewares/errorHandler.ts";
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
    async findCredentials(id) {
      const user = users.find((u) => u.id === id);
      return user ? { passwordHash: user.passwordHash ?? null, githubId: user.githubId ?? null } : null;
    },
    async setPasswordIfNone(userId, passwordHash) {
      const user = users.find((u) => u.id === userId);
      if (!user || hasUsablePassword(user.passwordHash)) return false;
      user.passwordHash = passwordHash;
      return true;
    },
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

// ── Profile page: what /auth/me shows, and a first password for GitHub accounts ─

const GITHUB_ONLY = `${GITHUB_ONLY_PASSWORD_PREFIX}abc123`;
const created = new Date("2026-01-15T08:00:00.000Z");
const accounts = () => userRepo([
  { id: "pw", name: "Pat", email: "pat@x.io", username: "pat", passwordHash: "$2b$10$hash", tokenVersion: 7, createdAt: created, updatedAt: created, resetTokenHash: "r" },
  { id: "gh", name: "Gil", email: "gil@x.io", passwordHash: GITHUB_ONLY, githubId: "42", createdAt: created, updatedAt: created },
  { id: "both", name: "Bo", email: "bo@x.io", passwordHash: "$2b$10$hash", githubId: "43", createdAt: created, updatedAt: created },
]);
const hasher = { hashPassword: async (p) => `hashed:${p}` };

test("GetCurrentUser: returns only the listed fields, never the hash, the GitHub id or the token version", async () => {
  const user = await new GetCurrentUserUseCase(accounts()).execute({ userId: "pw" });
  assert.deepEqual(user, {
    id: "pw", name: "Pat", email: "pat@x.io", username: "pat", role: UserRole.USER, status: UserStatus.ACTIVE, isVerified: true,
    createdAt: created, updatedAt: created, signInMethods: { password: true, github: false },
  });
  for (const hidden of ["passwordHash", "githubId", "tokenVersion", "resetTokenHash"]) assert.equal(hidden in user, false, hidden);
  await assert.rejects(new GetCurrentUserUseCase(accounts()).execute({ userId: "missing" }), rejectsWith(404));
});

test("GetCurrentUser: sign-in methods for a password account, a GitHub-only account and one with both", async () => {
  const uc = new GetCurrentUserUseCase(accounts());
  assert.deepEqual((await uc.execute({ userId: "pw" })).signInMethods, { password: true, github: false });
  assert.deepEqual((await uc.execute({ userId: "gh" })).signInMethods, { password: false, github: true }, "the GitHub-only placeholder is not a password");
  assert.deepEqual((await uc.execute({ userId: "both" })).signInMethods, { password: true, github: true });
  assert.equal((await uc.execute({ userId: "gh" })).username, null, "no username reads as null");
  assert.equal(hasUsablePassword(""), false);
  assert.equal(hasUsablePassword(null), false);
});

test("SetPassword: a GitHub-only account gets a first password and keeps its sessions", async () => {
  const repo = accounts();
  const result = await new SetPasswordUseCase(repo, hasher).execute({ userId: "gh", newPassword: "NewPassword1!", confirmNewPassword: "NewPassword1!" });
  const gil = repo.users.find((u) => u.id === "gh");
  assert.equal(gil.passwordHash, "hashed:NewPassword1!");
  assert.equal(gil.tokenVersion, 0, "nobody is signed out");
  assert.deepEqual(result.signInMethods, { password: true, github: true });
  assert.match(result.message, /password set/i);
});

test("SetPassword: refused with 409 when the account already has a password", async () => {
  const repo = accounts();
  for (const userId of ["pw", "both"]) {
    await assert.rejects(new SetPasswordUseCase(repo, hasher).execute({ userId, newPassword: "NewPassword1!", confirmNewPassword: "NewPassword1!" }),
      (err) => rejectsWith(409)(err) && err.message === ALREADY_HAS_PASSWORD, userId);
  }
  assert.equal(repo.users.find((u) => u.id === "pw").passwordHash, "$2b$10$hash", "unchanged");
  // Two requests at the same moment: the second one's write finds a password and is refused too.
  const racing = accounts();
  racing.setPasswordIfNone = async () => false;
  await assert.rejects(new SetPasswordUseCase(racing, hasher).execute({ userId: "gh", newPassword: "NewPassword1!", confirmNewPassword: "NewPassword1!" }), rejectsWith(409));
});

test("SetPassword: validates the new password and the repeat, and writes nothing when they are wrong", async () => {
  const repo = accounts();
  const uc = new SetPasswordUseCase(repo, hasher);
  for (const [newPassword, confirmNewPassword, why] of [
    [undefined, undefined, /required/], ["", "", /required/], [42, 42, /required/],
    ["NewPassword1!", "NewPassword2!", /do not match/], ["short", "short", /at least 8/], ["nouppercase1!", "nouppercase1!", /uppercase/],
  ]) {
    await assert.rejects(uc.execute({ userId: "gh", newPassword, confirmNewPassword }), (err) => rejectsWith(400)(err) && why.test(err.message), String(newPassword));
  }
  assert.equal(repo.users.find((u) => u.id === "gh").passwordHash, GITHUB_ONLY);
  await assert.rejects(uc.execute({ userId: "missing", newPassword: "NewPassword1!", confirmNewPassword: "NewPassword1!" }), rejectsWith(401));
});

test("Mongo: a first password is only written while there is none, and sessions and the GitHub link stay", async (t) => {
  const update = t.mock.method(UserModel, "updateOne", async () => ({ modifiedCount: 1 }));
  assert.equal(await new MongoUserRepository().setPasswordIfNone("u1", "new-hash"), true);
  const [filter, change] = update.mock.calls[0].arguments;
  assert.deepEqual(filter, { _id: "u1", $or: [{ passwordHash: null }, { passwordHash: "" }, { passwordHash: { $regex: `^${GITHUB_ONLY_PASSWORD_PREFIX}` } }] });
  assert.deepEqual(change, { $set: { passwordHash: "new-hash" }, $unset: { resetTokenHash: 1, resetExpiresAt: 1 } });
  assert.ok(new RegExp(filter.$or[2].passwordHash.$regex).test(GITHUB_ONLY));
  assert.ok(!new RegExp(filter.$or[2].passwordHash.$regex).test("$2b$10$hash"));
  update.mock.mockImplementation(async () => ({ modifiedCount: 0 }));
  assert.equal(await new MongoUserRepository().setPasswordIfNone("u1", "new-hash"), false);
});

test("Mongo: credentials are read with the hidden hash and come back as plain values", async (t) => {
  let selected;
  const find = t.mock.method(UserModel, "findById", () => ({
    select(fields) { selected = fields; return this; },
    async lean() { return { _id: "u1", passwordHash: GITHUB_ONLY, githubId: "42" }; },
  }));
  assert.deepEqual(await new MongoUserRepository().findCredentials("u1"), { passwordHash: GITHUB_ONLY, githubId: "42" });
  assert.equal(selected, "passwordHash githubId");
  find.mock.mockImplementation(() => ({ select() { return this; }, async lean() { return { _id: "u2" }; } }));
  assert.deepEqual(await new MongoUserRepository().findCredentials("u2"), { passwordHash: null, githubId: null });
});

test("HTTP: GET and PATCH /auth/me send the allow-listed user, and set-password needs a signed-in account", async (t) => {
  const repo = accounts();
  // The real authentication middleware reads the account through MongoUserRepository; answer from the fake instead.
  t.mock.method(MongoUserRepository.prototype, "findById", async (id) => repo.findById(id));
  const jwt = new JwtTokenService("test-jwt-secret", "15m", "7d");
  const unused = {};
  const controller = new AuthController(unused, unused, unused, unused, unused, new GetCurrentUserUseCase(repo), unused, unused, new UpdateProfileUseCase(repo), undefined,
    new SetPasswordUseCase(repo, hasher));
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(controller, jwt));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const as = (id) => ({ Authorization: `Bearer ${jwt.generateTokens(id, UserRole.USER, repo.users.find((u) => u.id === id).tokenVersion).accessToken}` });
  const setPassword = (headers) => fetch(`${base}/set-password`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ newPassword: "NewPassword1!", confirmNewPassword: "NewPassword1!" }),
  });

  const fields = ["createdAt", "email", "id", "isVerified", "name", "role", "signInMethods", "status", "updatedAt", "username"];
  const me = await (await fetch(`${base}/me`, { headers: as("pw") })).json();
  assert.deepEqual(Object.keys(me.data.user).sort(), fields);
  assert.equal(me.data.user.createdAt, created.toISOString());

  // Saving the profile answers with the same shape, not the raw account (which carries the token version).
  const patched = await fetch(`${base}/me`, { method: "PATCH", headers: { "Content-Type": "application/json", ...as("gh") }, body: JSON.stringify({ name: "Gilbert" }) });
  assert.equal(patched.status, 200);
  const saved = (await patched.json()).data.user;
  assert.deepEqual(Object.keys(saved).sort(), fields);
  assert.equal(saved.name, "Gilbert");
  assert.equal(saved.username, null);
  assert.deepEqual(saved.signInMethods, { password: false, github: true });

  assert.equal((await setPassword({})).status, 401, "no token");
  assert.equal(repo.users.find((u) => u.id === "gh").passwordHash, GITHUB_ONLY);
  const refused = await setPassword(as("pw"));
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error.message, ALREADY_HAS_PASSWORD);
  const ok = await setPassword(as("gh"));
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data.signInMethods, { password: true, github: true });
  assert.equal((await fetch(`${base}/me`, { headers: as("gh") })).status, 200, "the same token still works afterwards");
});
