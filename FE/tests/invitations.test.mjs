import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
const { acceptInvitation, declineInvitation, InvitationError } = await import('../src/features/invitations.ts');
const { AuthContext } = await import('../src/auth/auth-context.ts');
const { default: AcceptInvitation } = await import('../src/pages/AcceptInvitation.tsx');

function serve(t, body, status = 200) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, method: options?.method }); return Response.json(body, { status }); });
  return calls;
}

test('accepting posts the token from the email link and returns the workspace and role', async t => {
  const calls = serve(t, { success: true, data: { success: true, projectId: 'p1', role: 'project-maintainer' } });
  assert.deepEqual(await acceptInvitation('abc/123'), { projectId: 'p1', role: 'project-maintainer' });
  assert.match(calls[0].url, /\/invitations\/abc%2F123\/accept$/);
  assert.equal(calls[0].method, 'POST');
});

test('declining posts to the decline endpoint', async t => {
  const calls = serve(t, { success: true, data: null });
  await declineInvitation('tok');
  assert.match(calls[0].url, /\/invitations\/tok\/decline$/);
});

test('an invited email without an account is told to register or sign in', async t => {
  serve(t, { success: false, error: { message: 'Please register or log in with the invited email address to accept this invitation.' } }, 400);
  const error = await acceptInvitation('tok').catch(e => e);
  assert.ok(error instanceof InvitationError);
  assert.equal(error.needsAccount, true);
  assert.match(error.message, /register or log in/);
});

test('used or cancelled invitations and empty tokens fail with a clear message', async t => {
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
  const html = render('/invitations/accept?token=tok');
  assert.match(html, /Accept invitation/);
  assert.match(html, /Decline/);
  assert.equal(calls.length, 0);
});

test('a link without a token explains itself instead of offering buttons', () => {
  const html = render('/invitations/accept');
  assert.match(html, /incomplete/);
  assert.doesNotMatch(html, /Accept invitation/);
});
