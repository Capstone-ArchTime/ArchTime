import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { SnapshotModel } from '../src/infrastructure/database/models/SnapshotModel.ts';
import { EvidenceModel } from '../src/infrastructure/database/models/EvidenceModel.ts';
import { ArchitectureMappingModel } from '../src/infrastructure/database/models/ArchitectureMappingModel.ts';
import { ProjectModel } from '../src/infrastructure/database/models/ProjectModel.ts';
import { ArchitectureUseCase } from '../src/application/use-cases/projects/ArchitectureUseCase.ts';
import { ArchitectureService } from '../src/infrastructure/services/ArchitectureService.ts';
import { ALGORITHM_VERSION, graphHash } from '../src/domain/architecture/buildView.ts';
import { UNMAPPED } from '../src/domain/architecture/bridge.ts';
import { ProjectController } from '../src/presentation/controllers/ProjectController.ts';
import { createProjectRouter } from '../src/presentation/routes/project.routes.ts';
import { createProjectRoleMiddleware } from '../src/presentation/middlewares/projectRole.ts';
import { errorHandler } from '../src/presentation/middlewares/errorHandler.ts';
import { JwtTokenService } from '../src/infrastructure/services/JwtTokenService.ts';
import { MongoUserRepository } from '../src/infrastructure/repositories/MongoUserRepository.ts';
import { MemberStatus, ProjectMemberRole } from '../src/domain/entities/ProjectMember.ts';
import { RepoVisibility } from '../src/domain/entities/Project.ts';

// The model statics are replaced by an in-memory store that understands just the queries the bridge makes (equality, $in, $lt,
// $lte, sort, limit, select, lean) and records what was loaded, so the tests can show what is read and what is never written.

const OWNER = 'owner';
const PROJECT = '64b000000000000000000002';
const OTHER = '64b000000000000000000003';
const id = (kind, n) => `64b0000000000000000000${kind}${n}`;
const S = n => id('a', n), E = n => id('e', n), M = n => id('c', n);

const A = 'src/ui/a.ts', B = 'src/ui/b.ts', X = 'src/api/x.ts', Y = 'src/api/y.ts', DB = 'src/db/m.ts', GONE = 'src/old/gone.ts', Z = 'src/misc/z.ts';
const graph = (files, edges) => ({
  nodes: files.map(f => ({ id: f, name: f.split('/').pop(), type: 'module' })),
  edges: edges.map(([source, target]) => ({ source, target, type: 'imports' })),
});
const graphs = {
  1: graph([A, B, X, DB, GONE], [[A, 'src/api/x'], [GONE, 'src/db/m']]),
  2: graph([A, B, X, Y, DB, GONE], [[A, 'src/api/x'], [GONE, 'src/db/m'], [B, 'src/api/y']]),
  3: graph([A, B, X, Y, DB, GONE], [[A, 'src/api/x'], [GONE, 'src/db/m'], [B, 'src/api/y'], [Y, 'src/db/m']]),
  4: graph([A, B, X, Y, DB], [[B, 'src/api/y'], [Y, 'src/db/m']]),
  5: graph([A, B, X, Y, DB, Z], [[B, 'src/api/y'], [Y, 'src/db/m'], [Z, 'src/db/m'], [A, 'src/ui/b']]),
};
const day = n => new Date(`2024-01-0${n}T10:00:00Z`);

const snapshots = [1, 2, 3, 4, 5].map(n => ({ _id: S(n), projectId: PROJECT, hash: `h${n}`, title: `commit ${n}`, date: day(n), ...graphs[n] }));
snapshots.push({ _id: id('b', 1), projectId: OTHER, hash: 'h3', title: 'other project', date: day(3), ...graphs[3] });
// Traps for the tenancy scoping: the other project reuses the short hash h4 but dated LATER (so a lookup by hash alone would prefer it),
// and has a snapshot dated just before h4 with a different graph (so a baseline lookup by date alone would prefer it).
const otherGraph = graph([A, B, X, Y, DB, Z], [[A, 'src/ui/b'], [Z, 'src/api/x']]);
snapshots.push({ _id: id('b', 2), projectId: OTHER, hash: 'h4', title: 'other h4', date: new Date('2024-01-04T11:00:00Z'), ...otherGraph });
snapshots.push({ _id: id('b', 3), projectId: OTHER, hash: 'ox', title: 'other before h4', date: new Date('2024-01-04T09:00:00Z'), ...otherGraph });

