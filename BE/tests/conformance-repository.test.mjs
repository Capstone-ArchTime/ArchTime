import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoConformanceRepository, mongoConformanceSnapshots } from '../src/infrastructure/repositories/MongoConformanceRepository.ts';
import { ConformanceCheckModel, ConformanceFindingModel } from '../src/infrastructure/database/models/ConformanceModels.ts';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';

// Upsert by (project, snapshot, key) and what survives a re-check, on a real MongoDB (skipped when none is reachable).
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_conf_${randomUUID().slice(0, 8)}`;
let connected = false;
let unavailable = 'MongoDB is not reachable';

before(async () => {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 });
    await Promise.all([ConformanceFindingModel.syncIndexes(), ConformanceCheckModel.syncIndexes()]);
    connected = true;
  } catch (err) {
    unavailable = `MongoDB is not usable: ${err.message}`;
  }
});
after(async () => {
  if (connected) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const repo = new MongoConformanceRepository();
const day = n => new Date(Date.UTC(2026, 10, n));
const check = (snapshotId, hash, date, findings) => ({
  projectId: 'p1', snapshotId, snapshotHash: hash, commitDate: date, fingerprint: 'fp', checkedAt: date,
  counts: { findings, errors: findings, warnings: 0, unmappedFiles: 0, files: 2 }, unresolvedRules: [],
});
const finding = (key, files = ['a.ts']) => ({
  key, type: 'forbidden-dependency', ruleId: 'r1', ruleName: 'Rule', severity: 'error', source: 'x', target: 'y', sourceName: 'X', targetName: 'Y',
  imports: files.map(f => ({ from: f, to: 'b.ts' })), importCount: files.length, files,
});

test('a re-check upserts by key: no copies, decision and explanation kept, evidence updated', async t => {
  if (!connected) return t.skip(unavailable);
  await repo.recordCheck({ check: check('s1', 'aaaaaaa', day(2), 1), findings: [finding('k1')], inherited: new Map() });
  const [first] = await repo.findings('p1');
  await repo.setDecision('p1', first.id, { kind: 'fix', note: '', by: 'u1', at: day(3), inheritedFrom: null });
  await repo.setExplanation('p1', first.id, { text: 'why', model: 'm', at: day(3) });
  await repo.recordCheck({ check: check('s1', 'aaaaaaa', day(2), 1), findings: [finding('k1', ['a.ts', 'c.ts'])], inherited: new Map() });
  const all = await repo.findings('p1', { snapshotId: 's1' });
  assert.equal(all.length, 1);
  assert.equal(all[0].id, first.id);
  assert.deepEqual([all[0].decision.kind, all[0].explanation.text, all[0].files, all[0].notifiedAt], ['fix', 'why', ['a.ts', 'c.ts'], null]);
  assert.equal((await ConformanceCheckModel.countDocuments({ projectId: 'p1', snapshotId: 's1' })), 1);
});

test('what a re-check no longer finds: removed when open, kept as outdated when decided', async t => {
  if (!connected) return t.skip(unavailable);
  await repo.recordCheck({ check: check('s2', 'bbbbbbb', day(4), 2), findings: [finding('open'), finding('decided')], inherited: new Map() });
  const decided = (await repo.findings('p1', { snapshotId: 's2' })).find(f => f.key === 'decided');
  await repo.setDecision('p1', decided.id, { kind: 'dismiss', note: 'generated code', by: 'u1', at: day(5), inheritedFrom: null });
  await repo.recordCheck({ check: check('s2', 'bbbbbbb', day(4), 0), findings: [], inherited: new Map() });
  const left = await repo.findings('p1', { snapshotId: 's2' });
  assert.deepEqual(left.map(f => [f.key, f.outdated]), [['decided', true]]);
  assert.equal((await repo.checkOf('p1', 's2')).counts.findings, 0);
});

test('accept and dismiss decisions are carried from the latest earlier snapshot; new findings start with them', async t => {
  if (!connected) return t.skip(unavailable);
  const carried = await repo.carriedDecisions('p1', ['decided', 'k1', 'other'], day(10));
  assert.deepEqual([...carried.keys()], ['decided'], 'fix (k1) is not carried');
  assert.equal(carried.get('decided').snapshotHash, 'bbbbbbb');
  assert.equal((await repo.carriedDecisions('p1', ['decided'], day(4))).size, 0, 'only from snapshots committed before');
  await repo.recordCheck({ check: check('s3', 'ccccccc', day(10), 1), findings: [finding('decided')], inherited: new Map([['decided', { ...carried.get('decided'), inheritedFrom: 'bbbbbbb' }]]) });
  const [later] = await repo.findings('p1', { snapshotId: 's3' });
  assert.deepEqual([later.decision.kind, later.decision.inheritedFrom], ['dismiss', 'bbbbbbb']);
  assert.deepEqual((await repo.findings('p1', { status: 'open' })).map(f => f.key), []);
});

test('unknown or malformed finding ids are not found, and another project cannot reach a finding', async t => {
  if (!connected) return t.skip(unavailable);
  const [any] = await repo.findings('p1');
  assert.equal(await repo.findById('p1', 'not-an-id'), null);
  assert.equal(await repo.findById('p2', any.id), null);
  assert.equal(await repo.setDecision('p2', any.id, null), null);
});

test('the snapshots the check reads: still in the history, after the baseline, oldest first', async t => {
  if (!connected) return t.skip(unavailable);
  const base = { projectId: 'px', title: 't', author: 'a', nodes: [{ id: 'a.ts' }], edges: [] };
  await SnapshotModel.insertMany([
    { ...base, hash: '1111111', fullHash: '1111111'.padEnd(40, '0'), date: day(1) },
    { ...base, hash: '3333333', date: day(3) },
    { ...base, hash: '2222222', date: day(2) },
    { ...base, hash: '4444444', date: day(4), missingSince: day(5) },
  ]);
  assert.deepEqual(await mongoConformanceSnapshots.dateOf('px', '1111111'.padEnd(40, '0')), day(1));
  assert.equal(await mongoConformanceSnapshots.dateOf('px', '4444444'), null);
  const later = await mongoConformanceSnapshots.after('px', day(1));
  assert.deepEqual(later.map(s => s.hash), ['2222222', '3333333']);
  assert.deepEqual((await mongoConformanceSnapshots.graph(later[0].id)).nodes.map(n => n.id), ['a.ts']);
});

test('carryForward settles only open findings with the key in later commits', async t => {
  if (!connected) return t.skip(unavailable);
  await repo.recordCheck({ check: check('s4', 'ddddddd', day(12), 1), findings: [finding('fwd')], inherited: new Map() });
  await repo.recordCheck({ check: check('s5', 'eeeeeee', day(13), 1), findings: [finding('fwd')], inherited: new Map() });
  await repo.recordCheck({ check: check('s6', 'fffffff', day(14), 1), findings: [finding('fwd')], inherited: new Map() });
  const [s6] = await repo.findings('p1', { snapshotId: 's6' });
  await repo.setDecision('p1', s6.id, { kind: 'fix', note: '', by: 'u2', at: day(14), inheritedFrom: null });
  const changed = await repo.carryForward('p1', 'fwd', day(12), { kind: 'dismiss', note: 'n', by: 'u1', at: day(15), inheritedFrom: 'ddddddd' });
  assert.equal(changed, 1);
  const kinds = Object.fromEntries((await repo.findings('p1')).filter(f => f.key === 'fwd').map(f => [f.snapshotHash, f.decision?.kind ?? null]));
  assert.deepEqual(kinds, { ddddddd: null, eeeeeee: 'dismiss', fffffff: 'fix' });
});

test('claimUnnotified takes only open, undecided, current findings, and two claims at once never share one', async t => {
  if (!connected) return t.skip(unavailable);
  await repo.recordCheck({ check: { ...check('n1', '1010101', day(20), 3), projectId: 'pn' }, findings: [finding('a'), finding('b'), finding('c')], inherited: new Map() });
  const [, b] = await repo.findings('pn');
  await repo.setDecision('pn', b.id, { kind: 'fix', note: '', by: 'u', at: day(20), inheritedFrom: null });
  const [first, second] = await Promise.all([repo.claimUnnotified('pn', new Date(Date.UTC(2026, 10, 21, 0, 0, 0, 1))), repo.claimUnnotified('pn', new Date(Date.UTC(2026, 10, 21, 0, 0, 0, 2)))]);
  const keys = [...first, ...second].map(f => f.key).sort();
  assert.deepEqual(keys, ['a', 'c'], 'each open finding taken once, the decided one not at all');
  assert.equal((await repo.claimUnnotified('pn', day(22))).length, 0);
  const claimedAt = first.length ? first[0].notifiedAt : second[0].notifiedAt;
  await repo.releaseClaim('pn', claimedAt);
  assert.ok((await repo.claimUnnotified('pn', day(23))).length >= 1, 'released findings can be taken again');
});

test('unread counts distinct open problems found since the person last looked', async t => {
  if (!connected) return t.skip(unavailable);
  const p = 'pu';
  await repo.recordCheck({ check: { ...check('u1', '2020202', day(1), 2), projectId: p }, findings: [finding('x'), finding('y')], inherited: new Map() });
  await repo.recordCheck({ check: { ...check('u2', '3030303', day(2), 1), projectId: p }, findings: [finding('x')], inherited: new Map() });
  assert.equal((await repo.unreadCounts('me', [p])).get(p), 2, 'x in two commits is one problem');
  await repo.markSeen(p, 'me', new Date(Date.now() + 1000));
  assert.equal((await repo.unreadCounts('me', [p])).has(p), false);
  assert.equal((await repo.unreadCounts('someone-else', [p])).get(p), 2, 'seen is per person');
  await repo.markSeen(p, 'me', day(1));
  assert.equal((await repo.unreadCounts('me', [p])).has(p), false, 'an older seen time never moves it back');
});
