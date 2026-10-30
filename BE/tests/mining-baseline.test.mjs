import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const src = (p) => pathToFileURL(path.resolve(import.meta.dirname, '../src', p)).href;
const { firstParentBase } = await import(src('domain/mining/baseline.ts'));
const { GIT_LOG_FORMAT, parseCommitLog } = await import(src('domain/mining/miningPlan.ts'));

test('the base is the nearest mined commit on the first-parent line, walking past unmined ones', () => {
  // a <- b <- c <- m (merge of c and f) ; a <- f
  const parents = new Map([['a', []], ['b', ['a']], ['c', ['b']], ['f', ['a']], ['m', ['c', 'f']]]);
  const mined = new Set(['a', 'c', 'f']);
  const base = (h) => firstParentBase(h, parents, (x) => mined.has(x));
  assert.equal(base('m'), 'c', 'a merge is measured against the branch it was merged into');
  assert.equal(base('f'), 'a', 'a feature commit against its own parent, not a newer commit on main');
  assert.equal(base('c'), 'a', 'b was not mined, so c is measured against a');
  assert.equal(base('a'), null, 'a root commit has no base');
  assert.equal(firstParentBase('x', new Map([['x', ['y']], ['y', ['x']]]), () => false), null, 'a cycle ends instead of looping');
});

// --- in-memory stand-ins for the mongoose models the worker touches (as in mining-service.test.mjs) ---
let seq = 0;
function matches(doc, q = {}) {
  return Object.entries(q).every(([k, cond]) => {
    const v = doc[k];
    if (cond === null) return v === null || v === undefined;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$exists' in cond && (v !== undefined) !== cond.$exists) return false;
      if ('$ne' in cond) return cond.$ne === null ? v !== null && v !== undefined : String(v) !== String(cond.$ne);
      if ('$in' in cond) return cond.$in.map(String).includes(String(v));
      if ('$nin' in cond) return !cond.$nin.map(String).includes(String(v));
      if ('$lt' in cond) return v < cond.$lt;
      if ('$exists' in cond) return true;
    }
    return String(v) === String(cond);
  });
}
function collection() {
  const rows = [];
  const query = (result) => {
    const q = {
      select: () => q, populate: () => q, lean: () => q,
      sort: (s) => { const [[k, dir]] = Object.entries(s); result = [...result].sort((a, b) => (a[k] > b[k] ? 1 : -1) * dir); return q; },
      cursor: () => (async function* () { yield* result; })(),
      then: (res, rej) => Promise.resolve(result).then(res, rej),
    };
    return q;
  };
  const make = (d) => ({ _id: `id${++seq}`, ...d });
  return {
    rows,
    create: async (d) => { const x = Object.assign(make(d), { save: async () => x }); x.id = x._id; rows.push(x); return x; },
    insertMany: async (docs) => { docs.forEach((d) => rows.push(make(d))); return docs; },
    find: (q) => query(rows.filter((r) => matches(r, q))),
    findById: async (id) => rows.find((r) => r._id === String(id)) ?? null,
    findOne: (q) => {
      const qq = query(rows.filter((r) => matches(r, q)));
      const then = qq.then;
      qq.then = (res, rej) => then.call(qq, (list) => res(list[0] ?? null), rej);
      return qq;
    },
    exists: async (q) => (rows.some((r) => matches(r, q)) ? { _id: 1 } : null),
    updateOne: async (q, u) => { const r = rows.find((x) => matches(x, q)); if (r) Object.assign(r, u.$set); },
    updateMany: async (q, u) => { const hit = rows.filter((x) => matches(x, q)); hit.forEach((r) => Object.assign(r, u.$set)); return { modifiedCount: hit.length }; },
    deleteMany: async (q) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], q)) rows.splice(i, 1); },
    countDocuments: async (q) => rows.filter((r) => matches(r, q)).length,
  };
}

