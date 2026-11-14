import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { agentContextFor, buildAgentsMd, hashAgentToken, newAgentToken, tokenDays, COMMIT_CONVENTION } from '../src/domain/agent/context.ts';
import { AgentContextUseCases, AgentTokenUseCases, MAX_ACTIVE_TOKENS } from '../src/application/use-cases/agent/AgentUseCases.ts';
import { MongoAgentTokenRepository, AgentTokenModel } from '../src/infrastructure/repositories/MongoAgentTokenRepository.ts';
import { AppError } from '../src/shared/errors/AppError.ts';

// D7 — agent context API (RF-09, UC-42 – UC-44, BR-30, BR-31): project tokens stored as a hash, expiring within 90 days
// and revocable; for one file, the component, allowed / forbidden dependencies, ADRs and commit convention, no code.

const workspace = () => ({
  revision: 7,
  diagram: {
    components: [
      { id: 'web', name: 'Web', kind: 'UI', description: 'The pages', pathPrefixes: ['FE/src'] },
      { id: 'billing', name: 'Billing', kind: 'Service', description: 'Invoices | payments', pathPrefixes: ['BE/src/billing'] },
      { id: 'orders', name: 'Orders', kind: 'Service', description: 'Order lifecycle', pathPrefixes: ['BE/src/orders'] },
      { id: 'db', name: 'Database', kind: 'Database', description: 'Persistence', pathPrefixes: ['BE/src/db'] },
      { id: 'legacy', name: 'Legacy', kind: 'Service', description: '', pathPrefixes: ['BE/src/billing/legacy'] },
    ],
    dependencies: [
      { id: 'e1', source: 'billing', target: 'db', label: 'SQL' },
      { id: 'e2', source: 'billing', target: 'orders', label: '' },
      { id: 'e3', source: 'web', target: 'billing', label: 'HTTPS' },
    ],
    revision: 7, confirmedAt: new Date('2026-11-10T00:00:00Z'), baselineCommit: 'abc1234def',
  },
  rules: [
    { id: 'r1', name: 'Billing never reads Orders', source: 'billing', target: 'Orders', constraint: 'forbidden', severity: 'error', rationale: 'Events only.', enabled: true },
    { id: 'r2', name: 'Billing writes through the database', source: 'Billing', target: 'db', constraint: 'required', severity: 'warning', rationale: '', enabled: true },
    { id: 'r3', name: 'Web never touches the database', source: 'web', target: 'db', constraint: 'forbidden', severity: 'error', rationale: 'Go through the API.', enabled: true },
    { id: 'r4', name: 'Switched off', source: 'billing', target: 'web', constraint: 'forbidden', severity: 'error', rationale: '', enabled: false },
  ],
  decisions: [
    { id: 'a1', number: 1, title: 'Invoices are immutable', status: 'Accepted', decision: 'Corrections are new invoices.', consequences: 'More rows.', componentIds: ['billing'] },
    { id: 'a2', number: 2, title: 'Old pricing', status: 'Deprecated', decision: 'x', consequences: '', componentIds: ['billing'] },
    { id: 'a3', number: 3, title: 'Card payments via a gateway', status: 'Proposed', decision: 'Use the gateway SDK.', consequences: '', componentIds: ['billing', 'web'] },
    { id: 'a4', number: 4, title: 'Orders own the cart', status: 'Accepted', decision: 'y', consequences: '', componentIds: ['orders'] },
  ],
});

test('the context names the file\'s component by the longest prefix, normalizing the path', () => {
  const ctx = agentContextFor('./BE\\src\\billing\\invoice.ts', workspace());
  assert.equal(ctx.file, 'BE/src/billing/invoice.ts');
  assert.deepEqual(ctx.component, { id: 'billing', name: 'Billing', kind: 'Service', description: 'Invoices | payments', pathPrefixes: ['BE/src/billing'] });
  assert.equal(agentContextFor('BE/src/billing/legacy/old.ts', workspace()).component.id, 'legacy');
  assert.deepEqual(ctx.diagram, { confirmedAt: '2026-11-10T00:00:00.000Z', baselineCommit: 'abc1234def', revision: 7 });
});

