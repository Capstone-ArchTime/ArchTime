import './setup-env.mjs';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { GitHubLinkUseCase, GitHubLinkError } from '../src/application/use-cases/GitHubLinkUseCase.ts';
import { createGitHubRouter } from '../src/presentation/routes/github.routes.ts';
import { MongoUserRepository } from '../src/infrastructure/repositories/MongoUserRepository.ts';
import { JwtTokenService } from '../src/infrastructure/services/JwtTokenService.ts';
import { UserModel } from '../src/infrastructure/database/models/UserModel.ts';
import { errorHandler } from '../src/presentation/middlewares/errorHandler.ts';

// D9 — linking and unlinking GitHub from the profile (RF-19, UC-35): the same OAuth flow as GitHub sign-in, started
// by a signed-in account; unlinking is refused while GitHub is the only way to sign in.

function fakeUsers(rows) {
  return {
    rows,
    async findCredentials(id) { const u = rows[id]; return u ? { passwordHash: u.passwordHash ?? null, githubId: u.githubId ?? null } : null; },
    async findIdByGithubId(gh) { return Object.keys(rows).find(id => rows[id].githubId === gh) ?? null; },
    async setGithubId(id, gh) {
      const u = rows[id];
      if (gh && u.githubId) return false;
      if (gh && Object.values(rows).some(o => o.githubId === gh)) throw Object.assign(new Error('dup'), { code: 11000 });
      if (!gh && !u.githubId) return false;
      u.githubId = gh ?? undefined; return true;
    },
  };
}
const withPassword = '$2b$10$abcdefghijklmnopqrstuv';
const githubOnly = '!github-only:abc';

test('linking: sets the GitHub id, is idempotent for the same account, and is audited', async () => {
  const users = fakeUsers({ u1: { passwordHash: withPassword } }), audit = [];
  const uc = new GitHubLinkUseCase(users, async e => { audit.push(e); });
  assert.deepEqual(await uc.link('u1', { id: '42', name: 'octocat' }), { password: true, github: true });
  assert.equal(users.rows.u1.githubId, '42');
  assert.deepEqual(await uc.link('u1', { id: '42', name: 'octocat' }), { password: true, github: true });
  assert.deepEqual(audit.map(a => [a.action, a.userId, a.details.githubId]), [['GITHUB_LINK', 'u1', '42']]);
});

test('linking is refused for a GitHub account linked elsewhere, or when another one is already linked', async () => {
  const uc = new GitHubLinkUseCase(fakeUsers({ u1: { passwordHash: withPassword }, u2: { githubId: '42' }, u3: { githubId: '7' } }));
  await assert.rejects(uc.link('u1', { id: '42', name: 'x' }), e => e instanceof GitHubLinkError && e.problem === 'in_use' && e.statusCode === 409);
  await assert.rejects(uc.link('u3', { id: '99', name: 'x' }), e => e.problem === 'other_account');
  await assert.rejects(uc.link('nobody', { id: '99', name: 'x' }), e => e.statusCode === 404);
});

test('a race lost to another account on the unique index reads as "in use"', async () => {
  const users = fakeUsers({ u1: { passwordHash: withPassword } });
  users.findIdByGithubId = async () => null;
  users.rows.u9 = { githubId: '42' };
  await assert.rejects(new GitHubLinkUseCase(users).link('u1', { id: '42', name: 'x' }), e => e.problem === 'in_use');
});

test('unlinking: refused while GitHub is the only sign-in method, allowed once there is a password', async () => {
  const users = fakeUsers({ gh: { passwordHash: githubOnly, githubId: '42' }, both: { passwordHash: withPassword, githubId: '7' }, none: { passwordHash: withPassword } });
  const audit = [];
  const uc = new GitHubLinkUseCase(users, async e => { audit.push(e); });
  await assert.rejects(uc.unlink('gh'), e => e.problem === 'only_method' && /Set a password first/.test(e.message));
  assert.equal(users.rows.gh.githubId, '42');
  await assert.rejects(uc.unlink('none'), e => e.problem === 'not_linked');
  assert.deepEqual(await uc.unlink('both'), { password: true, github: false });
  assert.equal(users.rows.both.githubId, undefined);
  assert.deepEqual(audit.map(a => a.action), ['GITHUB_UNLINK']);
});

// ── The HTTP flow, on a real MongoDB (skipped when none is reachable) ────────

const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `archtime_test_ghlink_${randomUUID().slice(0, 8)}`;
let connected = false;
before(async () => {
  try { await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 1500 }); await UserModel.syncIndexes(); connected = true; } catch { connected = false; }
});
after(async () => { if (connected) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('the link flow: ticket for a signed-in account -> GitHub -> linked and back to the profile; unlink guarded', async t => {
  if (!connected) return t.skip('MongoDB is not reachable');
  const mia = await UserModel.create({ name: 'Mia', email: 'mia@x.test', passwordHash: withPassword, isVerified: true, role: 'developer-analyst', status: 'active' });
  const gina = await UserModel.create({ name: 'Gina', email: 'gina@x.test', passwordHash: githubOnly, githubId: '777', isVerified: true, role: 'developer-analyst', status: 'active' });
  const jwt = new JwtTokenService('test-jwt-secret', '1h', '7d');
  const bearer = user => ({ Authorization: `Bearer ${jwt.generateTokens(String(user._id), user.role, user.tokenVersion ?? 0).accessToken}` });
  let github = { id: '4242', email: 'mia@github.test', name: 'mia-gh' };
  const config = { githubClientId: 'id', githubClientSecret: 'secret', githubCallbackUrl: 'http://localhost/api/auth/github/callback', corsOrigin: 'http://localhost:5173' };
  const users = new MongoUserRepository();
  const app = express(); app.use(express.json());
  app.use('/api/auth/github', createGitHubRouter(config, { identify: async () => github }, { execute: async () => { throw new Error('sign-in must not run'); } }, users, jwt, new GitHubLinkUseCase(users)));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/github`;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  const linkOnce = async user => {
    const { data } = await (await request('/link', { method: 'POST', headers: bearer(user) })).json();
    const start = await request(`/?link=${data.ticket}`);
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    return { ticket: data.ticket, done: await request(`/callback?state=${state}&code=ok`, { headers: { cookie } }) };
  };
  try {
    assert.equal((await request('/link', { method: 'POST' })).status, 401, 'a ticket needs a signed-in account');
    const first = await linkOnce(mia);
    assert.equal(first.done.headers.get('location'), 'http://localhost:5173/profile#github=linked');
    assert.equal((await UserModel.findById(mia._id).lean()).githubId, '4242');
    assert.match((await request(`/?link=${first.ticket}`)).headers.get('location'), /\/profile#github_error=expired$/, 'a ticket works once');

    github = { id: '777', email: 'x', name: 'gina-gh' };
    const other = await UserModel.create({ name: 'Olga', email: 'olga@x.test', passwordHash: withPassword, isVerified: true, role: 'developer-analyst', status: 'active' });
    assert.match((await linkOnce(other)).done.headers.get('location'), /\/profile#github_error=in_use$/);

    const refused = await request('/link', { method: 'DELETE', headers: bearer(gina) });
    assert.equal(refused.status, 409);
    assert.match((await refused.json()).error.message, /only way you sign in/);
    const unlinked = await request('/link', { method: 'DELETE', headers: bearer(mia) });
    assert.deepEqual((await unlinked.json()).data.signInMethods, { password: true, github: false });
    assert.equal((await UserModel.findById(mia._id).lean()).githubId, undefined);
  } finally { await new Promise(r => server.close(r)); }
});
