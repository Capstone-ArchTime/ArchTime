import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CheckConformanceUseCase, DecideFindingUseCase, ExplainFindingUseCase, ListConformanceUseCase, conformanceFingerprint, explainData,
} from '../src/application/use-cases/conformance/ConformanceUseCases.ts';
import { LlmError } from '../src/domain/architecture/llm/types.ts';
import { AppError } from '../src/shared/errors/AppError.ts';

// D5 — the full conformance check (RF-08, UC-40, UC-41): snapshots after the baseline are checked against the confirmed
// diagram, findings are kept per (snapshot, key), maintainers decide on them and can ask the model to explain one.

// ── In-memory stand-ins ──────────────────────────────────────────────────────

function memoryStore() {
  const rows = [];
  const checks = new Map();
  let next = 1;
  return {
    rows, checks,
    async recordCheck({ check, findings: found, inherited }) {
      const keys = new Set(found.map(f => f.key));
      for (const f of found) {
        const existing = rows.find(x => x.snapshotId === check.snapshotId && x.key === f.key);
        if (existing) Object.assign(existing, f, { outdated: false });
        else rows.push({ ...f, id: `f${next++}`, projectId: check.projectId, snapshotId: check.snapshotId, snapshotHash: check.snapshotHash, commitDate: check.commitDate, decision: inherited.get(f.key) ?? null, explanation: null, notifiedAt: null, outdated: false });
      }
      for (let i = rows.length - 1; i >= 0; i--) {
        const f = rows[i];
        if (f.snapshotId !== check.snapshotId || keys.has(f.key)) continue;
        if (f.decision) f.outdated = true; else rows.splice(i, 1);
      }
      checks.set(check.snapshotId, check);
    },
    async checksOf() { return [...checks.values()].sort((a, b) => b.commitDate - a.commitDate); },
    async checkOf(_p, snapshotId) { return checks.get(snapshotId) ?? null; },
    async carriedDecisions(_p, keys, before) {
      const out = new Map();
      for (const f of [...rows].sort((a, b) => b.commitDate - a.commitDate)) {
        if (keys.includes(f.key) && f.commitDate < before && ['accept', 'dismiss'].includes(f.decision?.kind) && !out.has(f.key)) out.set(f.key, { ...f.decision, snapshotHash: f.snapshotHash });
      }
      return out;
    },
    async findings(_p, q = {}) { return rows.filter(f => (!q.snapshotId || f.snapshotId === q.snapshotId) && (!q.status || (q.status === 'open') === !f.decision)); },
    async findById(_p, id) { return rows.find(f => f.id === id) ?? null; },
    async setDecision(_p, id, decision) { const f = rows.find(x => x.id === id); if (f) f.decision = decision; return f ?? null; },
    async setExplanation(_p, id, explanation) { const f = rows.find(x => x.id === id); if (f) f.explanation = explanation; return f ?? null; },
    async carryForward(_p, key, after, decision) {
      const later = rows.filter(f => f.key === key && f.commitDate > after && !f.decision);
      later.forEach(f => { f.decision = decision; });
      return later.length;
    },
  };
}