test('allowed: declared or required; forbidden: enabled rules, and a forbidden rule wins over a declared dependency', () => {
  const ctx = agentContextFor('BE/src/billing/invoice.ts', workspace());
  assert.deepEqual(ctx.allowedDependencies, [{ id: 'db', name: 'Database', kind: 'Database', reason: 'declared' }]);
  assert.deepEqual(ctx.forbiddenDependencies, [{ id: 'orders', name: 'Orders', kind: 'Service', rule: 'Billing never reads Orders', severity: 'error', rationale: 'Events only.' }]);
  const db = agentContextFor('BE/src/db/client.ts', workspace());
  assert.deepEqual(db.forbiddenCallers.map(c => [c.name, c.rule]), [['Web', 'Web never touches the database']]);
});

test('a required dependency the diagram does not declare is still allowed, with its rule', () => {
  const ws = workspace();
  ws.diagram.dependencies = ws.diagram.dependencies.filter(d => d.id !== 'e1');
  assert.deepEqual(agentContextFor('BE/src/billing/a.ts', ws).allowedDependencies, [{ id: 'db', name: 'Database', kind: 'Database', reason: 'required', rule: 'Billing writes through the database' }]);
});

test('design decisions about the component, newest first, deprecated ones left out; the commit convention comes along', () => {
  const ctx = agentContextFor('BE/src/billing/invoice.ts', workspace());
  assert.deepEqual(ctx.decisions.map(d => [d.number, d.status]), [[3, 'Proposed'], [1, 'Accepted']]);
  assert.equal(ctx.commitConvention, COMMIT_CONVENTION);
  assert.ok(ctx.guidance.some(g => g.includes('Arch-Change')));
});

test('a file no prefix covers gets no component and is told to ask; a path outside the repository is refused', () => {
  const ctx = agentContextFor('scripts/seed.ts', workspace());
  assert.equal(ctx.component, null);
  assert.deepEqual([ctx.allowedDependencies, ctx.forbiddenDependencies, ctx.decisions], [[], [], []]);
  assert.match(ctx.guidance[0], /Ask a maintainer/);
  for (const bad of ['../etc/passwd', '', 'C:/x', 42]) assert.equal(agentContextFor(bad, workspace()), null);
});

test('the context holds names, paths and decisions only: no field carries source code (BR-31)', () => {
  const ctx = agentContextFor('BE/src/billing/invoice.ts', workspace());
  const keys = new Set();
  JSON.stringify(ctx, (k, v) => { keys.add(k); return v; });
  for (const k of ['source', 'code', 'content', 'diff', 'body', 'text']) assert.ok(!keys.has(k), k);
});

