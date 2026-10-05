import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';
import { ArchitectureMappingModel } from '../src/infrastructure/database/models/ArchitectureMappingModel.ts';
import { ProjectModel } from '../src/infrastructure/database/models/ProjectModel.ts';
import { MiningJobModel } from '../src/infrastructure/database/models/MiningJobModel.ts';
import { ArchitectureService } from '../src/infrastructure/services/ArchitectureService.ts';
import { MiningService } from '../src/infrastructure/services/MiningService.ts';
import { ArchitectureUseCase } from '../src/application/use-cases/projects/ArchitectureUseCase.ts';
import { setLlmRuntime } from '../src/infrastructure/llm/runtime.ts';
import { LlmError } from '../src/domain/architecture/llm/types.ts';

const OWNER = '64b000000000000000000001';
const PROJECT = '64b000000000000000000002';
const SNAP = '64b000000000000000000011';

const nodes = [], edges = [];
const AREAS = ['Orders', 'Payments', 'Customers', 'Shipping', 'Catalog', 'Reports', 'Auth', 'Search'];
for (let f = 0; f < AREAS.length; f++) {
  const names = Array.from({ length: 3 }, (_, i) => `src/area${f}/file${i}.ts`);
  names.forEach(id => nodes.push({ id, name: id, type: 'module' }));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) edges.push({ source: names[i], target: names[j].replace(/\.ts$/, ''), type: 'imports' });
  if (f) edges.push({ source: names[0], target: `src/area${f - 1}/file0`, type: 'imports' });
}
const snapshot = { _id: SNAP, projectId: PROJECT, hash: 'abc1234', title: 'Add things', date: new Date('2024-03-01'), nodes, edges };
let mappings = [];

const q = value => ({ sort: () => q(value), lean: async () => value, then: (r, j) => Promise.resolve(value).then(r, j) });
SnapshotModel.findOne = filter => q(filter.projectId === PROJECT && (!filter._id || filter._id === SNAP) ? snapshot : null);
ArchitectureMappingModel.findOne = filter => q(mappings.find(m => m.projectId === filter.projectId && m.snapshotId === filter.snapshotId) ?? null);
ArchitectureMappingModel.findOneAndUpdate = (filter, update) => {
  let row = mappings.find(m => m.projectId === filter.projectId && m.snapshotId === filter.snapshotId);
  if (!row) { row = { ...filter, createdAt: new Date() }; mappings.push(row); }
  Object.assign(row, update.$set, { updatedAt: new Date() });
  return q(row);
};
ProjectModel.findOne = async filter => (filter._id === PROJECT && filter.userId === OWNER ? { _id: PROJECT } : null);
ProjectModel.findById = async id => (id === PROJECT ? { _id: PROJECT } : null);
const jobs = [];
MiningJobModel.exists = async () => (jobs.some(j => ['queued', 'running'].includes(j.status)) ? { _id: 1 } : null);
MiningJobModel.create = async data => { const job = { _id: `job${jobs.length + 1}`, id: `job${jobs.length + 1}`, ...data }; jobs.push(job); return job; };
MiningJobModel.findById = async id => jobs.find(j => j._id === id) ?? null;
MiningJobModel.updateOne = async (filter, update) => { Object.assign(jobs.find(j => j._id === filter._id), update.$set); };

const answerFor = files => {
  const byArea = AREAS.map((_, a) => files.flatMap((f, i) => (f.includes(`/area${a}/`) ? [i] : [])));
  return { components: byArea.map((fs, a) => ({ name: AREAS[a], role: a === 0 ? 'service' : 'other', description: `Area ${a}.`, files: fs })) };
};
const FILES = nodes.map(n => n.id).sort();
const fakeClient = (behaviour) => ({
  calls: 0,
  info: { provider: 'test', model: 'test-model', host: 'gpu.local', external: false },
  async complete() { this.calls++; return behaviour(this.calls); },
});
const enable = client => setLlmRuntime({ client, options: {}, capability: { enabled: true, provider: 'test', model: 'test-model', host: 'gpu.local', external: false } });
const waitFor = async (job) => { for (let i = 0; i < 200 && ['queued', 'running'].includes(job.status); i++) await new Promise(r => setTimeout(r, 10)); return job; };

