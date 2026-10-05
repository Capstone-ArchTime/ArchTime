import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// --- minimal in-memory stand-ins for the mongoose models the worker touches ---
let seq = 0;
function matches(doc, q = {}) {
  return Object.entries(q).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$in' in cond) return cond.$in.map(String).includes(String(v));
      if ('$nin' in cond) return !cond.$nin.map(String).includes(String(v));
      if ('$lt' in cond) return v < cond.$lt;
      if ('$gt' in cond) return v > cond.$gt;
    }
    return String(v) === String(cond);
  });
}
function collection(withDefaults = (d) => d) {
  const rows = [];
  const query = (result) => {
    const q = {
      select: () => q, populate: () => q, lean: () => q,
      sort: (s) => { const [[k, dir]] = Object.entries(s); result = [...result].sort((a, b) => (a[k] > b[k] ? 1 : -1) * dir); return q; },
      cursor: () => (async function* () { yield* result; })(),
      then: (res, rej) => Promise.resolve(Array.isArray(result) ? result : result).then(res, rej),
    };
    return q;
  };
  const one = (q) => { const query1 = query(q); const orig = query1.sort; query1.sort = (s) => { orig(s); return query1; }; return query1; };
  const make = (d) => withDefaults({ _id: `id${++seq}`, ...d });
  const withSave = (d) => Object.assign(d, { id: d._id, save: async () => d });
  const api = {
    rows,
    create: async (d) => { const x = withSave(make(d)); rows.push(x); return x; },
    insertMany: async (docs) => { docs.forEach((d) => rows.push(make(d))); return docs; },
    find: (q) => query(rows.filter((r) => matches(r, q))),
    findById: async (id) => rows.find((r) => r._id === String(id)) ?? null,
    findOne: (q) => {
      const found = rows.filter((r) => matches(r, q));
      const qq = query(found);
      const sortQ = qq.sort;
      let sorted = found;
      qq.sort = (s) => { sortQ(s); return qq; };
      const origThen = qq.then;
      qq.then = (res, rej) => origThen.call(qq, (list) => res(Array.isArray(list) ? (list[0] ?? null) : list), rej);
      return qq;
    },
    exists: async (q) => (rows.some((r) => matches(r, q)) ? { _id: 1 } : null),
    updateOne: async (q, u) => { const r = rows.find((x) => matches(x, q)); if (r) Object.assign(r, u.$set); },
    deleteMany: async (q) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], q)) rows.splice(i, 1); },
    countDocuments: async (q) => rows.filter((r) => matches(r, q)).length,
  };
  return api;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mining-svc-'));
process.chdir(tmp);
const src = (p) => pathToFileURL(path.resolve(import.meta.dirname, '../src', p)).href;
const { ProjectModel } = await import(src('infrastructure/database/models/ProjectModel.ts'));
const { MiningJobModel } = await import(src('infrastructure/database/models/MiningJobModel.ts'));
const { SnapshotModel } = await import(src('infrastructure/database/models/SnapshotModel.ts'));
const { EvidenceModel } = await import(src('infrastructure/database/models/EvidenceModel.ts'));
const { MiningService } = await import(src('infrastructure/services/MiningService.ts'));

const fakes = { project: collection(), job: collection(), snap: collection(), evid: collection() };
const patch = (model, fake) => Object.assign(model, fake);
patch(ProjectModel, { findById: fakes.project.findById, findOne: fakes.project.findOne, updateOne: fakes.project.updateOne });
patch(MiningJobModel, { create: fakes.job.create, findById: fakes.job.findById, updateOne: fakes.job.updateOne, exists: fakes.job.exists, find: fakes.job.find });
patch(SnapshotModel, { find: fakes.snap.find, findOne: fakes.snap.findOne, insertMany: fakes.snap.insertMany, updateOne: fakes.snap.updateOne, deleteMany: fakes.snap.deleteMany, countDocuments: fakes.snap.countDocuments });
patch(EvidenceModel, { insertMany: fakes.evid.insertMany, deleteMany: fakes.evid.deleteMany });