test('AGENTS.md lists components with their paths, allowed dependencies, enabled rules, live decisions, the convention and the API', () => {
  const md = buildAgentsMd('Shop', workspace(), 'https://archtime.example/api/');
  assert.match(md, /^# AGENTS\.md — Shop/);
  assert.match(md, /confirmed 2026-11-10, revision 7, baseline commit abc1234/);
  assert.ok(md.includes('| Billing | Service | `BE/src/billing` | Invoices \\| payments |'), 'pipes escaped in table cells');
  assert.ok(md.includes('- Billing → Database (SQL)'));
  assert.ok(md.includes('**Forbidden** (error): Billing → Orders — Billing never reads Orders. Events only.'));
  assert.ok(!md.includes('Switched off'));
  assert.ok(md.includes('**ADR-1 Invoices are immutable** (Accepted; Billing)') && !md.includes('Old pricing'));
  assert.ok(md.includes('Arch-Change:'));
  assert.ok(md.includes('"https://archtime.example/api/agent/context?file=<path/in/repo>"'));
});

test('tokens: atk_ followed by 256 random bits; only the hash is kept, with a short prefix; 1 to 90 days, 30 by default', () => {
  const a = newAgentToken(), b = newAgentToken();
  assert.match(a.token, /^atk_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashAgentToken(a.token));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(a.prefix, a.token.slice(0, 10));
  assert.deepEqual([undefined, '', 1, 90, '45'].map(tokenDays), [30, 30, 1, 90, 45]);
  assert.deepEqual([0, 91, 1.5, 'x', -3].map(tokenDays), [null, null, null, null, null]);
});

// ── Use cases with an in-memory repository ───────────────────────────────────

function memoryTokens() {
  const rows = [];
  return {
    rows,
    async create(t) { const row = { ...t, id: `t${rows.length + 1}` }; rows.push(row); return { ...row }; },
    async listByProject(p) { return rows.filter(r => r.projectId === p).map(r => ({ ...r })); },
    async findByHash(h) { const r = rows.find(x => x.tokenHash === h); return r ? { ...r } : null; },
    async revoke(p, id, by, at) { const r = rows.find(x => x.id === id && x.projectId === p && !x.revokedAt); if (!r) return null; Object.assign(r, { revokedAt: at, revokedBy: by }); return { ...r }; },
    async touch(id, at) { const r = rows.find(x => x.id === id); if (r) r.lastUsedAt = at; },
    async countActive(p, now) { return rows.filter(r => r.projectId === p && !r.revokedAt && r.expiresAt > now).length; },
  };
}
const projects = { findById: async id => (['p1', 'p2'].includes(id) ? { id, name: id === 'p1' ? 'Shop' : 'Other' } : null) };

test('creating a token: shown once, never the hash afterwards, expiry within 90 days, audited', async () => {
  let now = new Date('2026-11-15T00:00:00Z');
  const repo = memoryTokens(), audit = [];
  const uc = new AgentTokenUseCases(repo, projects, async e => { audit.push(e); }, () => now);
  const { token, record } = await uc.create({ projectId: 'p1', userId: 'u1', name: ' Claude on CI ', expiresInDays: 90 });
  assert.match(token, /^atk_/);
  assert.equal(repo.rows[0].tokenHash, hashAgentToken(token));
  assert.ok(!('tokenHash' in record) && !JSON.stringify(record).includes(token));
  assert.deepEqual([record.name, record.status, record.expiresAt.toISOString()], ['Claude on CI', 'active', '2027-02-13T00:00:00.000Z']);
  assert.deepEqual(audit.map(a => [a.action, a.userId, a.targetId, a.details.prefix]), [['AGENT_TOKEN_CREATE', 'u1', 'p1', record.prefix]]);
  assert.ok(!JSON.stringify(audit).includes(token), 'the token never reaches the audit log');
  const listed = await uc.list('p1');
  assert.ok(!JSON.stringify(listed).includes(repo.rows[0].tokenHash));
  now = new Date('2027-03-01T00:00:00Z');
  assert.equal((await uc.list('p1'))[0].status, 'expired');
});

test('creating a token refuses a missing name, a bad expiry, an unknown project, and more than the active limit', async () => {
  const uc = new AgentTokenUseCases(memoryTokens(), projects);
  await assert.rejects(uc.create({ projectId: 'p1', userId: 'u', name: '  ' }), e => e.statusCode === 400);
  await assert.rejects(uc.create({ projectId: 'p1', userId: 'u', name: 'x', expiresInDays: 365 }), e => e.statusCode === 400 && /1 to 90 days/.test(e.message));
  await assert.rejects(uc.create({ projectId: 'nope', userId: 'u', name: 'x' }), e => e.statusCode === 404);
  for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) await uc.create({ projectId: 'p1', userId: 'u', name: `t${i}` });
  await assert.rejects(uc.create({ projectId: 'p1', userId: 'u', name: 'one more' }), e => e.statusCode === 409);
});

test('authenticate: only a known, unexpired, unrevoked token of an existing project, and it binds that project', async () => {
  let now = new Date('2026-11-15T00:00:00Z');
  const repo = memoryTokens();
  const uc = new AgentTokenUseCases(repo, projects, undefined, () => now);
  const { token, record } = await uc.create({ projectId: 'p1', userId: 'u', name: 'agent', expiresInDays: 1 });
  assert.deepEqual(await uc.authenticate(`Bearer ${token}`), { tokenId: record.id, projectId: 'p1' });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(repo.rows[0].lastUsedAt, now);
  for (const [header, pattern] of [[undefined, /Bearer atk_/], ['Bearer eyJhbGciOi.jwt.token', /Bearer atk_/], [`Bearer ${newAgentToken().token}`, /not known/], [token, /Bearer atk_/]]) {
    await assert.rejects(uc.authenticate(header), e => e instanceof AppError && e.statusCode === 401 && pattern.test(e.message), String(header));
  }
  now = new Date('2026-11-16T00:00:01Z');
  await assert.rejects(uc.authenticate(`Bearer ${token}`), e => e.statusCode === 401 && /expired/.test(e.message));
});

