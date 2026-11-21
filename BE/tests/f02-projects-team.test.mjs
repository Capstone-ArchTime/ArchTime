import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { startWorkflowApp } from "./workflow-harness.mjs";
import { ProjectMemberRole } from "../src/domain/entities/ProjectMember.ts";
import { OrganizationMemberStatus, OrganizationRole } from "../src/domain/entities/Organization.ts";
import { InvitationStatus } from "../src/domain/entities/ProjectInvitation.ts";
import { ProjectInvitationModel } from "../src/infrastructure/database/models/ProjectInvitationModel.ts";
import { ProjectMemberModel } from "../src/infrastructure/database/models/ProjectMemberModel.ts";
import { OrganizationMemberModel } from "../src/infrastructure/database/models/OrganizationMemberModel.ts";

// F-02 Projects & team (BM04 §3; owner Bảo), the committed tests by their IDs, against the whole back end:
//   FE-02-TC01..03 (private repository without token refused; invitation expires after 7 days; Member changing roles -> 403),
//   SM-03 Invitation pending -> accepted / declined / expired, SM-04 Membership invited -> active (WF-03, BM04 §6.3).

let h, unavailable = null;

before(async () => {
  h = await startWorkflowApp("f02");
  if (h.unavailable) unavailable = h.unavailable;
});
after(async () => { if (!unavailable) await h.stop(); });

const DAY = 24 * 60 * 60 * 1000;

/** A workspace of a new maintainer, with an active member; the maintainer's token. */
async function team(key) {
  const owner = await h.user(`${key}-owner`);
  const member = await h.user(`${key}-member`);
  const projectId = await h.project(owner, { name: key, members: [[member, ProjectMemberRole.MEMBER]] });
  return { owner, member, projectId, ownerToken: await h.tokenOf(owner) };
}

/** The maintainer invites `email`; the stored invitation (its token is sent by e-mail only). */
async function invite({ projectId, ownerToken }, email, role = ProjectMemberRole.MEMBER) {
  const res = await h.call(ownerToken, "POST", `/projects/${projectId}/members/invite`, { email, role });
  assert.equal(res.status, 201, res.text);
  return ProjectInvitationModel.findOne({ projectId, email }).lean();
}

const statusOf = async (id) => (await ProjectInvitationModel.findById(id).lean()).status;

// ── F-02 Projects & team ─────────────────────────────────────────────────────

test("FE-02-TC01 (F-02): a private repository without a token or credential is refused, and nothing is created", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const owner = await h.user("tc01-owner");
  const token = await h.tokenOf(owner);
  const refused = await h.call(token, "POST", "/projects", { name: "secret-api", repoUrl: "https://github.com/example/secret-api", visibility: "private" });
  assert.equal(refused.status, 400, refused.text);
  assert.match(refused.body.error.message, /Private repositories require a token or an organization credential/);
  const mine = await h.call(token, "GET", "/projects");
  assert.equal(mine.status, 200, mine.text);
  assert.doesNotMatch(mine.text, /secret-api/);

  const accepted = await h.call(token, "POST", "/projects", { name: "secret-api", repoUrl: "https://github.com/example/secret-api", visibility: "private", token: "ghp_test_personal_token_0123456789" });
  assert.equal(accepted.status, 201, accepted.text);
  assert.doesNotMatch(accepted.text, /ghp_test_personal_token/);
});

test("FE-02-TC02 (F-02): an invitation expires after 7 days and can no longer be accepted", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await team("tc02");
  const invitee = await h.user("tc02-invitee");
  const sentAt = Date.now();
  const invitation = await invite(ws, invitee.email);
  const lifetime = new Date(invitation.expiresAt).getTime() - sentAt;
  assert.ok(Math.abs(lifetime - 7 * DAY) < 60_000, `expires 7 days after it is sent, not ${lifetime / DAY} days`);

  // Eight days later.
  await ProjectInvitationModel.updateOne({ _id: invitation._id }, { expiresAt: new Date(Date.now() - DAY) });
  const late = await h.call(null, "POST", `/invitations/${invitation.token}/accept`);
  assert.equal(late.status, 400, late.text);
  assert.match(late.body.error.message, /expired/i);
  assert.equal(await ProjectMemberModel.countDocuments({ projectId: ws.projectId, userId: invitee.id }), 0);
});

test("FE-02-TC03 (F-02): a Member changing roles gets 403; the role stays", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await team("tc03");
  const colleague = await h.user("tc03-colleague");
  await ProjectMemberModel.create({ projectId: ws.projectId, userId: colleague.id, email: colleague.email, name: colleague.email, role: ProjectMemberRole.MEMBER, status: "active", invitedBy: ws.owner.id });
  const memberToken = await h.tokenOf(ws.member);
  const self = await ProjectMemberModel.findOne({ projectId: ws.projectId, userId: ws.member.id }).lean();
  const other = await ProjectMemberModel.findOne({ projectId: ws.projectId, userId: colleague.id }).lean();

  for (const target of [self, other]) {
    const res = await h.call(memberToken, "PATCH", `/projects/${ws.projectId}/members/${target._id}`, { role: ProjectMemberRole.MAINTAINER });
    assert.equal(res.status, 403, res.text);
    assert.equal((await ProjectMemberModel.findById(target._id).lean()).role, ProjectMemberRole.MEMBER);
  }
  const invited = await h.call(memberToken, "POST", `/projects/${ws.projectId}/members/invite`, { email: "someone@archtime.test", role: ProjectMemberRole.MAINTAINER });
  assert.equal(invited.status, 403, invited.text);

  // The maintainer may.
  const byOwner = await h.call(ws.ownerToken, "PATCH", `/projects/${ws.projectId}/members/${other._id}`, { role: ProjectMemberRole.MAINTAINER });
  assert.equal(byOwner.status, 200, byOwner.text);
  assert.equal((await ProjectMemberModel.findById(other._id).lean()).role, ProjectMemberRole.MAINTAINER);
});