process.env.ARCHTIME_ALLOW_LOCAL_REPOS = 'true';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mining-base-'));
process.chdir(tmp);
const { ProjectModel } = await import(src('infrastructure/database/models/ProjectModel.ts'));
const { MiningJobModel } = await import(src('infrastructure/database/models/MiningJobModel.ts'));
const { SnapshotModel } = await import(src('infrastructure/database/models/SnapshotModel.ts'));
const { EvidenceModel } = await import(src('infrastructure/database/models/EvidenceModel.ts'));
const { MiningService } = await import(src('infrastructure/services/MiningService.ts'));
const fakes = { project: collection(), job: collection(), snap: collection(), evid: collection() };
Object.assign(ProjectModel, { findById: fakes.project.findById, findOne: fakes.project.findOne, updateOne: fakes.project.updateOne });
Object.assign(MiningJobModel, { create: fakes.job.create, findById: fakes.job.findById, updateOne: fakes.job.updateOne, exists: fakes.job.exists, find: fakes.job.find });
Object.assign(SnapshotModel, { find: fakes.snap.find, findOne: fakes.snap.findOne, insertMany: fakes.snap.insertMany, updateOne: fakes.snap.updateOne, updateMany: fakes.snap.updateMany, deleteMany: fakes.snap.deleteMany, countDocuments: fakes.snap.countDocuments });
Object.assign(EvidenceModel, { insertMany: fakes.evid.insertMany, deleteMany: fakes.evid.deleteMany });