test('without a configured model the capability says so and refining is refused', async () => {
  setLlmRuntime({ client: null, options: {}, capability: { enabled: false, provider: null, model: null, host: null, external: false, reason: 'No AI provider is configured on this server.' } });
  const missing = await ArchitectureService.get(PROJECT);
  assert.equal(missing.llm.enabled, false);
  await assert.rejects(new ArchitectureUseCase().refine(PROJECT, OWNER, {}), /No AI provider is configured/);
  await assert.rejects(ArchitectureService.refine(PROJECT, undefined), /No AI provider is configured/);
  assert.equal(jobs.length, 0);
});

test('refining stores the verified answer with its receipt and reports what the server can do', async () => {
  const client = fakeClient(() => JSON.stringify(answerFor(FILES)));
  enable(client);
  const progress = [];
  const payload = await ArchitectureService.refine(PROJECT, undefined, { onProgress: (stage, p) => { progress.push([stage, p]); } }, { minComponents: 2, maxComponents: 10 });
  assert.equal(payload.status, 'ready');
  assert.equal(payload.view.generator, 'cluster+llm');
  assert.deepEqual(payload.view.components.map(c => c.name), AREAS);
  assert.deepEqual(payload.validation.issues.filter(i => i.severity === 'error'), []);
  assert.equal(payload.mapping.receipt.accepted, true);
  assert.equal(payload.llm.model, 'test-model');
  assert.equal(mappings[0].generator, 'cluster+llm');
  assert.ok(progress.length >= 2 && progress.every(([, p]) => p >= 0 && p <= 100));
  const again = await ArchitectureService.get(PROJECT);
  assert.deepEqual(again.view, payload.view, 'the stored mapping rebuilds the same view');
});

test('when the model cannot give a verifiable answer, the clustering result is stored with the reason', async () => {
  mappings = [];
  const client = fakeClient(() => '{"components":[]}');
  enable(client);
  const payload = await ArchitectureService.refine(PROJECT, undefined, {}, { minComponents: 2, maxComponents: 10 });
  assert.equal(client.calls, 3);
  assert.equal(payload.view.generator, 'cluster-only');
  assert.equal(payload.mapping.receipt.accepted, false);
  assert.match(payload.mapping.receipt.fallbackReason, /after 3 attempts/);
  assert.equal(payload.view.components.length >= 2, true);
});

test('the background job runs through the queue, reports progress and finishes', async () => {
  mappings = [];
  enable(fakeClient(() => JSON.stringify(answerFor(FILES))));
  const jobId = await new ArchitectureUseCase().refine(PROJECT, OWNER, {});
  const job = await waitFor(jobs.find(j => j._id === jobId));
  assert.equal(job.kind, 'abstract');
  assert.equal(job.status, 'completed', job.error);
  assert.equal(job.progress, 100);
  assert.match(job.stage, /Refined by test-model/);
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0].generator, 'cluster+llm');
});

test('a job whose model fails still completes and says it did so without AI', async () => {
  mappings = [];
  enable(fakeClient(() => { throw new LlmError('auth', 'The API key was rejected.'); }));
  const jobId = await MiningService.startAbstractJob(PROJECT, OWNER, SNAP);
  const job = await waitFor(jobs.find(j => j._id === jobId));
  assert.equal(job.status, 'completed');
  assert.match(job.stage, /Completed without AI: auth/);
  assert.equal(mappings[0].generator, 'cluster-only');
  assert.equal(job.target, SNAP);
});

test('a job on a missing snapshot fails with a message, not a crash', async () => {
  enable(fakeClient(() => '{}'));
  const jobId = await MiningService.startAbstractJob('64b0000000000000000000aa', OWNER).catch(e => e);
  assert.match(String(jobId.message ?? jobId), /Project not found/);
});

test('only the owner can start a refinement and only one job per project runs at a time', async () => {
  let release;
  enable(fakeClient(() => new Promise((_, reject) => { release = () => reject(new LlmError('auth', 'stop')); }))); // holds the first job open
  const useCase = new ArchitectureUseCase();
  await assert.rejects(useCase.refine(PROJECT, 'someone-else', {}), /Project not found/);
  await assert.rejects(useCase.refine(PROJECT, OWNER, { snapshotId: 'bad' }), /Invalid snapshot ID/);
  await useCase.refine(PROJECT, OWNER, {});
  await assert.rejects(useCase.refine(PROJECT, OWNER, {}), /already queued or running/);
  for (let i = 0; i < 100 && !release; i++) await new Promise(r => setTimeout(r, 10));
  release();
  await waitFor(jobs.at(-1));
  setLlmRuntime(null);
});