// ── SM-03 Invitation ─────────────────────────────────────────────────────────

test("SM-03 pending -> accepted: the invitee joins with the invited role, and the invitation cannot be used again", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await team("sm03a");
  const invitee = await h.user("sm03a-invitee");
  const invitation = await invite(ws, invitee.email);
  assert.equal(invitation.status, InvitationStatus.PENDING);
  const pending = await h.call(ws.ownerToken, "GET", `/projects/${ws.projectId}/invitations`);
  assert.deepEqual(pending.body.data.invitations.map((i) => i.email), [invitee.email]);

  const res = await h.call(await h.tokenOf(invitee), "POST", `/invitations/${invitation.token}/accept`);
  assert.equal(res.status, 200, res.text);
  assert.equal(await statusOf(invitation._id), InvitationStatus.ACCEPTED);
  const membership = await ProjectMemberModel.findOne({ projectId: ws.projectId, userId: invitee.id }).lean();
  assert.equal(membership.role, ProjectMemberRole.MEMBER);
  assert.equal(membership.status, "active");
  assert.equal((await h.call(await h.tokenOf(invitee), "GET", `/projects/${ws.projectId}`)).status, 200);

  const again = await h.call(null, "POST", `/invitations/${invitation.token}/accept`);
  assert.equal(again.status, 404, again.text);
  assert.equal((await h.call(ws.ownerToken, "GET", `/projects/${ws.projectId}/invitations`)).body.data.invitations.length, 0);
});

test("SM-03 pending -> declined: no membership is created, and the declined invitation cannot be accepted", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await team("sm03b");
  const invitee = await h.user("sm03b-invitee");
  const invitation = await invite(ws, invitee.email);

  const res = await h.call(null, "POST", `/invitations/${invitation.token}/decline`);
  assert.equal(res.status, 200, res.text);
  assert.equal(await statusOf(invitation._id), InvitationStatus.DECLINED);
  assert.equal(await ProjectMemberModel.countDocuments({ projectId: ws.projectId, userId: invitee.id }), 0);

  const accept = await h.call(null, "POST", `/invitations/${invitation.token}/accept`);
  assert.equal(accept.status, 404, accept.text);
  assert.equal(await ProjectMemberModel.countDocuments({ projectId: ws.projectId, userId: invitee.id }), 0);
});

test("SM-03 pending -> expired: an answer after the deadline marks it expired and grants nothing", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const ws = await team("sm03c");
  const invitee = await h.user("sm03c-invitee");
  const invitation = await invite(ws, invitee.email);
  await ProjectInvitationModel.updateOne({ _id: invitation._id }, { expiresAt: new Date(Date.now() - 1000) });

  const res = await h.call(await h.tokenOf(invitee), "POST", `/invitations/${invitation.token}/accept`);
  assert.equal(res.status, 400, res.text);
  assert.equal(await statusOf(invitation._id), InvitationStatus.EXPIRED);
  assert.equal(await ProjectMemberModel.countDocuments({ projectId: ws.projectId, userId: invitee.id }), 0);
  // Expired is final: neither a second accept nor a decline brings it back.
  assert.equal((await h.call(null, "POST", `/invitations/${invitation.token}/accept`)).status, 404);
  assert.equal((await h.call(null, "POST", `/invitations/${invitation.token}/decline`)).status, 404);
  assert.equal(await statusOf(invitation._id), InvitationStatus.EXPIRED);
});

// ── SM-04 Membership ─────────────────────────────────────────────────────────

test("SM-04 invited -> active: an invited person has no access until they accept, then becomes an active member", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const owner = await h.user("sm04-owner");
  const invitee = await h.user("sm04-invitee");
  const ownerToken = await h.tokenOf(owner);
  const inviteeToken = await h.tokenOf(invitee);
  const orgId = await h.organization(owner, "Acme SM-04");

  const sent = await h.call(ownerToken, "POST", `/organizations/${orgId}/members`, { email: invitee.email, role: OrganizationRole.MEMBER });
  assert.equal(sent.status, 201, sent.text);
  const membership = await OrganizationMemberModel.findOne({ organizationId: orgId, userId: invitee.id }).lean();
  assert.equal(membership.status, OrganizationMemberStatus.INVITED);
  assert.equal((await h.call(inviteeToken, "GET", `/organizations/${orgId}`)).status, 404, "invited is not a member yet");
  const waiting = await h.call(inviteeToken, "GET", "/organizations/invitations");
  assert.deepEqual(waiting.body.data.invitations.map((i) => i.organizationId), [orgId]);

  const accepted = await h.call(inviteeToken, "POST", `/organizations/${orgId}/invitation/accept`);
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal((await OrganizationMemberModel.findById(membership._id).lean()).status, OrganizationMemberStatus.ACTIVE);
  const org = await h.call(inviteeToken, "GET", `/organizations/${orgId}`);
  assert.equal(org.status, 200, org.text);
  assert.equal(org.body.data.organization?.myRole ?? org.body.data.myRole, OrganizationRole.MEMBER);
  assert.equal((await h.call(inviteeToken, "GET", "/organizations/invitations")).body.data.invitations.length, 0);
  // Accepting twice changes nothing.
  assert.equal((await h.call(inviteeToken, "POST", `/organizations/${orgId}/invitation/accept`)).status, 404);
});