const day = n => new Date(Date.UTC(2026, 10, n));
// Commit 1 is the baseline; 2 adds a forbidden import domain -> db; 3 also has web -> domain (undeclared).
const graphs = {
  s1: { nodes: ['BE/src/domain/order.ts', 'BE/src/db/orders.ts'].map(id => ({ id })), edges: [] },
  s2: { nodes: ['BE/src/domain/order.ts', 'BE/src/db/orders.ts'].map(id => ({ id })), edges: [{ source: 'BE/src/domain/order.ts', target: 'BE/src/db/orders.ts' }] },
  s3: {
    nodes: ['BE/src/domain/order.ts', 'BE/src/db/orders.ts', 'FE/src/page.tsx'].map(id => ({ id })),
    edges: [{ source: 'BE/src/domain/order.ts', target: 'BE/src/db/orders.ts' }, { source: 'FE/src/page.tsx', target: 'BE/src/domain/order.ts' }],
  },
};
function snapshots(list = [{ id: 's1', hash: 'aaaaaaa', date: day(1) }, { id: 's2', hash: 'bbbbbbb', date: day(2) }, { id: 's3', hash: 'ccccccc', date: day(3) }]) {
  const reads = [];
  return {
    reads,
    async dateOf(_p, hash) { return list.find(s => s.hash === hash.slice(0, 7))?.date ?? null; },
    async after(_p, after) { return list.filter(s => !after || s.date > after); },
    async graph(id) { reads.push(id); return graphs[id] ?? null; },
  };
}
const workspace = (overrides = {}) => ({
  id: 'w', projectId: 'p1', revision: 3,
  diagram: {
    components: [
      { id: 'web', name: 'Web', kind: 'UI', description: 'The pages', pathPrefixes: ['FE/src'] },
      { id: 'domain', name: 'Domain', kind: 'Service', description: 'Business rules', pathPrefixes: ['BE/src/domain'] },
      { id: 'db', name: 'Database', kind: 'Database', description: 'Persistence', pathPrefixes: ['BE/src/db'] },
    ],
    dependencies: [{ id: 'e1', source: 'web', target: 'domain', label: '' }].filter(() => !overrides.noDeclared),
    revision: 3, confirmedAt: day(1), confirmedBy: 'u1', confirmedRevision: 3, baselineCommit: 'aaaaaaa',
    ...overrides.diagram,
  },
  rules: [{ id: 'r1', name: 'Domain stays pure', source: 'domain', target: 'db', constraint: 'forbidden', severity: 'error', rationale: 'Persistence is an adapter.', enabled: true }],
  decisions: [{ id: 'adr1', number: 1, title: 'Hexagonal core', status: 'Accepted', decision: 'The domain talks to ports only.', componentIds: ['domain'] }],
});
const workspaces = ws => ({ findByProjectId: async id => (id === 'p1' ? ws : null) });

// ── Check ────────────────────────────────────────────────────────────────────

test('only snapshots after the baseline are checked, and their findings kept with component names', async () => {
  const store = memoryStore(), snaps = snapshots();
  const summary = await new CheckConformanceUseCase(workspaces(workspace()), snaps, store).execute('p1');
  assert.deepEqual(snaps.reads, ['s2', 's3']);
  assert.deepEqual(summary.checked.map(c => [c.hash, c.findings]), [['bbbbbbb', 1], ['ccccccc', 1]]);
  assert.deepEqual(store.rows.map(f => [f.snapshotHash, f.key, f.sourceName, f.targetName, f.files, f.importCount]), [
    ['bbbbbbb', 'forbidden-dependency|r1|domain|db', 'Domain', 'Database', ['BE/src/domain/order.ts'], 1],
    ['ccccccc', 'forbidden-dependency|r1|domain|db', 'Domain', 'Database', ['BE/src/domain/order.ts'], 1],
  ]);
  assert.deepEqual(store.checks.get('s3').counts, { findings: 1, errors: 1, warnings: 0, unmappedFiles: 0, files: 3 });
});

test('a diagram confirmed before anything was mined has no baseline: every snapshot is checked', async () => {
  const snaps = snapshots();
  await new CheckConformanceUseCase(workspaces(workspace({ diagram: { baselineCommit: null } })), snaps, memoryStore()).execute('p1');
  assert.deepEqual(snaps.reads, ['s1', 's2', 's3']);
});

test('a snapshot already checked against the same diagram and rules is skipped unless forced; a changed rule re-checks it', async () => {
  const store = memoryStore(), snaps = snapshots();
  const ws = workspace();
  const uc = new CheckConformanceUseCase(workspaces(ws), snaps, store);
  await uc.execute('p1');
  const again = await uc.execute('p1');
  assert.deepEqual([again.checked.length, again.skipped], [0, 2]);
  assert.equal((await uc.execute('p1', { force: true })).checked.length, 2);
  ws.rules = [{ ...ws.rules[0], enabled: false }];
  const after = await uc.execute('p1');
  assert.equal(after.checked.length, 2);
  // Without the rule, domain -> db is just a dependency the diagram does not declare.
  assert.deepEqual(store.rows.map(f => f.key), ['undeclared-dependency||domain|db', 'undeclared-dependency||domain|db']);
});

test('without a confirmed diagram, or with a baseline that left the history, the check refuses with 409', async () => {
  const unconfirmed = workspace({ diagram: { confirmedAt: null } });
  await assert.rejects(new CheckConformanceUseCase(workspaces(unconfirmed), snapshots(), memoryStore()).execute('p1'), e => e instanceof AppError && e.statusCode === 409 && /Confirm the component diagram/.test(e.message));
  const lost = workspace({ diagram: { baselineCommit: 'fffffff' } });
  await assert.rejects(new CheckConformanceUseCase(workspaces(lost), snapshots(), memoryStore()).execute('p1'), e => e.statusCode === 409 && /fffffff/.test(e.message));
});