// --- a repository with a feature branch, as in the case that showed the bug ---
// main:    c0 ── c1 ─────────── m2 ── merge
//                  \                  /
// feature:          f1 (10 new modules)
// f1 and m2 are a minute apart. Counted against "the previous snapshot in time", m2 lost f1's ten dependencies and the
// merge gained them back; counted on the first-parent line, m2 adds one dependency and the merge brings in ten.
const repo = path.join(tmp, 'origin');
fs.mkdirSync(repo);
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x.io', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x.io' };
const at = (when) => ({ ...env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
const git = (args, when) => execFileSync('git', args, { cwd: repo, env: when ? at(when) : env, encoding: 'utf8' }).trim();
const write = (name, body) => fs.writeFileSync(path.join(repo, name), body);
git(['init', '-q', '-b', 'main']);
write('core.js', 'export {};\n');
git(['add', '.']); git(['commit', '-q', '-m', 'c0'], '2026-10-07T10:00:00Z');
write('app.js', "import './core.js';\n");
git(['add', '.']); git(['commit', '-q', '-m', 'c1'], '2026-10-07T10:30:00Z');
git(['checkout', '-q', '-b', 'feature']);
for (let i = 0; i < 10; i++) write(`feature${i}.js`, "import './core.js';\n");
git(['add', '.']); git(['commit', '-q', '-m', 'f1: ten new modules'], '2026-10-07T11:01:00Z');
git(['checkout', '-q', 'main']);
write('util.js', "import './core.js';\n");
git(['add', '.']); git(['commit', '-q', '-m', 'm2: one util'], '2026-10-07T11:02:00Z');
git(['merge', '-q', '--no-ff', 'feature', '-m', 'merge feature'], '2026-10-07T11:03:00Z');
const hash = (rev) => git(['rev-parse', rev]);
const H = { c0: hash('main~3'), c1: hash('main~2'), f1: hash('feature'), m2: hash('main^1'), merge: hash('main') };

const project = await fakes.project.create({ name: 'branches', repoUrl: pathToFileURL(repo).href, visibility: 'public', userId: 'u1', status: 'PENDING' });
const settled = async (jobId) => {
  for (let i = 0; i < 400; i++) {
    const job = fakes.job.rows.find((j) => j._id === jobId);
    if (!['queued', 'running'].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
};
const snap = (h) => fakes.snap.rows.find((r) => r.fullHash === h || r.hash === h.substring(0, 7));
const counts = (h) => [snap(h).depAdded, snap(h).depRemoved];

test('git log lists the parents of every commit, first parent first', () => {
  const commits = parseCommitLog(git(['log', '--all', '--source', '--date-order', '--reverse', `--format=${GIT_LOG_FORMAT}`]));
  const merge = commits.find((c) => c.hash === H.merge);
  assert.deepEqual(merge.parents, [H.m2, H.f1]);
  assert.deepEqual(commits.find((c) => c.hash === H.c0).parents, []);
  assert.equal(merge.message, 'merge feature');
});

test('commits on two branches are each counted against their own line, not against each other', async () => {
  const job = await settled(await MiningService.startMiningJob(project._id, 'u1'));
  assert.equal(job.status, 'completed', job.error);
  assert.deepEqual(counts(H.c1), [1, 0]);
  assert.deepEqual(counts(H.f1), [10, 0], 'feature commit: its ten modules against c1');
  assert.deepEqual(counts(H.m2), [1, 0], 'main commit a minute later: one util, not ten dependencies removed');
  assert.deepEqual(counts(H.merge), [10, 0], 'the merge brings the feature in');
  assert.equal(snap(H.m2).baseHash, H.c1);
  assert.equal(snap(H.merge).baseHash, H.m2);
  assert.equal(snap(H.c0).baseHash, '');
  const evidence = fakes.evid.rows.find((e) => e.commit === H.m2.substring(0, 7));
  assert.match(evidence.summary, /1 dependencies added, 0 dependencies removed/);
});

test('a scan recounts snapshots counted under the old rule, and redoes their evidence', async () => {
  // Put back what the old rule produced for m2 and the merge, with no baseHash, and the evidence it wrote.
  Object.assign(snap(H.m2), { depAdded: 1, depRemoved: 10, archChanges: 1 }); delete snap(H.m2).baseHash;
  Object.assign(snap(H.merge), { depAdded: 10, depRemoved: 1, archChanges: 1 }); delete snap(H.merge).baseHash;
  fakes.evid.rows.length = 0;
  fakes.evid.rows.push({ _id: 'old', projectId: project._id, commit: H.m2.substring(0, 7), summary: 'Detected structural change: 1 dependencies added, 10 dependencies removed.' });

  const job = await settled(await MiningService.startScanJob(project._id, 'u1'));
  assert.equal(job.status, 'completed', job.error);
  assert.deepEqual(counts(H.m2), [1, 0]);
  assert.deepEqual(counts(H.merge), [10, 0]);
  assert.equal(snap(H.m2).baseHash, H.c1);
  const m2Evidence = fakes.evid.rows.filter((e) => e.commit === H.m2.substring(0, 7));
  assert.equal(m2Evidence.length, 1);
  assert.match(m2Evidence[0].summary, /1 dependencies added, 0 dependencies removed/);
  assert.equal(fakes.evid.rows.some((e) => /10 dependencies removed/.test(e.summary)), false, 'the wrong evidence is gone');
});

test('mining a gap later recounts the commits after it on the same line only', async () => {
  // Forget c1: f1 and m2 are then measured against c0. Mining c1 again must recount both, and leave the merge alone.
  const c1 = snap(H.c1);
  fakes.snap.rows.splice(fakes.snap.rows.indexOf(c1), 1);
  Object.assign(snap(H.m2), { depAdded: 2, depRemoved: 0, baseHash: H.c0 });
  Object.assign(snap(H.f1), { depAdded: 11, depRemoved: 0, baseHash: H.c0 });
  const mergeBefore = { ...snap(H.merge) };

  const job = await settled(await MiningService.startMiningJob(project._id, 'u1'));
  assert.equal(job.status, 'completed', job.error);
  assert.deepEqual(counts(H.c1), [1, 0]);
  assert.deepEqual(counts(H.f1), [10, 0]);
  assert.deepEqual(counts(H.m2), [1, 0]);
  assert.deepEqual([snap(H.merge).depAdded, snap(H.merge).baseHash], [mergeBefore.depAdded, mergeBefore.baseHash]);
});
