import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { TransferProjectUseCase, sameRepositoryKey } from '../src/application/use-cases/projects/TransferProjectUseCase.ts';
import { MongoProjectRepository } from '../src/infrastructure/repositories/MongoProjectRepository.ts';
import { MongoProjectMemberRepository } from '../src/infrastructure/repositories/MongoProjectMemberRepository.ts';
import { MongoOrganizationRepository } from '../src/infrastructure/repositories/MongoOrganizationRepository.ts';
import { ProjectAccessPolicy } from '../src/application/services/ProjectAccessPolicy.ts';
import { ProjectModel } from '../src/infrastructure/database/models/ProjectModel.ts';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';
import { EvidenceModel } from '../src/infrastructure/database/models/EvidenceModel.ts';
import { WorkspaceModel } from '../src/infrastructure/database/models/WorkspaceModel.ts';
import { ProjectMemberModel } from '../src/infrastructure/database/models/ProjectMemberModel.ts';
import { OrganizationModel } from '../src/infrastructure/database/models/OrganizationModel.ts';
import { OrganizationMemberModel } from '../src/infrastructure/database/models/OrganizationMemberModel.ts';
import { AppError } from '../src/shared/errors/AppError.ts';

// D8 — moving a personal project into an organization (RF-11, UC-29): with its snapshots, evidence, workspace and
// paths; refused with MSG18 when the organization already has that repository.

test('the same repository is recognised however its URL is written', () => {
  const key = sameRepositoryKey('https://github.com/Acme/Shop.git');
  for (const same of ['https://github.com/acme/shop', 'https://GitHub.com/acme/shop/', 'https://github.com/acme/shop.git/']) assert.equal(sameRepositoryKey(same), key, same);
  assert.notEqual(sameRepositoryKey('https://github.com/acme/shop-api'), key);
  assert.notEqual(sameRepositoryKey('https://gitlab.com/acme/shop'), key);
});

// ── With in-memory stand-ins ─────────────────────────────────────────────────

function world() {
  const projects = [
    { id: 'p1', name: 'Shop', repoUrl: 'https://github.com/acme/shop.git', userId: 'olga', visibility: 'private' },
    { id: 'p2', name: 'Shop (team)', repoUrl: 'https://github.com/ACME/shop', userId: 'x', organizationId: 'org2' },
    { id: 'p3', name: 'Other', repoUrl: 'https://github.com/acme/other', userId: 'olga', organizationId: 'org1' },
    { id: 'p4', name: 'Api', repoUrl: 'https://github.com/acme/api', userId: 'olga' },
  ];
  const orgMembers = { org1: { olga: 'owner', mia: 'member' }, org2: { olga: 'owner' }, org3: { olga: 'member' } };
  const projectMembers = {
    p1: [
      { userId: 'olga', name: 'Olga', email: 'olga@x', role: 'project-maintainer', status: 'active' },
      { userId: 'mia', name: 'Mia', email: 'mia@x', role: 'developer-analyst', status: 'active' },
      { userId: 'bob', name: 'Bob', email: 'bob@x', role: 'project-maintainer', status: 'active' },
      { userId: 'ann', name: 'Ann', email: 'ann@x', role: 'developer-analyst', status: 'pending' },
      { name: 'Invited', email: 'inv@x', role: 'developer-analyst', status: 'pending' },
    ],
  };
  const audit = [];
  const uc = new TransferProjectUseCase(
    {
      findById: async id => { const p = projects.find(x => x.id === id); return p ? { ...p } : null; },
      findByOrganizationId: async org => projects.filter(p => p.organizationId === org),
      moveToOrganization: async (id, owner, org) => { const p = projects.find(x => x.id === id && x.userId === owner && !x.organizationId); if (!p) return null; p.organizationId = org; return { ...p }; },
    },
    {
      findById: async id => (orgMembers[id] ? { id, name: id.toUpperCase() } : null),
      findMember: async (org, user) => (orgMembers[org]?.[user] ? { organizationId: org, userId: user, role: orgMembers[org][user] } : null),
    },
    { findByProjectId: async id => projectMembers[id] ?? [] },
    async e => { audit.push(e); },
  );
  return { uc, projects, audit };
}

test('the preview names the members who would lose access and flags a repository the organization already has', async () => {
  const { uc, projects } = world();
  const preview = await uc.preview({ projectId: 'p1', organizationId: 'org1', userId: 'olga' });
  assert.deepEqual(preview.membersLosingAccess.map(m => m.name), ['Bob'], 'Mia is in the organization; the owner and pending invitations do not count');
  assert.equal(preview.duplicate, null);
  assert.deepEqual((await uc.preview({ projectId: 'p1', organizationId: 'org2', userId: 'olga' })).duplicate, { id: 'p2', name: 'Shop (team)' });
  assert.equal(projects[0].organizationId, undefined, 'a preview moves nothing');
});

test('the move sets the organization, keeps the project id, and is audited', async () => {
  const { uc, projects, audit } = world();
  const { project, preview } = await uc.execute({ projectId: 'p1', organizationId: ' org1 ', userId: 'olga' });
  assert.deepEqual([project.id, project.organizationId, projects[0].organizationId], ['p1', 'org1', 'org1']);
  assert.equal(preview.organization.name, 'ORG1');
  assert.deepEqual(audit.map(a => [a.action, a.userId, a.targetId, a.details.organizationId, a.details.membersLosingAccess]), [['PROJECT_TRANSFER', 'olga', 'p1', 'org1', ['bob']]]);
});