test('a re-check keeps decisions; what it no longer finds is removed, or marked outdated when it was decided', async () => {
  const store = memoryStore(), ws = workspace();
  const uc = new CheckConformanceUseCase(workspaces(ws), snapshots(), store);
  await uc.execute('p1');
  await new DecideFindingUseCase(store).execute({ projectId: 'p1', findingId: store.rows[0].id, decision: 'fix', userId: 'u1' });
  await uc.execute('p1', { force: true });
  assert.equal(store.rows[0].decision.kind, 'fix');
  ws.rules = [];
  ws.diagram.dependencies = [{ id: 'e1', source: 'web', target: 'domain', label: '' }, { id: 'e2', source: 'domain', target: 'db', label: '' }];
  await uc.execute('p1');
  assert.deepEqual(store.rows.map(f => [f.snapshotHash, f.outdated]), [['bbbbbbb', true]]);
});

test('accept and dismiss carry over to the same finding in later snapshots; fix does not', async () => {
  const store = memoryStore();
  const two = [{ id: 's1', hash: 'aaaaaaa', date: day(1) }, { id: 's2', hash: 'bbbbbbb', date: day(2) }];
  const ws = workspace();
  await new CheckConformanceUseCase(workspaces(ws), snapshots(two), store).execute('p1');
  await new DecideFindingUseCase(store).execute({ projectId: 'p1', findingId: store.rows[0].id, decision: 'accept', note: 'Reporting reads the tables directly, agreed in review.', userId: 'u1' });
  await new CheckConformanceUseCase(workspaces(ws), snapshots(), store).execute('p1');
  const later = store.rows.find(f => f.snapshotHash === 'ccccccc');
  assert.equal(later.decision.kind, 'accept');
  assert.equal(later.decision.inheritedFrom, 'bbbbbbb');
});

// ── Decide ───────────────────────────────────────────────────────────────────

test('deciding: fix needs no note, accept and dismiss do, unknown decisions are refused, reopen clears it', async () => {
  const store = memoryStore();
  await new CheckConformanceUseCase(workspaces(workspace()), snapshots(), store).execute('p1');
  const decide = new DecideFindingUseCase(store, () => day(9));
  const id = store.rows[0].id;
  const fixed = await decide.execute({ projectId: 'p1', findingId: id, decision: 'fix', userId: 'u2' });
  assert.deepEqual(fixed.decision, { kind: 'fix', note: '', by: 'u2', at: day(9), inheritedFrom: null });
  await assert.rejects(decide.execute({ projectId: 'p1', findingId: id, decision: 'dismiss', note: '  ', userId: 'u2' }), e => e.statusCode === 400 && /Say why/.test(e.message));
  await assert.rejects(decide.execute({ projectId: 'p1', findingId: id, decision: 'ignore', userId: 'u2' }), e => e.statusCode === 400);
  await assert.rejects(decide.execute({ projectId: 'p1', findingId: 'nope', decision: 'fix', userId: 'u2' }), e => e.statusCode === 404);
  assert.equal((await decide.execute({ projectId: 'p1', findingId: id, decision: 'reopen', userId: 'u2' })).decision, null);
});

test('the overview says whether the diagram is confirmed, which components have no paths and which checks are stale', async () => {
  const store = memoryStore(), ws = workspace();
  ws.diagram.components.push({ id: 'ext', name: 'Payments', kind: 'External', description: '', pathPrefixes: [] });
  await new CheckConformanceUseCase(workspaces(ws), snapshots(), store).execute('p1');
  const list = new ListConformanceUseCase(workspaces(ws), store);
  let overview = await list.overview('p1');
  assert.deepEqual([overview.confirmed, overview.baselineCommit, overview.componentsWithoutPaths, overview.checks.map(c => c.stale)], [true, 'aaaaaaa', ['Payments'], [false, false]]);
  ws.rules = [];
  overview = await list.overview('p1');
  assert.deepEqual(overview.checks.map(c => c.stale), [true, true]);
  assert.notEqual(conformanceFingerprint(ws), store.checks.get('s2').fingerprint);
});