// --- a real git repo with 6 commits over 3 months; every commit adds an import edge ---
const repo = path.join(tmp, 'origin');
fs.mkdirSync(repo);
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x.io', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x.io' };
const git = (...a) => execFileSync('git', a, { cwd: repo, env, encoding: 'utf8' });
git('init', '-q', '-b', 'main');
const dates = ['2024-01-10', '2024-01-20', '2024-02-05', '2024-02-15', '2024-03-05', '2024-03-15'];
dates.forEach((d, i) => {
  fs.writeFileSync(path.join(repo, `m${i}.js`), i ? `import './m${i - 1}.js';\n` : 'export {};\n');
  git('add', '.');
  execFileSync('git', ['commit', '-q', '-m', `commit ${i}`, '--date', `${d}T12:00:00Z`], { cwd: repo, env: { ...env, GIT_COMMITTER_DATE: `${d}T12:00:00Z` } });
});

const project = await fakes.project.create({ name: 'demo', repoUrl: pathToFileURL(repo).href, visibility: 'public', userId: 'u1', status: 'PENDING' });
const settled = async (jobId) => {
  for (let i = 0; i < 300; i++) {
    const job = fakes.job.rows.find((j) => j._id === jobId);
    if (!['queued', 'running'].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
};

test('scan records history without analyzing any commit', async () => {
  const job = await settled(await MiningService.startScanJob(project._id, 'u1'));
  assert.equal(job.status, 'completed', job.error);
  assert.equal(project.history.totalCommits, 6);
  assert.deepEqual(project.history.monthly.map((m) => m.commits), [2, 2, 2]);
  assert.equal(fakes.snap.rows.length, 0);
});

test('a single job per project at a time', async () => {
  const id = await MiningService.startScanJob(project._id, 'u1');
  await assert.rejects(MiningService.startScanJob(project._id, 'u1'), /already queued or running/);
  await settled(id);
});

test('mining a date range analyzes only that range, in batches', async () => {
  const request = { mode: 'range', since: new Date('2024-02-01T00:00:00Z'), until: new Date('2024-02-28T23:59:59Z'), force: false };
  const estimate = await MiningService.estimate(project, request);
  assert.deepEqual([estimate.inRange, estimate.toMine], [2, 2]);
  const job = await settled(await MiningService.startMiningJob(project._id, 'u1', request));
  assert.equal(job.status, 'completed', job.error);
  assert.deepEqual([job.total, job.processed, job.batchCount, job.progress], [2, 2, 1, 100]);
  assert.equal(fakes.snap.rows.length, 2);
  assert.equal(project.status, 'PARTIAL');
  const [first, second] = [...fakes.snap.rows].sort((a, b) => a.date - b.date);
  assert.equal(first.depAdded, 0, 'no earlier mined snapshot, so there is no baseline to diff against');
  assert.equal(second.depAdded, 1);
});

test('continuing mines only what is left and finishes the project', async () => {
  const job = await settled(await MiningService.startMiningJob(project._id, 'u1'));
  assert.equal(job.status, 'completed', job.error);
  assert.equal(job.total, 4);
  assert.equal(fakes.snap.rows.length, 6);
  assert.equal(new Set(fakes.snap.rows.map((s) => s.fullHash)).size, 6);
  assert.equal(project.status, 'COMPLETED');
  const feb5 = fakes.snap.rows.find((s) => s.date.toISOString().startsWith('2024-02-05'));
  assert.equal(feb5.depAdded, 1, 'its baseline moved from nothing to the January snapshot once January was mined');
  const again = await settled(await MiningService.startMiningJob(project._id, 'u1'));
  assert.equal(again.total, 0);
  assert.equal(fakes.snap.rows.length, 6);
});

test('cancelling stops at a batch boundary and keeps finished batches', async () => {
  fakes.snap.rows.length = 0;
  fakes.evid.rows.length = 0;
  process.env.MINING_BATCH_SIZE = '2';
  const original = SnapshotModel.insertMany;
  let jobId;
  SnapshotModel.insertMany = async (docs, opts) => { // user clicks cancel right after the first batch is saved
    const result = await original(docs, opts);
    await MiningService.cancelJob(jobId, 'u1');
    return result;
  };
  try {
    jobId = await MiningService.startMiningJob(project._id, 'u1');
    const job = await settled(jobId);
    assert.equal(job.status, 'cancelled');
    assert.deepEqual([job.total, job.batchCount, fakes.snap.rows.length], [6, 3, 2]);
    assert.equal(project.status, 'PARTIAL');
  } finally {
    SnapshotModel.insertMany = original;
    delete process.env.MINING_BATCH_SIZE;
  }
  const resumed = await settled(await MiningService.startMiningJob(project._id, 'u1'));
  assert.deepEqual([resumed.status, resumed.total, fakes.snap.rows.length], ['completed', 4, 6]);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
