import test from "node:test";
import assert from "node:assert/strict";
import { createProjectRoleMiddleware } from "../src/presentation/middlewares/projectRole.ts";
import { MemberStatus, ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { RepoVisibility } from "../src/domain/entities/Project.ts";
import { UserRole } from "../src/domain/entities/User.ts";

// WF-04, DS-04a: a member proposes an architecture change and a maintainer approves it. Proposing is its own action, so a
// member may ask without being able to edit the diagram, and a viewer of a public workspace may not ask at all.

const project = { id: "p1", userId: "owner", visibility: RepoVisibility.PUBLIC };
const members = [
  { projectId: "p1", userId: "lead", role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE },
  { projectId: "p1", userId: "newcomer", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
  { projectId: "p1", userId: "invited", role: ProjectMemberRole.MEMBER, status: MemberStatus.INVITED },
];
const checkRole = createProjectRoleMiddleware(
  { async findById(id) { return id === "p1" ? project : null; } },
  { async findByProjectAndUserId(pid, uid) { return members.find((m) => m.projectId === pid && m.userId === uid) ?? null; } },
);
async function status(action, userId, role = UserRole.USER) {
  let error;
  await checkRole(action)({ params: { id: "p1" }, user: { userId, role } }, {}, (e) => { error = e; });
  return error?.statusCode ?? 200;
}

test("Proposing a change: owner, maintainer and member may; a viewer, an invitee and a stranger may not", async () => {
  assert.equal(await status("propose", "owner"), 200);
  assert.equal(await status("propose", "lead"), 200);
  assert.equal(await status("propose", "newcomer"), 200, "a member proposes (DS-04a)");
  assert.equal(await status("propose", "invited"), 403, "an invitation not yet accepted gives nothing");
  assert.equal(await status("propose", "visitor"), 403, "a viewer of a public workspace reads but does not propose");
});

test("Proposing does not let a member edit the diagram or decide on proposals", async () => {
  assert.equal(await status("write", "newcomer"), 403, "the diagram, rules and ADRs stay maintainer work");
  assert.equal(await status("admin", "newcomer"), 403, "approving and rejecting stay maintainer work");
  assert.equal(await status("admin", "lead"), 200);
});
