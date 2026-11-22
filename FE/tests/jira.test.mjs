import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJiraConnection, removeJiraConnection, saveJiraConnection, siteLabel, syncJira } from '../src/features/jira.ts';
import { mockGlobal } from './mock-global.mjs';

// F-13: the page connects a workspace to Jira Cloud and syncs from it. The token goes to the server once and is never
// read back; leaving it empty keeps the stored one.

function server(t, reply) {
  mockGlobal(t, 'sessionStorage', { getItem: k => (k === 'accessToken' ? 'token' : null), setItem() {}, removeItem() {} });
  mockGlobal(t, 'localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    asked.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    return Response.json(typeof reply === 'function' ? reply(asked.at(-1)) : reply);
  });
  return asked;
}

const connection = { site: 'https://archtime.atlassian.net', email: 'lead@example.com', jql: 'project = SCRUM', tokenLast4: 'abcd', lastSyncAt: null, updatedAt: '2026-11-21T00:00:00Z' };

test('a workspace without a connection reads as null; a connection is checked for shape', async t => {
  let data = null;
  const asked = server(t, () => ({ success: true, data }));
  assert.equal(await fetchJiraConnection('p 1'), null);
  assert.match(asked[0].url, /\/projects\/p%201\/tasks\/jira$/);
  data = connection;
  assert.equal((await fetchJiraConnection('p 1')).tokenLast4, 'abcd');
  data = { site: 1 };
  await assert.rejects(fetchJiraConnection('p 1'), /invalid Jira connection/);
});

test('saving sends the token only when one was typed', async t => {
  const asked = server(t, { success: true, data: { ...connection, account: 'Lead' } });
  await saveJiraConnection('p1', { site: 'archtime.atlassian.net', email: 'lead@example.com', jql: 'project = SCRUM', token: '  ATATT-new  ' });
  await saveJiraConnection('p1', { site: 'archtime.atlassian.net', email: 'lead@example.com', jql: 'project = B', token: '   ' });
  assert.deepEqual(asked.map(a => a.method), ['PUT', 'PUT']);
  assert.equal(asked[0].body.token, 'ATATT-new');
  assert.ok(!('token' in asked[1].body), 'an empty token keeps the stored one');
});

test('sync and disconnect call their routes; an unconfirmed sync is an error', async t => {
  let reply = { success: true, data: { issues: 287, created: 0, updated: 287, unchanged: 0, removed: 0, restored: 0, sprints: 2, sprintsRemoved: 0, links: { commits: 0, linked: 0, unknownKeys: [] } } };
  const asked = server(t, () => reply);
  assert.equal((await syncJira('p1')).issues, 287);
  await removeJiraConnection('p1');
  assert.deepEqual(asked.map(a => [a.method, a.url.replace(/^.*\/projects/, '')]), [['POST', '/p1/tasks/jira/sync'], ['DELETE', '/p1/tasks/jira']]);
  reply = { success: true, data: {} };
  await assert.rejects(syncJira('p1'), /did not confirm the sync/);
  assert.equal(siteLabel('https://archtime.atlassian.net'), 'archtime.atlassian.net');
});

import { readJiraUrl } from '../src/features/jira.ts';

test('a pasted Jira address gives the site and, on a project page, its key', () => {
  assert.deepEqual(readJiraUrl('https://dntruongproject.atlassian.net/jira/software/projects/KAN/boards/2?filter=&groupBy=none'), { site: 'dntruongproject.atlassian.net', projectKey: 'KAN' });
  assert.deepEqual(readJiraUrl('https://archtime.atlassian.net/browse/SCRUM-16'), { site: 'archtime.atlassian.net', projectKey: 'SCRUM' });
  assert.deepEqual(readJiraUrl(' https://Team-1.atlassian.net/jira/software/projects/KAN/boards/2/backlog?selectedIssue=KAN-2 '), { site: 'team-1.atlassian.net', projectKey: 'KAN' });
  assert.deepEqual(readJiraUrl('archtime.atlassian.net/jira/for-you'), { site: 'archtime.atlassian.net', projectKey: null });
  assert.deepEqual(readJiraUrl('archtime.atlassian.net'), { site: 'archtime.atlassian.net', projectKey: null });
  for (const text of ['archtime', 'https://evil.io/x.atlassian.net/projects/KAN', 'https://archtime.atlassian.net.evil.io/projects/KAN', '']) {
    assert.deepEqual(readJiraUrl(text), { site: null, projectKey: null }, text);
  }
});
