import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchServerWorkspace, fromServer, isRevisionConflict, isServerProjectId, saveServerWorkspace } from '../src/features/workspace-sync.ts';
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const signedIn = t => {
  t.mock.property(globalThis, 'sessionStorage', storage({ accessToken: 'token' }));
  t.mock.property(globalThis, 'localStorage', storage());
};
const serverWorkspace = {
  id: 'w1', projectId: 'p1', revision: 4,
  diagram: { revision: 4, confirmedAt: '2026-10-01T00:00:00.000Z', confirmedBy: 'u1', components: [{ description: 'UI', kind: 'UI', name: 'Web', id: 'web' }], dependencies: [] },
  rules: [],
  decisions: [{ id: 'd1', number: 1, title: 'T', status: 'Accepted', context: '', decision: '', alternatives: '', consequences: '', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', origin: 'reconstructed', sources: [{ kind: 'commit', ref: 'abc' }] }],
};

test('server workspaces use the revision the server checks and a stable field order', () => {
  const ws = fromServer(serverWorkspace);
  assert.equal(ws.diagram.revision, 4);
  assert.equal(JSON.stringify(ws.diagram.components[0]), JSON.stringify({ id: 'web', name: 'Web', kind: 'UI', description: 'UI' }));
  assert.equal(ws.diagram.confirmedAt, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(ws.decisions[0].componentIds, []);
  assert.equal(ws.decisions[0].origin, 'reconstructed');
  assert.equal(fromServer({ revision: 0, diagram: {} }).diagram.revision, 1);
});

test('saving sends the revision the editor loaded', async t => {
  signedIn(t);
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, method: options.method, body: JSON.parse(options.body) };
    return Response.json({ success: true, data: { workspace: { ...serverWorkspace, revision: 5, diagram: { ...serverWorkspace.diagram, revision: 5 } } } });
  });
  const saved = await saveServerWorkspace('p1', 4, fromServer(serverWorkspace));
  assert.match(sent.url, /\/projects\/p1\/workspace$/);
  assert.equal(sent.method, 'PUT');
  assert.equal(sent.body.expectedRevision, 4);
  assert.equal(saved.diagram.revision, 5);
});

test('a stale save is reported as a revision conflict, not a generic failure', async t => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false, error: { code: 'CONFLICT', message: 'Workspace revision conflict: expected revision 4, but current revision on server is 5.' } }, { status: 409 }));
  await assert.rejects(saveServerWorkspace('p1', 4, fromServer(serverWorkspace)), error => isRevisionConflict(error) && /server is 5/.test(error.message));
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 403 }));
  await assert.rejects(saveServerWorkspace('p1', 4, fromServer(serverWorkspace)), error => !isRevisionConflict(error) && error.status === 403);
});

test('a load failure is surfaced instead of being treated as an empty workspace', async t => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: {} }));
  await assert.rejects(fetchServerWorkspace('p1'), /invalid workspace/);
});

test('only Mongo ids are treated as server projects', () => {
  assert.ok(isServerProjectId('65f0c0ffee0000000000abcd'));
  assert.ok(!isServerProjectId('E-Commerce Platform'));
});