test('MSG18: an organization that already has the repository refuses it, and nothing moves', async () => {
  const { uc, projects } = world();
  await assert.rejects(uc.execute({ projectId: 'p1', organizationId: 'org2', userId: 'olga' }),
    e => e instanceof AppError && e.statusCode === 409 && /already has a workspace for this repository \("Shop \(team\)"\)/.test(e.message));
  assert.equal(projects[0].organizationId, undefined);
});

test('only the project owner, only into an organization they own, only a personal project', async () => {
  const { uc } = world();
  await assert.rejects(uc.execute({ projectId: 'p1', organizationId: 'org1', userId: 'mia' }), e => e.statusCode === 403 && /owner of a personal workspace/.test(e.message));
  await assert.rejects(uc.execute({ projectId: 'p1', organizationId: 'org3', userId: 'olga' }), e => e.statusCode === 403 && /owner of the organization/.test(e.message));
  await assert.rejects(uc.execute({ projectId: 'p3', organizationId: 'org2', userId: 'olga' }), e => e.statusCode === 409 && /already belongs/.test(e.message));
  await assert.rejects(uc.execute({ projectId: 'p4', organizationId: 'nope', userId: 'olga' }), e => e.statusCode === 404);
  await assert.rejects(uc.execute({ projectId: 'zz', organizationId: 'org1', userId: 'olga' }), e => e.statusCode === 404);
  await assert.rejects(uc.execute({ projectId: 'p4', organizationId: '', userId: 'olga' }), e => e.statusCode === 400);
});

test('if the project changes hands between the check and the move, the move is refused', async () => {
  const { uc, projects } = world();
  const realFind = uc.projects.findById;
  uc.projects.findById = async id => { const p = await realFind(id); projects[3].organizationId = 'elsewhere'; return p; };
  await assert.rejects(uc.execute({ projectId: 'p4', organizationId: 'org1', userId: 'olga' }), e => e.statusCode === 409 && /changed while/.test(e.message));
  assert.equal(projects[3].organizationId, 'elsewhere');
});

// ── On a real MongoDB (skipped when none is reachable) ───────────────────────

const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_transfer_${randomUUID().slice(0, 8)}`;
let connected = false;
before(async () => {
  try { await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 }); connected = true; } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('on the database: snapshots, evidence and the workspace with its paths stay with the project; access follows the organization', async t => {
  if (!connected) return t.skip('MongoDB is not reachable');
  const id = () => new mongoose.Types.ObjectId().toString();
  const [olga, mia, bob] = [id(), id(), id()];
  const project = await ProjectModel.create({ name: 'Shop', repoUrl: 'https://github.com/acme/shop.git', visibility: 'private', userId: olga, status: 'COMPLETED' });
  const projectId = String(project._id);
  const org = await OrganizationModel.create({ name: 'Acme', createdBy: olga });
  const orgId = String(org._id);
  await OrganizationMemberModel.create([{ organizationId: orgId, userId: olga, role: 'owner', status: 'active' }, { organizationId: orgId, userId: mia, role: 'member', status: 'active' }]);
  await ProjectMemberModel.create([
    { projectId, userId: mia, name: 'Mia', email: 'mia@x', role: 'developer-analyst', status: 'active' },
    { projectId, userId: bob, name: 'Bob', email: 'bob@x', role: 'project-maintainer', status: 'active' },
  ]);
  await SnapshotModel.create({ projectId, hash: 'aaaaaaa', title: 't', author: 'a', date: new Date(), nodes: [], edges: [] });
  await EvidenceModel.collection.insertOne({ projectId: project._id, hash: 'aaaaaaa', title: 'e' });
  await WorkspaceModel.create({ projectId, revision: 2, diagram: { components: [{ id: 'c', name: 'Core', kind: 'Service', description: '', pathPrefixes: ['src/core'] }], dependencies: [], revision: 2 }, rules: [], decisions: [] });

  const projects = new MongoProjectRepository(), members = new MongoProjectMemberRepository(), organizations = new MongoOrganizationRepository();
  const policy = new ProjectAccessPolicy(projects, members, organizations);
  const canRead = async userId => (await policy.evaluate(await projects.findById(projectId), { userId, role: 'developer-analyst' })).actions.has('read');
  assert.deepEqual([await canRead(mia), await canRead(bob)], [true, true]);

  const uc = new TransferProjectUseCase(projects, organizations, members);
  const preview = await uc.preview({ projectId, organizationId: orgId, userId: olga });
  assert.deepEqual(preview.membersLosingAccess.map(m => m.name), ['Bob']);
  const { project: moved } = await uc.execute({ projectId, organizationId: orgId, userId: olga });
  assert.equal(moved.organizationId, orgId);

  assert.equal(await SnapshotModel.countDocuments({ projectId }), 1);
  assert.equal(await EvidenceModel.collection.countDocuments({ projectId: project._id }), 1);
  const ws = await WorkspaceModel.findOne({ projectId }).lean();
  assert.deepEqual(ws.diagram.components[0].pathPrefixes, ['src/core']);
  assert.deepEqual([await canRead(mia), await canRead(bob)], [true, false], 'Bob is not in the organization');
  assert.equal(await projects.moveToOrganization(projectId, olga, id()), null, 'an organization project is not moved again');

  // MSG18 on the database: a second personal project of the same repository cannot follow it into the organization.
  const twin = await ProjectModel.create({ name: 'Shop again', repoUrl: 'https://github.com/ACME/shop', visibility: 'private', userId: olga, status: 'COMPLETED' });
  await assert.rejects(uc.execute({ projectId: String(twin._id), organizationId: orgId, userId: olga }), e => e.statusCode === 409 && /already has a workspace/.test(e.message));
  assert.equal((await ProjectModel.findById(twin._id).lean()).organizationId ?? null, null);
});
