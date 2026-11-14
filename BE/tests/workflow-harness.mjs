// The whole back end (src/app.ts, real routes, middleware, use cases and Mongo repositories) on a throwaway database, for
// the end-to-end workflow tests (BM04 §6.4 WF-04, §6.6 WF-06). Skipped when no MongoDB is usable; CI starts one.
// Set MONGODB_TEST_URI to use a server other than the local default.
import "./setup-env.mjs";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { BcryptHasher } from "../src/infrastructure/services/BcryptHasher.ts";
import { UserModel } from "../src/infrastructure/database/models/UserModel.ts";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.ts";
import { ProjectMemberModel } from "../src/infrastructure/database/models/ProjectMemberModel.ts";
import { OrganizationModel } from "../src/infrastructure/database/models/OrganizationModel.ts";
import { OrganizationMemberModel } from "../src/infrastructure/database/models/OrganizationMemberModel.ts";
import { UserRole, UserStatus } from "../src/domain/entities/User.ts";
import { MemberStatus } from "../src/domain/entities/ProjectMember.ts";
import { ProjectStatus, RepoVisibility } from "../src/domain/entities/Project.ts";
import { OrganizationRole } from "../src/domain/entities/Organization.ts";

export const PASSWORD = "Test@12345";

/** Connects to a fresh database and serves the app; returns null (with the reason in `unavailable`) when Mongo is not usable. */
export async function startWorkflowApp(prefix) {
  const uri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
  try {
    await mongoose.connect(uri, { dbName: `archtime_test_${prefix}_${randomUUID().slice(0, 8)}`, serverSelectionTimeoutMS: 1500 });
  } catch (err) {
    return { unavailable: `MongoDB is not usable: ${err.message}` };
  }
  const { app } = await import("../src/app.ts");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const hash = await new BcryptHasher().hashPassword(PASSWORD);

  /** A verified account; `status` and `role` as given. */
  const user = async (key, { role = UserRole.USER, status = UserStatus.ACTIVE, isVerified = true } = {}) => {
    const doc = await UserModel.create({ name: key, email: `${key}@archtime.test`, passwordHash: hash, isVerified, role, status });
    return { id: String(doc._id), email: doc.email };
  };
  const project = async (owner, { name = "acme-api", visibility = RepoVisibility.PUBLIC, organizationId, members = [] } = {}) => {
    const doc = await ProjectModel.create({ name, repoUrl: `https://github.com/example/${name}`, visibility, userId: owner.id, status: ProjectStatus.PENDING, ...(organizationId ? { organizationId } : {}) });
    for (const [member, role] of members) {
      await ProjectMemberModel.create({ projectId: String(doc._id), userId: member.id, email: member.email, name: member.email, role, status: MemberStatus.ACTIVE, invitedBy: owner.id });
    }
    return String(doc._id);
  };
  const organization = async (owner, name, members = []) => {
    const org = await OrganizationModel.create({ name, createdBy: owner.id });
    await OrganizationMemberModel.create({ organizationId: String(org._id), userId: owner.id, role: OrganizationRole.OWNER, addedBy: owner.id });
    for (const m of members) await OrganizationMemberModel.create({ organizationId: String(org._id), userId: m.id, role: OrganizationRole.MEMBER, addedBy: owner.id });
    return String(org._id);
  };

  const call = async (token, method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, body: json, text };
  };
  const signIn = async (account, password = PASSWORD) => call(null, "POST", "/auth/login", { email: account.email, password });
  const tokenOf = async (account) => {
    const res = await signIn(account);
    if (res.status !== 200) throw new Error(`sign-in of ${account.email} failed: ${res.status} ${res.text}`);
    return res.body.data.accessToken;
  };

  const stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
  return { call, signIn, tokenOf, user, project, organization, stop };
}