const evidences = [1, 2, 3, 4, 5].map(n => ({
  _id: E(n), projectId: PROJECT, changeTitle: `change ${n}`, type: 'DEPENDENCY CHANGE', repository: 'repo', commit: `h${n}`, files: 1, date: day(n),
  summary: 's', depsAdded: n, depsRemoved: 0, sourceFiles: ['f'], diffBefore: 'HUGE PATCH', diffAfter: '',
}));
evidences.push({ _id: id('e', 8), projectId: PROJECT, changeTitle: 'ghost', type: 'DEPENDENCY CHANGE', repository: 'repo', commit: 'zzzzzzz', files: 1, date: new Date('2023-12-31T10:00:00Z'), summary: 's', depsAdded: 1, depsRemoved: 0, sourceFiles: [], diffBefore: 'HUGE PATCH', diffAfter: '' });
evidences.push({ _id: id('e', 9), projectId: OTHER, changeTitle: 'someone else', type: 'DEPENDENCY CHANGE', repository: 'repo', commit: 'h3', files: 1, date: day(3), summary: 's', depsAdded: 1, depsRemoved: 0, sourceFiles: [], diffBefore: 'HUGE PATCH', diffAfter: '' });

const mapping = (n, components, hash = graphHash(graphs[n])) => ({
  _id: M(n), projectId: PROJECT, snapshotId: S(n), generator: 'cluster-only', algorithmVersion: ALGORITHM_VERSION, graphHash: hash,
  createdAt: new Date('2024-02-01'), updatedAt: new Date('2024-02-02'),
  components: components.map(([cid, ...memberIds]) => ({ id: cid, name: cid, role: 'service', label: 'INFERENCE', description: '', memberIds })),
});
const mappings = [
  mapping(3, [['ui', A, B], ['backend', X, Y, DB, GONE]]),
  mapping(5, [['ui', A, B], ['api', X, Y], ['db', DB]], 'an-older-graph'),
];

const log = { graphLoads: [], evidenceFinds: 0, evidenceLimits: [], heavyEvidenceFields: false, mappingWrites: 0 };

function matches(doc, filter) {
  return Object.entries(filter).every(([key, want]) => {
    const have = doc[key];
    if (want && typeof want === 'object' && !(want instanceof Date)) {
      if ('$in' in want) return want.$in.map(String).includes(String(have));
      if ('$lt' in want) return have < want.$lt;
      if ('$lte' in want) return have <= want.$lte;
    }
    return String(have) === String(want);
  });
}
function projected(doc, select) {
  if (!select) return { ...doc };
  const fields = select.split(/\s+/).filter(Boolean);
  if (fields.every(f => f.startsWith('-'))) { const out = { ...doc }; for (const f of fields) delete out[f.slice(1)]; return out; }
  const out = { _id: doc._id };
  for (const f of fields) if (f in doc) out[f] = doc[f];
  return out;
}
function query(rows, filter, many, onRows) {
  const q = { sortBy: null, max: Infinity, fields: '' };
  const api = {
    sort: spec => { q.sortBy = spec; return api; },
    limit: n => { q.max = n; if (many) onRows?.({ limit: n }); return api; },
    select: s => { q.fields = s; return api; },
    lean: async () => {
      let hit = rows.filter(r => matches(r, filter));
      if (q.sortBy) {
        const keys = Object.entries(q.sortBy);
        hit = [...hit].sort((a, b) => { for (const [k, dir] of keys) { const d = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; if (d) return d * dir; } return 0; });
      }
      const out = hit.slice(0, q.max).map(r => projected(r, q.fields));
      onRows?.({ out });
      return many ? out : out[0] ?? null;
    },
  };
  return api;
}