// ── Explain ──────────────────────────────────────────────────────────────────

function fakeModel(answer) {
  const calls = [], runs = [];
  const model = async () => ({
    client: {
      info: { provider: 'fake', model: 'fake-1', host: 'local', external: false },
      async complete(messages, options) {
        calls.push(messages);
        if (answer instanceof Error) throw answer;
        options.onUsage?.({ inputTokens: 300, outputTokens: 80, estimated: false }, 12);
        return answer;
      },
    },
    record: async run => { runs.push(run); },
  });
  return { calls, runs, model };
}

test('an explanation is asked once, stored with the model name, logged as an AI run, and asked again only on refresh', async () => {
  const store = memoryStore(), ws = workspace();
  await new CheckConformanceUseCase(workspaces(ws), snapshots(), store).execute('p1');
  const ai = fakeModel('  The domain imports the database directly...  ');
  const explain = new ExplainFindingUseCase(store, workspaces(ws), ai.model, () => day(10));
  const id = store.rows[0].id;
  const first = await explain.execute({ projectId: 'p1', findingId: id, userId: 'u1' });
  assert.deepEqual(first.explanation, { text: 'The domain imports the database directly...', model: 'fake-1', at: day(10) });
  await explain.execute({ projectId: 'p1', findingId: id, userId: 'u1' });
  assert.equal(ai.calls.length, 1);
  await explain.execute({ projectId: 'p1', findingId: id, userId: 'u1', refresh: true });
  assert.equal(ai.calls.length, 2);
  assert.deepEqual(ai.runs.map(r => [r.status, r.usage.inputTokens]), [['accepted', 300], ['accepted', 300]]);
});

test('the model gets the rule, its rationale, linked decisions and file paths, never source code', async () => {
  const store = memoryStore(), ws = workspace();
  await new CheckConformanceUseCase(workspaces(ws), snapshots(), store).execute('p1');
  const data = explainData(store.rows[0], ws);
  for (const expected of ['forbidden-dependency', 'Domain stays pure', 'Persistence is an adapter.', 'ADR-1 "Hexagonal core"', 'BE/src/domain/order.ts imports BE/src/db/orders.ts']) assert.ok(data.includes(expected), expected);
  assert.ok(!/import\s*\{|from\s+['"]/.test(data), 'no code');
});

test('a failing model is logged as a failed run and reported as a service error; nothing is stored', async () => {
  const store = memoryStore(), ws = workspace();
  await new CheckConformanceUseCase(workspaces(ws), snapshots(), store).execute('p1');
  const ai = fakeModel(new LlmError('rate_limit', 'slow down'));
  await assert.rejects(new ExplainFindingUseCase(store, workspaces(ws), ai.model).execute({ projectId: 'p1', findingId: store.rows[0].id, userId: 'u1' }), e => e.statusCode === 429);
  assert.deepEqual(ai.runs.map(r => [r.status, r.errorKind]), [['failed', 'rate_limit']]);
  assert.equal(store.rows[0].explanation, null);
});

test('accepting a finding also settles the same open finding in later commits already checked; fix and decided ones are left alone', async () => {
  const store = memoryStore();
  await new CheckConformanceUseCase(workspaces(workspace()), snapshots(), store).execute('p1');
  const [older, later] = store.rows;
  assert.deepEqual([older.snapshotHash, later.snapshotHash], ['bbbbbbb', 'ccccccc']);
  const decide = new DecideFindingUseCase(store, () => day(9));
  await decide.execute({ projectId: 'p1', findingId: older.id, decision: 'fix', userId: 'u1' });
  assert.equal(later.decision, null, 'fix is about this commit only');
  await decide.execute({ projectId: 'p1', findingId: older.id, decision: 'accept', note: 'Temporary callback until the event bus lands.', userId: 'u1' });
  assert.deepEqual([later.decision.kind, later.decision.inheritedFrom], ['accept', 'bbbbbbb']);
  await decide.execute({ projectId: 'p1', findingId: later.id, decision: 'fix', userId: 'u2' });
  await decide.execute({ projectId: 'p1', findingId: older.id, decision: 'dismiss', note: 'Changed our mind.', userId: 'u1' });
  assert.equal(later.decision.kind, 'fix', 'a decision made on the later commit stays');
});
