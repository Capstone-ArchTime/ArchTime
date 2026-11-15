import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoOrganizationRepository } from '../src/infrastructure/repositories/MongoOrganizationRepository.ts';
import { OrganizationModel } from '../src/infrastructure/database/models/OrganizationModel.ts';
import { AgentContextUseCases } from '../src/application/use-cases/agent/AgentUseCases.ts';
import { ProjectAccessPolicy, deniedMessage } from '../src/application/services/ProjectAccessPolicy.ts';
import { OrganizationRole } from '../src/domain/entities/Organization.ts';
import { UserRole } from '../src/domain/entities/User.ts';

// T7 / RF-14, UC-25: temporary suspension of an organization. On MongoDB the write is conditional, so two
// administrators acting at once cannot both "suspend" (or both "reactivate"). Skipped without MongoDB (CI has one).
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_orgsusp_${randomUUID().slice(0, 8)}`;
let connected = false;
before(async () => {
  try { await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 }); connected = true; } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('setSuspension on MongoDB: suspends once, reactivates once, organizations written before the field count as active', async t => {
  if (!connected) return t.skip('MongoDB is not reachable');
  const repo = new MongoOrganizationRepository();
  const org = await repo.create({ name: 'Acme', createdBy: 'u1' });
  assert.equal(org.suspension, null);
  // A document from before suspension existed has no field at all.
  const legacy = await OrganizationModel.collection.insertOne({ name: 'Old', createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() });
  assert.equal((await repo.findById(String(legacy.insertedId))).suspension, null);

  const suspension = { at: new Date('2026-11-16T08:00:00Z'), by: 'admin', reason: 'Security review' };
  const both = await Promise.all([repo.setSuspension(org.id, suspension), repo.setSuspension(org.id, suspension)]);
  assert.equal(both.filter(Boolean).length, 1, 'only one of two simultaneous suspensions applies');
  assert.deepEqual((await repo.findById(org.id)).suspension, suspension);
  assert.ok(await repo.setSuspension(String(legacy.insertedId), suspension), 'a legacy document can be suspended');

  const back = await Promise.all([repo.setSuspension(org.id, null), repo.setSuspension(org.id, null)]);
  assert.equal(back.filter(Boolean).length, 1, 'only one of two simultaneous reactivations applies');
  assert.equal((await repo.findById(org.id)).suspension, null);
  assert.equal(await repo.setSuspension('not-an-id', suspension), null);
});

const suspendedOrg = { id: 'acme', name: 'Acme', suspension: { at: new Date(), by: 'admin', reason: 'r' } };

test('a project token of a suspended organization\'s workspace reads no architecture context', async () => {
  const workspace = { diagram: { confirmedAt: new Date(), components: [], dependencies: [] }, rules: [], decisions: [], revision: 1 };
  const projects = { findById: async id => ({ id, name: 'api', organizationId: 'acme' }) };
  const org = { ...suspendedOrg };
  const uc = new AgentContextUseCases({ findByProjectId: async () => workspace }, projects, 'http://api', { findById: async () => org });
  await assert.rejects(uc.context('p1', 'src/a.ts'), err => err.statusCode === 403 && /suspended/.test(err.message));
  await assert.rejects(uc.agentsMd('p1'), err => err.statusCode === 403);
  org.suspension = null;
  assert.equal((await uc.context('p1', 'src/a.ts')).file, 'src/a.ts');
});

test('the access policy closes a suspended organization\'s workspace to its owner and says why; admins keep metadata', async () => {
  const project = { id: 'p1', userId: 'alice', organizationId: 'acme' };
  const policy = new ProjectAccessPolicy(
    { findById: async () => project },
    { findByProjectAndUserId: async () => null, findByUserId: async () => [] },
    { findMember: async () => ({ role: OrganizationRole.OWNER }), listMembershipsOfUser: async () => [], findById: async () => suspendedOrg },
  );
  const owner = await policy.evaluate(project, { userId: 'alice', role: UserRole.USER });
  assert.deepEqual([...owner.actions], []);
  assert.match(deniedMessage(owner, 'read'), /suspended/);
  const admin = await policy.evaluate(project, { userId: 'admin', role: UserRole.SYSTEM_ADMINISTRATOR });
  assert.deepEqual([...admin.actions], ['metadata']);
});