SnapshotModel.findOne = filter => query(snapshots, filter, false, ({ out }) => { for (const r of out ?? []) if ('nodes' in r) log.graphLoads.push(String(r._id)); });
SnapshotModel.find = filter => query(snapshots, filter, true, ({ out }) => { for (const r of out ?? []) if ('nodes' in r) log.graphLoads.push(String(r._id)); });
const watchEvidence = ({ limit, out }) => {
  if (limit !== undefined) log.evidenceLimits.push(limit);
  if (out?.some(r => 'diffBefore' in r)) log.heavyEvidenceFields = true;
};
EvidenceModel.findOne = filter => query(evidences, filter, false, watchEvidence);
EvidenceModel.find = filter => { log.evidenceFinds++; return query(evidences, filter, true, watchEvidence); };
ArchitectureMappingModel.findOne = filter => query(mappings, filter, false);
for (const name of ['findOneAndUpdate', 'create', 'updateOne', 'insertMany']) ArchitectureMappingModel[name] = () => { log.mappingWrites++; throw new Error('the bridge must never write a mapping'); };
ProjectModel.findOne = async filter => ([PROJECT, OTHER].includes(String(filter._id)) ? { _id: filter._id } : null);

const reset = () => { log.graphLoads = []; log.evidenceFinds = 0; log.evidenceLimits = []; };
const useCase = new ArchitectureUseCase();
const impact = (query = {}) => useCase.commitImpacts(PROJECT, OWNER, { snapshotId: S(5), ...query });
const evidenceImpact = evidenceId => useCase.evidenceImpact(PROJECT, OWNER, evidenceId);

// ---- one commit, onto the grouping of its own snapshot -------------------------------------------------------------------

test('a commit is projected onto the grouping stored for its own snapshot, against the latest earlier snapshot', async () => {
  const out = await evidenceImpact(E(3));
  assert.equal(out.label, 'INFERENCE');
  assert.match(out.note, /computed grouping/);
  assert.match(out.note, /comparing two mined snapshots/);
  assert.equal(out.grouped, true);
  assert.deepEqual(out.evidence, { id: E(3), commit: 'h3', title: 'change 3', date: day(3), type: 'DEPENDENCY CHANGE', depsAdded: 3, depsRemoved: 0 });
  assert.equal(out.snapshot.id, S(3));
  assert.equal(out.baseline.id, S(2), 'the snapshot dated just before, as MiningService picks it');
  assert.equal(out.hasBaseline, true);
  assert.deepEqual(out.fileChanges, { pairsAdded: 1, pairsRemoved: 0, filesAdded: 0, filesRemoved: 0 });
  // In this snapshot's grouping api and db are one component, so the new dependency is internal to it.
  assert.deepEqual(out.componentEdges.map(e => [e.id, e.kind, e.added.totalFilePairs]), [['backend', 'internal', 1]]);
  assert.deepEqual(out.componentEdges[0].added.filePairs, [{ source: Y, target: DB }]);
  assert.deepEqual(out.mapping, { generator: 'cluster-only', createdAt: new Date('2024-02-02'), stale: false });
});

test('a mapping computed from an older graph is flagged stale', async () => {
  const out = await evidenceImpact(E(5));
  assert.equal(out.grouped, true);
  assert.equal(out.mapping.stale, true);
  assert.deepEqual(out.componentEdges.map(e => [e.id, e.kind]), [['ui', 'internal'], [`${UNMAPPED}->db`, 'unmapped']]);
  assert.deepEqual(out.unmappedFiles, { total: 1, files: [Z] });
});

test('a snapshot with no grouping answers grouped:false with the raw counts, and never creates one', async () => {
  log.mappingWrites = 0;
  const out = await evidenceImpact(E(2));
  assert.equal(out.grouped, false);
  assert.equal(out.reason, 'This commit has not been grouped into components yet. Open it in the Architecture Map and group its files.');
  assert.equal(out.label, 'INFERENCE');
  assert.deepEqual(out.fileChanges, { pairsAdded: 1, pairsRemoved: 0, filesAdded: 1, filesRemoved: 0 });
  assert.equal('componentEdges' in out, false);
  const removal = await evidenceImpact(E(4));
  assert.deepEqual(removal.fileChanges, { pairsAdded: 0, pairsRemoved: 2, filesAdded: 0, filesRemoved: 1 });
  assert.equal(log.mappingWrites, 0);
  assert.equal(mappings.length, 2);
});

