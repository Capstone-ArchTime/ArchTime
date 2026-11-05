/**
 * Test accounts, organizations and workspaces for manual testing (docs/manual-test-guide.md).
 *
 *   npm run seed:test            create them, or put them back to their starting state (safe to re-run)
 *   npm run seed:test -- --remove delete everything this script created, and the data made in its workspaces
 *
 * Only touches accounts whose email ends in @archtime.test and what belongs to them. It creates no mined data:
 * workspaces start empty and are scanned and mined from the app, so what you test is real.
 */
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";
import { BcryptHasher } from "../src/infrastructure/services/BcryptHasher.js";
import { UserModel } from "../src/infrastructure/database/models/UserModel.js";
import { OrganizationModel } from "../src/infrastructure/database/models/OrganizationModel.js";
import { OrganizationMemberModel } from "../src/infrastructure/database/models/OrganizationMemberModel.js";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.js";
import { ProjectMemberModel } from "../src/infrastructure/database/models/ProjectMemberModel.js";
import { UserRole, UserStatus } from "../src/domain/entities/User.js";
import { OrganizationRole } from "../src/domain/entities/Organization.js";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.js";
import { ProjectStatus, RepoVisibility } from "../src/domain/entities/Project.js";

export const PASSWORD = "Test@12345";
const DOMAIN = "@archtime.test";
const SEED_NOTE = "[test seed] created by scripts/seed-test-accounts.ts";

const USERS = [
  { key: "admin", name: "Ada Admin", role: UserRole.SYSTEM_ADMINISTRATOR },
  { key: "alice", name: "Alice Owner" },     // owner of organization Acme
  { key: "bob", name: "Bob Mentor" },        // Acme member; maintainer (mentor) of acme-api
  { key: "carl", name: "Carl Newcomer" },    // Acme member; member (newcomer) of acme-api
  { key: "frank", name: "Frank Leaver" },    // Acme member; maintainer of acme-web; to be removed in a test
  { key: "dora", name: "Dora Beta" },        // owner of organization Beta
  { key: "eve", name: "Eve Solo" },          // no organization; owns personal workspaces
  { key: "gina", name: "Gina Viewer" },      // nobody's member: a viewer of public personal workspaces
  { key: "sam", name: "Sam Suspended", status: UserStatus.SUSPENDED },
] as const;
type Key = (typeof USERS)[number]["key"];
const email = (key: Key) => `${key}${DOMAIN}`;

const ORGS = [
  { key: "acme", name: "Acme (test)", owner: "alice", members: ["bob", "carl", "frank"] },
  { key: "beta", name: "Beta (test)", owner: "dora", members: [] },
] as const;

/** Public repositories, so they can be scanned and mined without a token. */
const PROJECTS = [
  { name: "acme-api (test)", repoUrl: "https://github.com/axios/axios.git", owner: "alice", org: "acme", visibility: RepoVisibility.PUBLIC,
    members: [["bob", ProjectMemberRole.MAINTAINER], ["carl", ProjectMemberRole.MEMBER]] },
  { name: "acme-web (test)", repoUrl: "https://github.com/koajs/koa.git", owner: "alice", org: "acme", visibility: RepoVisibility.PUBLIC,
    members: [["frank", ProjectMemberRole.MAINTAINER]] },
  { name: "beta-core (test)", repoUrl: "https://github.com/expressjs/express.git", owner: "dora", org: "beta", visibility: RepoVisibility.PUBLIC, members: [] },
  { name: "eve-public (test)", repoUrl: "https://github.com/expressjs/express.git", owner: "eve", visibility: RepoVisibility.PUBLIC, members: [] },
  // Private without a token: opening it is enough to test who may see it; it cannot be mined.
  { name: "eve-private (test)", repoUrl: "https://github.com/koajs/koa.git", owner: "eve", visibility: RepoVisibility.PRIVATE, members: [] },
  { name: "frank-own (test)", repoUrl: "https://github.com/koajs/koa.git", owner: "frank", visibility: RepoVisibility.PUBLIC,
    members: [["carl", ProjectMemberRole.MEMBER]] },
] as const;

