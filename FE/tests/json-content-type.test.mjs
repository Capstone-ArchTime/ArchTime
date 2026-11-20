import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importJiraExport } from '../src/features/tasks.ts';
import { suspendOrganization } from '../src/features/admin-organizations.ts';
import { mockGlobal } from './mock-global.mjs';

// apiRequest adds no Content-Type. A JSON body sent without one is ignored by the server's JSON parser, which then sees
// an empty request (found in UAT: "Attach the Jira export file", and a suspension with "no reason").

const storage = (initial = {}) => { const v = new Map(Object.entries(initial)); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, x), removeItem: k => v.delete(k) }; };
const signedIn = t => { mockGlobal(t, 'sessionStorage', storage({ accessToken: 'token' })); mockGlobal(t, 'localStorage', storage()); };
const contentType = init => new Headers(init?.headers).get('content-type');

test('importing a Jira export and suspending an organization send their body as JSON', async (t) => {
  signedIn(t);
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent.push({ url: String(url), type: contentType(init), body: JSON.parse(init.body) });
    return Response.json({ success: true, data: String(url).includes('/suspend') ? { organization: { id: 'o1' } } : { created: 1, updated: 0, unchanged: 0, removed: 0, restored: 0, sprints: 0, sprintsRemoved: 0, links: { commits: 0, linked: 0, unknownKeys: [] } } });
  });
  await importJiraExport('p1', '{"issues":[]}');
  await suspendOrganization('o1', 'Security review');
  assert.deepEqual(sent.map(s => s.type), ['application/json', 'application/json']);
  assert.deepEqual(sent[0].body, { file: '{"issues":[]}' });
  assert.deepEqual(sent[1].body, { reason: 'Security review' });
});

test('every apiRequest that sends a JSON body says so (Content-Type or the json() helper)', () => {
  const root = new URL('../src/', import.meta.url);
  const files = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
  walk(fileURLToPath(root)); // decodes %20 and drive letters, so a checkout path with spaces works
  const missing = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/body:\s*JSON\.stringify/g)) {
      const start = text.lastIndexOf('apiRequest', m.index);
      if (start < 0) continue; // not an apiRequest call (raw fetch sets its own headers)
      if (!/Content-Type/i.test(text.slice(start, m.index + 200))) missing.push(`${path.basename(file)}:${text.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(missing, []);
});