test('the first mined commit has no baseline', async () => {
  const out = await evidenceImpact(E(1));
  assert.equal(out.baseline, null);
  assert.equal(out.hasBaseline, false);
  assert.deepEqual(out.fileChanges, { pairsAdded: 0, pairsRemoved: 0, filesAdded: 0, filesRemoved: 0 });
});

test('the evidence patch and file list are never loaded', async () => {
  log.heavyEvidenceFields = false;
  await evidenceImpact(E(3));
  await impact();
  assert.equal(log.heavyEvidenceFields, false);
});

test('missing or foreign evidence and snapshots are 404, bad ids are 400', async () => {
  await assert.rejects(evidenceImpact(id('e', 7)), err => err.statusCode === 404 && /Evidence not found/.test(err.message));
  await assert.rejects(evidenceImpact(id('e', 8)), err => err.statusCode === 404 && /snapshot of this commit/.test(err.message), 'evidence whose commit was never mined');
  await assert.rejects(evidenceImpact(id('e', 9)), err => err.statusCode === 404, "evidence of the other project, asked through this project");
  await assert.rejects(useCase.evidenceImpact(OTHER, OWNER, E(3)), err => err.statusCode === 404, 'this project\'s evidence, asked through the other project');
  await assert.rejects(evidenceImpact('nope'), err => err.statusCode === 400);
  await assert.rejects(evidenceImpact(undefined), err => err.statusCode === 400);
  await assert.rejects(useCase.evidenceImpact('64b0000000000000000000aa', OWNER, E(3)), /Workspace not found/);
});

test("another project's snapshot with the same hash is not used", async () => {
  // Evidence e9 belongs to the other project and names commit h3; that project has a snapshot h3 but no grouping and a different history.
  const out = await useCase.evidenceImpact(OTHER, OWNER, id('e', 9));
  assert.equal(out.snapshot.id, id('b', 1));
  assert.equal(out.baseline, null, "the other project has no earlier snapshot, and this project's are not borrowed");
  assert.equal(out.grouped, false);
});

// ---- the commits that changed the components of one snapshot -------------------------------------------------------------

test('commits come newest first, projected onto the viewed snapshot\'s own groups', async () => {
  const out = await impact();
  assert.equal(out.label, 'INFERENCE');
  assert.match(out.note, /computed grouping/);
  assert.equal(out.grouped, true);
  assert.equal(out.snapshot.id, S(5));
  assert.equal(out.limit, 20);
  assert.equal(out.skipped, 1, 'the evidence whose commit has no snapshot is counted, not listed');
  assert.deepEqual(out.commits.map(c => [c.commit, c.title, c.evidenceId]), [['h5', 'change 5', E(5)], ['h4', 'change 4', E(4)], ['h3', 'change 3', E(3)], ['h2', 'change 2', E(2)], ['h1', 'change 1', E(1)]]);
  assert.deepEqual(out.commits.map(c => c.date), [5, 4, 3, 2, 1].map(day));
  const by = Object.fromEntries(out.commits.map(c => [c.commit, c]));
  // h3 added y -> m: api -> db in the viewed grouping (the grouping stored for h3 itself puts both in one component).
  assert.deepEqual(by.h3.componentEdges, [{ id: 'api->db', kind: 'cross', source: 'api', target: 'db', added: 1, removed: 0 }]);
  assert.deepEqual(by.h3.components, ['api', 'db']);
  assert.equal(by.h3.unmappedCount, 0);
  // h2 added b -> y and the file y.
  assert.deepEqual(by.h2.componentEdges.map(e => e.id), ['ui->api']);
  assert.deepEqual(by.h2.components, ['api', 'ui']);
  // h4 removed a -> x and the file gone.ts that no longer exists in the viewed grouping: reported as unmapped, not dropped.
  assert.deepEqual(by.h4.componentEdges.map(e => [e.id, e.kind, e.removed]), [['ui->api', 'cross', 1], [`${UNMAPPED}->db`, 'unmapped', 1]]);
  assert.equal(by.h4.unmappedCount, 1);
  // h5 added z (unowned) and a -> b.
  assert.deepEqual(by.h5.componentEdges.map(e => [e.id, e.kind]), [['ui', 'internal'], [`${UNMAPPED}->db`, 'unmapped']]);
  assert.equal(by.h5.unmappedCount, 1);
  // h1 is the first snapshot: nothing to compare with.
  assert.deepEqual(by.h1, { commit: 'h1', title: 'change 1', date: day(1), evidenceId: E(1), comparable: false, components: [], componentEdges: [], unmappedCount: 0 });
  assert.equal(by.h5.comparable, true);
});

