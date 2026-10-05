import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createGitHubRouter } from '../src/presentation/routes/github.routes.ts';
import { GitHubIdentityService } from '../src/infrastructure/services/GitHubIdentityService.ts';
import { GitHubLoginUseCase } from '../src/application/use-cases/GitHubLoginUseCase.ts';
import { UserModel } from '../src/infrastructure/database/models/UserModel.ts';

test('OAuth binds state and one-use exchange to the initiating browser', async () => {
  let calls = 0;
  const config = { githubClientId: 'test', githubClientSecret: 'secret', githubCallbackUrl: 'http://localhost/api/auth/github/callback', corsOrigin: 'http://localhost:5173' };
  const app = express(); app.use(express.json());
  app.use('/api/auth/github', createGitHubRouter(config,
    { identify: async () => { calls++; return { id: '123', email: 'test@example.com', name: 'Test' }; } },
    { execute: async () => 'user1' },
    { findById: async () => ({ id: 'user1', role: 'developer-analyst', isVerified: true, tokenVersion: 3 }) },
    { generateTokens: (id, role, version) => ({ accessToken: `${id}:${role}:${version}`, refreshToken: 'refresh' }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/github`;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  try {
    const start = await request('/');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    assert.match(start.headers.get('set-cookie'), /HttpOnly/);
    const authorization = new URL(start.headers.get('location'));
    assert.equal(authorization.origin, 'https://github.com');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorization.searchParams.get('scope'), 'read:user user:email');
    const state = authorization.searchParams.get('state');
    const bad = await request(`/callback?state=${state}&code=fake`);
    assert.match(bad.headers.get('location'), /invalid_state/); assert.equal(calls, 0);
    const ok = await request(`/callback?state=${state}&code=good`, { headers: { cookie } });
    const code = new URLSearchParams(new URL(ok.headers.get('location')).hash.slice(1)).get('code');
    assert.ok(code); assert.equal(calls, 1);
    const replay = await request(`/callback?state=${state}&code=good`, { headers: { cookie } });
    assert.match(replay.headers.get('location'), /invalid_state/);
    const exchange = (extra = {}) => request('/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: config.corsOrigin, ...extra }, body: JSON.stringify({ code }) });
    assert.equal((await exchange()).status, 401);
    assert.equal((await exchange({ cookie, origin: 'https://evil.example' })).status, 403);
    const tokens = await exchange({ cookie }); assert.equal(tokens.status, 200);
    const tokensBody = await tokens.json();
    assert.equal(tokensBody.success, true);
    assert.equal(tokensBody.data.accessToken, 'user1:developer-analyst:3');
    assert.equal((await exchange({ cookie })).status, 401);
    const again = await request('/');
    const nextState = new URL(again.headers.get('location')).searchParams.get('state');
    const denied = await request(`/callback?state=${nextState}&error=access_denied`, { headers: { cookie: again.headers.get('set-cookie').split(';')[0] } });
    assert.match(denied.headers.get('location'), /cancelled/); assert.equal(calls, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('GitHub identity requires verified email and sends PKCE verifier', async () => {
  let payload;
  const responses = [ { access_token: 'private-token' }, { id: 42, login: 'octocat' }, [
    { email: 'unverified@example.com', primary: true, verified: false },
    { email: 'Verified@example.com', primary: false, verified: true },
  ]];
  const service = new GitHubIdentityService('id', 'secret', 'http://localhost/callback', async (_url, options) => {
    if (options.method === 'POST') payload = JSON.parse(options.body);
    return Response.json(responses.shift());
  });
  assert.deepEqual(await service.identify('code', 'verifier'), { id: '42', name: 'octocat', email: 'verified@example.com' });
  assert.equal(payload.code_verifier, 'verifier');
  const missing = new GitHubIdentityService('id', 'secret', 'http://localhost/callback', async url => Response.json(
    url.includes('access_token') ? { access_token: 'token' } : url.endsWith('/emails') ? [] : { id: 42, login: 'octocat' }));
  await assert.rejects(missing.identify('code', 'verifier'), /verified email/);
});

test('GitHub accounts keep their identity and never silently take over an existing email', async t => {
  const identity = { id: '42', name: 'Octocat', email: 'test@example.com' };
  const find = t.mock.method(UserModel, 'findOne', async () => ({ id: 'existing' }));
  const exists = t.mock.method(UserModel, 'exists', async () => ({ _id: 'email-owner' }));
  const create = t.mock.method(UserModel, 'create', async data => {
    assert.equal(data.role, 'developer-analyst');
    assert.equal(data.isVerified, true);
    assert.equal(data.githubId, '42');
    return { id: 'new-user' };
  });
  const login = new GitHubLoginUseCase();
  assert.equal(await login.execute(identity), 'existing');
  assert.equal(exists.mock.callCount(), 0);
  find.mock.mockImplementation(async () => null);
  await assert.rejects(login.execute(identity), /already uses this email/);
  assert.equal(create.mock.callCount(), 0);
  exists.mock.mockImplementation(async () => null);
  assert.equal(await login.execute(identity), 'new-user');
  assert.equal(create.mock.callCount(), 1);
});
