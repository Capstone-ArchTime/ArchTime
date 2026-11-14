import test from 'node:test';
import assert from 'node:assert/strict';
import { githubLinkResult, startGitHubLink } from '../src/features/github-link.ts';
import { mockGlobal } from './mock-global.mjs';

test('the return from GitHub is read from the address hash', () => {
  assert.equal(githubLinkResult(''), null);
  assert.equal(githubLinkResult('#section'), null);
  assert.deepEqual(githubLinkResult('#github=linked'), { ok: true, text: 'GitHub is linked: you can now also sign in with GitHub.' });
  assert.deepEqual(githubLinkResult('#github_error=in_use'), { ok: false, text: 'That GitHub account is already linked to another ArchTime account.' });
  assert.equal(githubLinkResult('#github_error=whatever').ok, false, 'an unknown reason still reads as a failure');
});

test('linking asks for a one-time ticket with the session, then leaves for the API with it', async t => {
  const store = () => { const m = new Map([['accessToken', 'session'], ['refreshToken', 'r']]); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  mockGlobal(t, 'sessionStorage', store());
  mockGlobal(t, 'localStorage', store());
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => { sent = { url, method: options.method, auth: options.headers.Authorization }; return Response.json({ data: { ticket: 'one time/+' } }); });
  let went;
  await startGitHubLink(url => { went = url; });
  assert.deepEqual([sent.url.endsWith('/auth/github/link'), sent.method, sent.auth], [true, 'POST', 'Bearer session']);
  assert.match(went, /\/auth\/github\?link=one%20time%2F%2B$/);
});