test('revoking takes effect at once, only in its own project, and is audited', async () => {
  const repo = memoryTokens(), audit = [];
  const uc = new AgentTokenUseCases(repo, projects, async e => { audit.push(e); });
  const { token, record } = await uc.create({ projectId: 'p1', userId: 'u', name: 'agent' });
  await assert.rejects(uc.revoke('p2', record.id, 'u2'), e => e.statusCode === 404);
  const revoked = await uc.revoke('p1', record.id, 'u2');
  assert.equal(revoked.status, 'revoked');
  await assert.rejects(uc.authenticate(`Bearer ${token}`), e => e.statusCode === 401 && /revoked/.test(e.message));
  await assert.rejects(uc.revoke('p1', record.id, 'u2'), e => e.statusCode === 404, 'not twice');
  assert.deepEqual(audit.map(a => a.action), ['AGENT_TOKEN_CREATE', 'AGENT_TOKEN_REVOKE']);
  // A token whose project was deleted stops working too.
  const gone = new AgentTokenUseCases(repo, { findById: async () => null });
  const other = await uc.create({ projectId: 'p1', userId: 'u', name: 'b' });
  await assert.rejects(gone.authenticate(`Bearer ${other.token}`), e => e.statusCode === 401 && /no longer exists/.test(e.message));
});

test('context and AGENTS.md need a confirmed diagram and a file inside the repository', async () => {
  const confirmed = workspace(), draft = { ...workspace(), diagram: { ...workspace().diagram, confirmedAt: null } };
  const uc = ws => new AgentContextUseCases({ findByProjectId: async () => ws }, projects, 'http://api');
  await assert.rejects(uc(draft).context('p1', 'BE/src/billing/a.ts'), e => e.statusCode === 409 && /not confirmed/.test(e.message));
  await assert.rejects(uc(draft).agentsMd('p1'), e => e.statusCode === 409);
  await assert.rejects(uc(confirmed).context('p1', undefined), e => e.statusCode === 400 && /\?file=/.test(e.message));
  await assert.rejects(uc(confirmed).context('p1', '../../etc/passwd'), e => e.statusCode === 400);
  assert.equal((await uc(confirmed).context('p1', 'BE/src/orders/cart.ts')).component.name, 'Orders');
  const md = await uc(confirmed).agentsMd('p1');
  assert.equal(md.filename, 'AGENTS.md');
  assert.match(md.content, /# AGENTS\.md — Shop/);
});

// ── Mongo repository (skipped without a local MongoDB) ───────────────────────

const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_agent_${randomUUID().slice(0, 8)}`;
let connected = false;
before(async () => {
  try { await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 }); await AgentTokenModel.syncIndexes(); connected = true; } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('the Mongo repository stores the hash only, finds by hash, revokes once and counts active tokens', async t => {
  if (!connected) return t.skip('MongoDB is not reachable');
  const repo = new MongoAgentTokenRepository();
  const now = new Date('2026-11-15T00:00:00Z');
  const { token, hash, prefix } = newAgentToken();
  const base = { projectId: 'p1', name: 'a', prefix, createdBy: 'u', createdAt: now, revokedAt: null, revokedBy: null, lastUsedAt: null };
  const saved = await repo.create({ ...base, tokenHash: hash, expiresAt: new Date('2026-12-15T00:00:00Z') });
  await repo.create({ ...base, tokenHash: newAgentToken().hash, expiresAt: new Date('2026-11-01T00:00:00Z') });
  const stored = await AgentTokenModel.findById(saved.id).lean();
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal((await repo.findByHash(hash)).id, saved.id);
  assert.equal(await repo.countActive('p1', now), 1);
  await assert.rejects(repo.create({ ...base, tokenHash: hash, expiresAt: now }), /duplicate key/);
  assert.equal(await repo.revoke('p2', saved.id, 'u', now), null);
  assert.equal(await repo.revoke('p1', 'not-an-id', 'u', now), null);
  assert.ok((await repo.revoke('p1', saved.id, 'u', now)).revokedAt);
  assert.equal(await repo.revoke('p1', saved.id, 'u', now), null);
  assert.equal(await repo.countActive('p1', now), 0);
});
