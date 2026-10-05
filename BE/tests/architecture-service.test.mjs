import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';
import { ArchitectureMappingModel } from '../src/infrastructure/database/models/ArchitectureMappingModel.ts';
import { ProjectModel } from '../src/infrastructure/database/models/ProjectModel.ts';
import { ArchitectureService } from '../src/infrastructure/services/ArchitectureService.ts';
import { ArchitectureUseCase } from '../src/application/use-cases/projects/ArchitectureUseCase.ts';

const OWNER = '64b000000000000000000001';
const PROJECT = '64b000000000000000000002';
const SNAP_OLD = '64b000000000000000000010';
const SNAP_NEW = '64b000000000000000000011';

function graph(folders) {
  const nodes = [], edges = [];
  for (let f = 0; f < folders; f++) {
    const names = Array.from({ length: 4 }, (_, i) => `src/area${f}/file${i}.ts`);
    names.forEach(id => nodes.push({ id, name: id.split('/').pop(), type: 'module' }));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) edges.push({ source: names[i], target: names[j].replace(/\.ts$/, '.js'), type: 'imports' });
    if (f) edges.push({ source: names[0], target: `src/area${f - 1}/file0`, type: 'imports' });
  }
  return { nodes, edges };
}
const snapshots = [
  { _id: SNAP_OLD, projectId: PROJECT, hash: 'aaa1111', title: 'old', date: new Date('2024-01-01'), ...graph(9) },
  { _id: SNAP_NEW, projectId: PROJECT, hash: 'bbb2222', title: 'new\nbody', date: new Date('2024-03-01'), ...graph(10) },
];
let mappings = [];

const q = value => ({ sort: () => q(value), lean: async () => value, then: (r, j) => Promise.resolve(value).then(r, j) });
SnapshotModel.findOne = filter => {
  const rows = snapshots.filter(s => s.projectId === filter.projectId && (!filter._id || s._id === String(filter._id))).sort((a, b) => b.date - a.date);
  return q(rows[0] ?? null);
};
ArchitectureMappingModel.findOne = filter => q(mappings.find(m => m.projectId === filter.projectId && m.snapshotId === filter.snapshotId) ?? null);
ArchitectureMappingModel.findOneAndUpdate = (filter, update) => {
  let row = mappings.find(m => m.projectId === filter.projectId && m.snapshotId === filter.snapshotId);
  if (!row) { row = { ...filter, createdAt: new Date() }; mappings.push(row); }
  Object.assign(row, update.$set, { updatedAt: new Date() });
  return q(row);
};
ProjectModel.findOne = async filter => (filter._id === PROJECT && filter.userId === OWNER ? { _id: PROJECT } : null);

test('nothing is stored until the grouping is generated', async () => {
  const result = await ArchitectureService.get(PROJECT);
  assert.equal(result.status, 'missing');
  assert.equal(result.snapshot.hash, 'bbb2222', 'defaults to the latest snapshot');
  assert.equal(result.view, null);
});

test('generate stores a mapping and returns a verified view', async () => {
  const result = await ArchitectureService.generate(PROJECT);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.validation.issues.filter(i => i.severity === 'error'), []);
  assert.equal(result.view.components.length, 10);
  assert.equal(result.view.generator, 'cluster-only');
  assert.equal(result.view.title, 'new (bbb2222)');
  assert.equal(result.mapping.stale, false);
  assert.equal(mappings.length, 1);
  const again = await ArchitectureService.get(PROJECT);
  assert.deepEqual(again.view, result.view, 'reading back rebuilds exactly the same view');
});

test('regenerating replaces the mapping instead of adding another', async () => {
  await ArchitectureService.generate(PROJECT, SNAP_NEW, { minComponents: 3, maxComponents: 5 });
  assert.equal(mappings.length, 1);
  assert.ok(mappings[0].components.length <= 5);
});

test('a mapping goes stale when the snapshot graph changes underneath it', async () => {
  mappings[0].graphHash = 'something-else';
  assert.equal((await ArchitectureService.get(PROJECT)).mapping.stale, true);
});

test('another snapshot can be chosen, and unknown ones are rejected', async () => {
  const old = await ArchitectureService.generate(PROJECT, SNAP_OLD);
  assert.equal(old.view.components.length, 9);
  assert.equal(mappings.length, 2);
  await assert.rejects(ArchitectureService.get(PROJECT, '64b0000000000000000000ff'), /Snapshot not found/);
});

test('only the owner may read or generate, and ids are validated', async () => {
  const useCase = new ArchitectureUseCase();
  await assert.rejects(useCase.get(PROJECT, 'someone-else'), /Project not found/);
  await assert.rejects(useCase.generate(PROJECT, 'someone-else', {}), /Project not found/);
  await assert.rejects(useCase.get('not-an-id', OWNER), /Invalid project ID/);
  await assert.rejects(useCase.get(PROJECT, OWNER, 'bad'), /Invalid snapshot ID/);
  const ok = await useCase.generate(PROJECT, OWNER, { snapshotId: SNAP_NEW, minComponents: 'nope' });
  assert.equal(ok.status, 'ready');
});

test('a snapshot with no source files is a clear error', async () => {
  snapshots.push({ _id: '64b000000000000000000012', projectId: '64b000000000000000000003', hash: 'c', title: 'empty', date: new Date(), nodes: [], edges: [] });
  await assert.rejects(ArchitectureService.generate('64b000000000000000000003'), /no source files/);
  mappings = [];
});