test('the other project\'s snapshots (same hash dated later, or an earlier date) never leak into the list', async () => {
  const out = await impact();
  const by = Object.fromEntries(out.commits.map(c => [c.commit, c]));
  // Same results as in the first test: h4 and h5 are computed from this project's graphs only.
  assert.deepEqual(by.h4.componentEdges.map(e => [e.id, e.kind, e.removed]), [['ui->api', 'cross', 1], [`${UNMAPPED}->db`, 'unmapped', 1]]);
  assert.deepEqual(by.h5.componentEdges.map(e => [e.id, e.kind]), [['ui', 'internal'], [`${UNMAPPED}->db`, 'unmapped']]);
  assert.equal(by.h4.comparable, true);
  reset();
  await impact();
  assert.ok(!log.graphLoads.some(l => String(l).startsWith('64b0000000000000000000b')), 'no snapshot of the other project is loaded');
});

test('viewing an older snapshot uses its own grouping and only commits up to it', async () => {
  const out = await impact({ snapshotId: S(3) });
  assert.deepEqual(out.commits.map(c => c.commit), ['h3', 'h2', 'h1']);
  const by = Object.fromEntries(out.commits.map(c => [c.commit, c]));
  assert.deepEqual(by.h3.componentEdges.map(e => [e.id, e.kind]), [['backend', 'internal']]);
  assert.deepEqual(by.h2.componentEdges.map(e => e.id), ['ui->backend']);
});

test('the limit is clamped to 1..50 and defaults to 20', async () => {
  reset();
  assert.deepEqual((await impact({ limit: '2' })).commits.map(c => c.commit), ['h5', 'h4']);
  assert.equal((await impact({ limit: 0 })).limit, 1);
  assert.equal((await impact({ limit: -5 })).commits.length, 1);
  assert.equal((await impact({ limit: 999 })).limit, 50);
  assert.equal((await impact({ limit: 'abc' })).limit, 20);
  assert.equal((await impact({ limit: 7.5 })).limit, 20);
  assert.equal((await impact({})).limit, 20);
  assert.equal((await impact({ limit: '' })).limit, 20, 'an empty value is absent, not 0');
  assert.equal((await impact({ limit: '  ' })).limit, 20);
  assert.deepEqual(log.evidenceLimits, [2, 1, 1, 50, 20, 20, 20, 20, 20], 'the database is asked for no more than the clamped limit');
});

test('work is bounded: neighbouring commits share a loaded graph and nothing else is loaded', async () => {
  reset();
  await impact();
  assert.deepEqual(log.graphLoads, [S(5), S(4), S(3), S(2), S(1)], 'five commits cost five graph loads, not ten');
  reset();
  await impact({ limit: 1 });
  assert.deepEqual(log.graphLoads, [S(5), S(4)]);
});

test('a snapshot with no grouping returns grouped:false and does no work', async () => {
  reset();
  log.mappingWrites = 0;
  const out = await impact({ snapshotId: S(4) });
  assert.equal(out.grouped, false);
  assert.equal(out.label, 'INFERENCE');
  assert.equal(out.reason, 'This snapshot has not been grouped into components yet. Open it in the Architecture Map and group its files.');
  assert.deepEqual(out.commits, []);
  assert.equal(log.evidenceFinds, 0);
  assert.deepEqual(log.graphLoads, []);
  assert.equal(log.mappingWrites, 0);
});

test('the latest snapshot is used when none is named; other projects\' snapshots and bad ids are rejected', async () => {
  assert.equal((await useCase.commitImpacts(PROJECT, OWNER, {})).snapshot.id, S(5));
  await assert.rejects(impact({ snapshotId: id('b', 1) }), err => err.statusCode === 404, 'a snapshot of the other project');
  await assert.rejects(impact({ snapshotId: id('a', 9) }), err => err.statusCode === 404);
  await assert.rejects(impact({ snapshotId: 'nope' }), err => err.statusCode === 400);
  await assert.rejects(useCase.commitImpacts('64b0000000000000000000aa', OWNER, {}), /Workspace not found/);
  await assert.rejects(ArchitectureService.commitImpacts('64b0000000000000000000ab'), /no mined snapshots/);
});

