import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ArchitectureService } from '../src/infrastructure/services/ArchitectureService.ts';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';
import { ArchitectureMappingModel } from '../src/infrastructure/database/models/ArchitectureMappingModel.ts';
import { ALGORITHM_VERSION, graphHash } from '../src/domain/architecture/buildView.ts';

// Runs against a throwaway database on a real MongoDB and is skipped when none is usable.
// Set MONGODB_TEST_URI to use a server other than the local default.
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_match_${randomUUID().slice(0, 8)}`;
let unavailable = null;

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await Promise.all([SnapshotModel.syncIndexes(), ArchitectureMappingModel.syncIndexes()]);
  } catch (err) {
    unavailable = `MongoDB is not usable: ${err.message}`;
  }
});

after(async () => {
  if (!unavailable) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const projectId = 'p-match';
const java = (pkg, names) => names.map(n => `src/${pkg}/${n}.java`);

async function snapshot(hash, date, groups, { mapped = true } = {}) {
  const nodes = Object.values(groups).flat().map(id => ({ id, name: id.split('/').pop(), type: 'file' }));
  const snap = await SnapshotModel.create({ projectId, hash, title: `commit ${hash}`, author: 'dev', date: new Date(date), nodes, edges: [] });
  if (mapped) {
    await ArchitectureMappingModel.create({
      projectId, snapshotId: String(snap._id), generator: 'cluster-only', algorithmVersion: ALGORITHM_VERSION,
      graphHash: graphHash({ nodes, edges: [] }), options: { minComponents: 2, maxComponents: 10 },
      components: Object.entries(groups).map(([name, memberIds]) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, role: 'service', label: 'INFERENCE', memberIds })),
    });
  }
  return String(snap._id);
}

const shop = java('shop', ['Cart', 'CartItem', 'Catalog', 'Product', 'Price', 'Stock']);
const user = java('user', ['User', 'Login', 'Session']);

test('two snapshots are matched through their files, earlier one first whatever the order asked', async t => {
  if (unavailable) return t.skip(unavailable);
  const s1 = await snapshot('aaa1111', '2026-01-01', { Shop: shop, Users: user, 'Unassigned Files': ['src/Misc.java'] });
  const s2 = await snapshot('bbb2222', '2026-02-01', { Cart: shop.slice(0, 2), Catalog: shop.slice(2), Accounts: user, 'Unassigned Files': ['src/Misc.java'] });

  const res = await ArchitectureService.match(projectId, s2, s1);
  assert.equal(res.before.snapshot.hash, 'aaa1111');
  assert.equal(res.after.snapshot.hash, 'bbb2222');
  assert.equal(res.before.stale, false);
  assert.deepEqual(res.before.components.map(c => c.name).sort(), ['Shop', 'Users']);
  assert.deepEqual(res.matching.changes.map(c => `${c.kind}:${c.before}>${c.after}`), ['split:shop>cart,catalog', 'renamed:users>accounts']);
  assert.equal(res.matching.successor.shop, 'catalog');
});

test('a snapshot without components is refused with a reason', async t => {
  if (unavailable) return t.skip(unavailable);
  const s1 = await snapshot('ccc3333', '2026-03-01', { Shop: shop });
  const s2 = await snapshot('ddd4444', '2026-04-01', { Shop: shop }, { mapped: false });
  await assert.rejects(ArchitectureService.match(projectId, s1, s2), err => err.statusCode === 400 && /ddd4444 has no components/.test(err.message));
  await assert.rejects(ArchitectureService.match('other-project', s1, s1), err => err.statusCode === 404);
});

test('lineage follows components through every mapped snapshot in date order', async t => {
  if (unavailable) return t.skip(unavailable);
  await SnapshotModel.deleteMany({ projectId });
  await ArchitectureMappingModel.deleteMany({ projectId });
  const s3 = await snapshot('e3', '2026-07-01', { Catalog: shop.slice(2), Cart: shop.slice(0, 2), Accounts: user });
  const s1 = await snapshot('e1', '2026-05-01', { Shop: shop, Users: user });
  await snapshot('e2x', '2026-05-15', { Shop: shop }, { mapped: false });
  const s2 = await snapshot('e2', '2026-06-01', { Shop: shop, Accounts: user });

  const res = await ArchitectureService.lineage(projectId);
  assert.deepEqual(res.snapshots.map(s => s.hash), ['e1', 'e2', 'e3']);
  assert.equal(res.steps.length, 2);
  assert.equal(res.byComponent[s3].catalog, `${s1}:shop`);
  assert.equal(res.byComponent[s3].accounts, `${s1}:users`);
  assert.equal(res.byComponent[s3].cart, `${s3}:cart`);
  assert.equal(res.byComponent[s2].accounts, `${s1}:users`);
  assert.deepEqual(res.steps[1].summary.split, 1);
});

test('evaluation compares the recovered architecture with the directory baseline over the mapped snapshots', async t => {
  if (unavailable) return t.skip(unavailable);
  const pid = 'p-eval';
  const make = async (hash, date, groups) => {
    const nodes = Object.values(groups).flat().map(id => ({ id, name: id.split('/').pop(), type: 'file' }));
    const snap = await SnapshotModel.create({ projectId: pid, hash, title: hash, author: 'dev', date: new Date(date), nodes, edges: [] });
    await ArchitectureMappingModel.create({
      projectId: pid, snapshotId: String(snap._id), generator: 'cluster-only', algorithmVersion: ALGORITHM_VERSION, graphHash: graphHash({ nodes, edges: [] }),
      options: { minComponents: 2, maxComponents: 10 },
      components: Object.entries(groups).map(([name, memberIds]) => ({ id: name.toLowerCase(), name, role: 'service', label: 'INFERENCE', memberIds })),
    });
    return String(snap._id);
  };
  await make('v1', '2026-08-01', { Shop: shop, Users: user });
  await make('v2', '2026-09-01', { Cart: shop.slice(0, 2), Catalog: shop.slice(2), Users: user });

  const res = await ArchitectureService.evaluation(pid, { depth: 1 });
  assert.equal(res.baselineDepth, 1);
  assert.equal(res.hasReference, false);
  assert.deepEqual(res.snapshots.map(s => s.snapshot.hash), ['v1', 'v2']);
  assert.equal(res.snapshots[0].recoveredVsBaseline.score, 100); // shop/ and user/ folders are exactly Shop and Users
  assert.equal(res.steps[0].recovered.summary.split, 1);
  assert.equal(res.steps[0].baseline.structural, 0);
  assert.deepEqual(res.overall.structuralChanges, { recovered: 1, baseline: 0 });
});
