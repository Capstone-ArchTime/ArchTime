import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { LlmRunService } from '../src/infrastructure/services/LlmRunService.ts';
import { LlmRunModel } from '../src/infrastructure/database/models/LlmRunModel.ts';
import { ProjectModel } from '../src/infrastructure/database/models/ProjectModel.ts';

// UC-30: AI cost per project of an organization. Runs against a throwaway database on a real MongoDB and is skipped when none is usable.
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_orgcost_${randomUUID().slice(0, 8)}`;
let unavailable = null;

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
  } catch (err) {
    unavailable = `MongoDB is not usable: ${err.message}`;
  }
});

after(async () => {
  if (!unavailable) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const run = (projectId, extra = {}) => ({
  projectId, userId: 'u1', modelKey: 'm', provider: 'p', model: 'm', mode: 'chat', purpose: 'user', status: 'accepted',
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 150, estimated: false },
  cost: { amount: 0.01, currency: 'USD' }, latencyMs: 1, wallMs: 1, attempts: [], ...extra,
});

test('runs are charged to the organization owning the project, and summed per project for a period', async t => {
  if (unavailable) return t.skip(unavailable);
  const orgId = new mongoose.Types.ObjectId().toString();
  const [api, web, mine] = await ProjectModel.create([
    { name: 'api', repoUrl: 'https://github.com/a/api.git', userId: 'owner', visibility: 'public', organizationId: orgId },
    { name: 'web', repoUrl: 'https://github.com/a/web.git', userId: 'owner', visibility: 'public', organizationId: orgId },
    { name: 'mine', repoUrl: 'https://github.com/a/mine.git', userId: 'owner', visibility: 'public' },
  ]);

  const recorded = await LlmRunService.recordChat({
    projectId: String(api._id), userId: 'u1', status: 'accepted', latencyMs: 1, wallMs: 1,
    model: { modelId: null, modelKey: 'env', pricing: null, client: { info: { provider: 'anthropic', model: 'claude' } } },
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, reasoningTokens: 0, estimated: false },
  });
  assert.ok(recorded, 'the run is recorded');
  assert.equal((await LlmRunModel.findById(recorded.id).lean()).organizationId, orgId, 'a new run carries the owning organization');

  await LlmRunModel.create([
    run(String(api._id), { organizationId: orgId }),
    run(String(api._id), { organizationId: orgId }),
    run(String(web._id)),                                            // recorded before runs carried their organization
    run(String(mine._id)),                                           // personal project: not the organization's
    run(String(web._id), { organizationId: orgId, purpose: 'benchmark' }), // benchmarks are not user cost
  ]);
  await LlmRunModel.create(run(String(web._id), { organizationId: orgId }));
  await LlmRunModel.collection.updateOne({ projectId: String(web._id), organizationId: orgId, purpose: 'user' }, { $set: { createdAt: new Date('2020-01-01') } });

  const all = await LlmRunService.costByProject(orgId);
  const byName = Object.fromEntries(all.projects.map(p => [p.projectName, p]));
  assert.equal(byName.mine, undefined);
  assert.equal(byName.api.runs, 1 + 2);
  assert.equal(byName.web.runs, 2);
  assert.equal(all.total.runs, byName.api.runs + 2);

  const recent = await LlmRunService.costByProject(orgId, { from: new Date('2025-01-01') });
  assert.equal(recent.projects.find(p => p.projectName === 'web').runs, 1, 'the period filter applies');
});