// ---- through the real routes and project guards --------------------------------------------------------------------------

const projects = { [PROJECT]: { id: PROJECT, userId: OWNER, name: 'Shop', visibility: RepoVisibility.PRIVATE }, [OTHER]: { id: OTHER, userId: 'someone', name: 'Else', visibility: RepoVisibility.PRIVATE } };
const memberships = [{ projectId: PROJECT, userId: 'reader', role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE }];

async function serve(t) {
  const users = new Map(['owner', 'reader', 'outsider'].map(uid => [uid, { id: uid, role: 'developer-analyst', tokenVersion: 0, status: 'active', isVerified: true }]));
  t.mock.method(MongoUserRepository.prototype, 'findById', async uid => users.get(uid) ?? null);
  const jwt = new JwtTokenService('test-jwt-secret', '15m', '7d');
  const role = createProjectRoleMiddleware(
    { findById: async pid => projects[pid] ?? null },
    { findByProjectAndUserId: async (pid, uid) => memberships.find(m => m.projectId === pid && m.userId === uid) ?? null },
  );
  const controller = new ProjectController(null, null, null, null, null, null, null, null, undefined);
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectRouter(controller, jwt, undefined, role));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/projects`;
  return async (as, path) => {
    const response = await fetch(base + path, { headers: as ? { Authorization: `Bearer ${jwt.generateAccessToken(as, 'developer-analyst', 0)}` } : {} });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
}

test('over HTTP both endpoints need a signed-in reader of the project', async t => {
  const call = await serve(t);
  const paths = [`/${PROJECT}/evidences/${E(3)}/impact`, `/${PROJECT}/architecture/impact?snapshotId=${S(5)}`];
  for (const path of paths) {
    assert.equal((await call(undefined, path)).status, 401, `${path} without a token`);
    assert.equal((await call('outsider', path)).status, 403, `${path} for someone with no access to the private project`);
  }
  for (const who of ['owner', 'reader']) {
    const evidence = await call(who, paths[0]);
    assert.equal(evidence.status, 200, `${who} reads the evidence impact`);
    assert.equal(evidence.body.success, true);
    assert.equal(evidence.body.data.label, 'INFERENCE');
    assert.equal(evidence.body.data.grouped, true);
    const list = await call(who, paths[1]);
    assert.equal(list.status, 200, `${who} reads the component impact`);
    assert.equal(list.body.data.label, 'INFERENCE');
    assert.deepEqual(list.body.data.commits.map(c => c.commit), ['h5', 'h4', 'h3', 'h2', 'h1']);
  }
});

test('over HTTP the usual errors apply: unknown project 404, foreign evidence 404, malformed ids 400, clamped limit', async t => {
  const call = await serve(t);
  assert.equal((await call('owner', `/64b0000000000000000000aa/architecture/impact`)).status, 404);
  assert.equal((await call('owner', `/${PROJECT}/evidences/${id('e', 9)}/impact`)).status, 404, 'evidence of another project');
  assert.equal((await call('owner', `/${PROJECT}/evidences/${id('e', 7)}/impact`)).status, 404);
  assert.equal((await call('owner', `/${PROJECT}/evidences/not-an-id/impact`)).status, 400);
  assert.equal((await call('owner', `/${PROJECT}/architecture/impact?snapshotId=not-an-id`)).status, 400);
  const clamped = await call('owner', `/${PROJECT}/architecture/impact?snapshotId=${S(5)}&limit=500`);
  assert.equal(clamped.body.data.limit, 50);
  const ungrouped = await call('owner', `/${PROJECT}/evidences/${E(2)}/impact`);
  assert.equal(ungrouped.status, 200);
  assert.equal(ungrouped.body.data.grouped, false);
});

test('the bridge never wrote anything', () => {
  assert.equal(log.mappingWrites, 0);
  assert.equal(mappings.length, 2);
});