async function seed() {
  const hash = await new BcryptHasher().hashPassword(PASSWORD);
  const ids = {} as Record<Key, string>;
  for (const u of USERS) {
    const doc = await UserModel.findOneAndUpdate(
      { email: email(u.key) },
      {
        $set: {
          name: u.name, email: email(u.key), passwordHash: hash, isVerified: true,
          role: "role" in u ? u.role : UserRole.USER, status: "status" in u ? u.status : UserStatus.ACTIVE,
        },
        $inc: { tokenVersion: 1 }, // re-seeding signs every test account out, so old sessions do not linger
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    ids[u.key] = String(doc._id);
  }

  const orgIds: Record<string, string> = {};
  for (const o of ORGS) {
    const org = await OrganizationModel.findOneAndUpdate(
      { name: o.name, createdBy: ids[o.owner] },
      { $set: { description: SEED_NOTE } },
      { upsert: true, new: true },
    );
    orgIds[o.key] = String(org._id);
    for (const [key, role] of [[o.owner, OrganizationRole.OWNER], ...o.members.map(m => [m, OrganizationRole.MEMBER] as const)] as const) {
      await OrganizationMemberModel.updateOne(
        { organizationId: orgIds[o.key], userId: ids[key as Key] },
        { $set: { role, addedBy: ids[o.owner] } },
        { upsert: true },
      );
    }
  }

  for (const p of PROJECTS) {
    const project = await ProjectModel.findOneAndUpdate(
      { name: p.name, userId: ids[p.owner] },
      {
        $set: { repoUrl: p.repoUrl, visibility: p.visibility, description: SEED_NOTE, ...("org" in p ? { organizationId: orgIds[p.org] } : {}) },
        $setOnInsert: { status: ProjectStatus.PENDING },
      },
      { upsert: true, new: true },
    );
    for (const [key, role] of p.members) {
      await ProjectMemberModel.updateOne(
        { projectId: String(project._id), email: email(key) },
        { $set: { userId: ids[key], name: USERS.find(u => u.key === key)!.name, role, status: MemberStatus.ACTIVE, invitedBy: ids[p.owner] } },
        { upsert: true },
      );
    }
  }

  console.log(`Ready. Password for every account: ${PASSWORD}`);
  console.table(USERS.map(u => ({ email: email(u.key), name: u.name, system_role: "role" in u ? u.role : UserRole.USER, status: "status" in u ? u.status : UserStatus.ACTIVE })));
  console.table(PROJECTS.map(p => ({ workspace: p.name, owner: email(p.owner), organization: "org" in p ? ORGS.find(o => o.key === p.org)!.name : "(personal)", visibility: p.visibility, repo: p.repoUrl })));
}

async function remove() {
  const users = await UserModel.find({ email: { $regex: `${DOMAIN.replace(".", "\\.")}$` } }).select("_id").lean();
  const userIds = users.map(u => String(u._id));
  const projects = await ProjectModel.find({ userId: { $in: userIds } }).select("_id").lean();
  const projectIds = projects.map(p => String(p._id));
  const orgs = await OrganizationModel.find({ createdBy: { $in: userIds } }).select("_id").lean();
  const orgIds = orgs.map(o => String(o._id));

  // Everything made inside the test workspaces (snapshots, evidence, jobs, maps, paths, chats...), whatever collection it is in.
  const db = mongoose.connection.db!;
  let related = 0;
  for (const { name } of await db.listCollections().toArray()) {
    if (projectIds.length) related += (await db.collection(name).deleteMany({ projectId: { $in: projectIds } })).deletedCount;
    if (orgIds.length) related += (await db.collection(name).deleteMany({ organizationId: { $in: orgIds } })).deletedCount;
  }
  await ProjectModel.deleteMany({ _id: { $in: projectIds } });
  await OrganizationModel.deleteMany({ _id: { $in: orgIds } });
  await UserModel.deleteMany({ _id: { $in: userIds } });
  console.log(`Removed ${userIds.length} accounts, ${orgIds.length} organizations, ${projectIds.length} workspaces and ${related} records inside them.`);
  console.log("Cached clones stay in BE/mining-cache/<workspace id>; delete them if you need the disk space.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== "--remove")) throw new Error("Use no argument to seed, or --remove to delete the test data.");
  await connectDb();
  try {
    await (args.includes("--remove") ? remove() : seed());
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
