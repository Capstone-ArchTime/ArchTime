import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
const { acceptInvitation, declineInvitation, InvitationError } = await import('../src/features/invitations.ts');
const { AuthContext } = await import('../src/auth/auth-context.ts');
const { canAccess } = await import('../src/auth/permissions.ts');
const { default: AcceptInvitation } = await import('../src/pages/AcceptInvitation.tsx');

const { mockGlobal } = await import('./mock-global.mjs');

const storage = (initial = {}) => { const v = new Map(Object.entries(initial)); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, x), removeItem: k => v.delete(k) }; };
const signedIn = t => { mockGlobal(t, 'sessionStorage', storage({ accessToken: 'token', refreshToken: 'refresh' })); mockGlobal(t, 'localStorage', storage()); };

function serve(t, body, status = 200) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, method: options?.method, authorization: new Headers(options?.headers).get('Authorization') });
    return Response.json(body, { status });
  });
  return calls;
}

test('accepting posts the token from the email link with the session, and returns the workspace and role', async t => {
  signedIn(t);
  const calls = serve(t, { success: true, data: { success: true, projectId: 'p1', role: 'project-maintainer' } });
  assert.deepEqual(await acceptInvitation('abc/123'), { projectId: 'p1', role: 'project-maintainer' });
  assert.match(calls[0].url, /\/invitations\/abc%2F123\/accept$/);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].authorization, 'Bearer token');
});

test('declining posts to the decline endpoint, signed in or not', async t => {
  const calls = serve(t, { success: true, data: null });
  await declineInvitation('tok');
  assert.match(calls[0].url, /\/invitations\/tok\/decline$/);
  assert.equal(calls[0].authorization, null);
});

test('signed out, or signed in with another address, the person is told to sign in with the invited one', async t => {
  for (const [status, text, session] of [
    [401, 'Sign in with the invited email address to accept this invitation.', {}],
    [403, 'This invitation was sent to a different email address. Sign in with that address to accept it.', { accessToken: 'token', refreshToken: 'refresh' }],
  ]) {
    mockGlobal(t, 'sessionStorage', storage(session)); mockGlobal(t, 'localStorage', storage());
    serve(t, { success: false, error: { message: text } }, status);
    const error = await acceptInvitation('tok').catch(e => e);
    assert.ok(error instanceof InvitationError);
    assert.equal(error.needsAccount, true);
    assert.equal(error.message, text);
    t.mock.restoreAll();
  }
});

test('used or cancelled invitations and empty tokens fail with a clear message', async t => {
  signedIn(t);
  serve(t, {}, 404);
  const used = await acceptInvitation('tok').catch(e => e);
  assert.match(used.message, /not found/);
  assert.equal(used.needsAccount, false);
  await assert.rejects(acceptInvitation('  '), /incomplete/);
});

const render = (path, user = null) => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] },
  h(App, null, h(AuthContext.Provider, { value: { user, signOut() {} } }, h(AcceptInvitation)))));

test('opening the link only asks: nothing is accepted until the person chooses', t => {
  const calls = serve(t, {});
  const html = render('/invitations/accept?token=tok', { id: 'u1', email: 'a@b.c', role: 'developer-analyst' });
  assert.match(html, /Accept invitation/);
  assert.match(html, /Decline/);
  assert.equal(calls.length, 0);
});

test('signed out, the link offers sign-in first (and decline), not an accept that would fail', t => {
  const calls = serve(t, {});
  const html = render('/invitations/accept?token=tok');
  assert.match(html, /Sign in to accept/);
  assert.match(html, /Decline/);
  assert.doesNotMatch(html, /Accept invitation/);
  assert.equal(calls.length, 0);
});

test('sign-in can come back to the invitation link', () => {
  assert.equal(canAccess('developer-analyst', '/invitations/accept?token=tok'), true);
  assert.equal(canAccess('system-administrator', '/invitations/accept?token=tok'), true);
});

test('a link without a token explains itself instead of offering buttons', () => {
  const html = render('/invitations/accept');
  assert.match(html, /incomplete/);
  assert.doesNotMatch(html, /Accept invitation/);
});
