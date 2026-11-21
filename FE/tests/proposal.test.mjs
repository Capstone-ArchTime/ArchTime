import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProposal, checkProposal, diagramChanges, listMyProposals, proposeChange, withoutComponent } from '../src/features/proposal.ts';
import { canAccess } from '../src/auth/permissions.ts';
import { mockGlobal } from './mock-global.mjs';

const storage = (initial = {}) => { const v = new Map(Object.entries(initial)); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => v.set(k, x), removeItem: k => v.delete(k) }; };
const signedIn = t => { mockGlobal(t, 'sessionStorage', storage({ accessToken: 'token' })); mockGlobal(t, 'localStorage', storage()); };
const c = (id, name, kind = 'Service') => ({ id, name, kind, description: '', pathPrefixes: [`src/${id}/`] });
const d = (id, source, target) => ({ id, source, target, label: '' });
const base = { components: [c('api', 'API'), c('db', 'Database', 'Database')], dependencies: [d('e1', 'api', 'db')] };

test('every developer-analyst reaches the propose page; an administrator does not', () => {
  assert.equal(canAccess('developer-analyst', '/propose-change'), true);
  assert.equal(canAccess('system-administrator', '/propose-change'), false);
});

test('the changes are listed by name: added, renamed, changed and removed components and dependencies', () => {
  const next = {
    components: [{ ...c('api', 'Gateway') }, c('queue', 'Queue', 'Queue')],
    dependencies: [d('e2', 'api', 'queue')],
  };
  assert.deepEqual(diagramChanges(base, next), [
    'Renames component API to Gateway',
    'Adds component Queue (Queue)',
    'Removes component Database',
    'Adds dependency Gateway → Queue',
    'Removes dependency Gateway → Database',
  ]);
  assert.deepEqual(diagramChanges(base, { ...base }), []);
  assert.deepEqual(diagramChanges(base, { ...base, components: [{ ...c('api', 'API'), description: 'HTTP' }, base.components[1]] }), ['Changes component API']);
});

test('a proposal needs a title, a component, valid dependencies and at least one change', () => {
  const changed = { components: [...base.components, c('ui', 'Web', 'UI')], dependencies: base.dependencies };
  assert.equal(checkProposal(' ', base, changed), 'Give the proposal a title.');
  assert.equal(checkProposal('Add web', base, { components: [], dependencies: [] }), 'A diagram needs at least one component.');
  assert.match(checkProposal('Add web', base, { components: changed.components, dependencies: [d('x', 'api', 'gone')] }), /no longer in the diagram/);
  assert.equal(checkProposal('Nothing', base, base), 'The proposal changes nothing in the confirmed diagram.');
  assert.equal(checkProposal('Add web', base, changed), null);
});

test('removing a component removes its dependencies too', () => {
  assert.deepEqual(withoutComponent(base, 'db'), { components: [base.components[0]], dependencies: [] });
});

test('DS-04a: the request carries the proposed diagram, lists the changes for the reviewer and leaves path prefixes out', async (t) => {
  const next = { components: [...base.components, c('ui', 'Web', 'UI')], dependencies: [...base.dependencies, d('e2', 'ui', 'api')] };
  const body = buildProposal({ title: ' Add the web client ', description: 'Customers need a UI.' }, base, next);
  assert.equal(body.title, 'Add the web client');
  assert.equal(body.type, 'architecture_change');
  assert.equal(body.description, 'Customers need a UI.\n\nChanges:\n- Adds component Web (UI)\n- Adds dependency Web → API');
  assert.deepEqual(body.data.diagram.components.map(x => Object.keys(x).sort().join()), ['description,id,kind,name', 'description,id,kind,name', 'description,id,kind,name']);
  assert.equal(body.data.diagram.dependencies.length, 2);

  signedIn(t);
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    asked.push({ url: String(url), method: init?.method, body: JSON.parse(init.body) });
    return Response.json({ success: true, data: { approval: { id: 'a1', status: 'pending' } } }, { status: 201 });
  });
  await proposeChange('p1', body);
  assert.match(asked[0].url, /\/projects\/p1\/approvals$/);
  assert.equal(asked[0].method, 'POST');
  assert.deepEqual(asked[0].body, body);
});

test('"Your proposals" lists only this account\'s requests, with their status and the reviewer\'s note', async (t) => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.match(String(url), /\/projects\/p1\/approvals\?type=architecture_change&limit=50$/);
    return Response.json({ success: true, data: { approvals: [
      { id: 'a2', title: 'Split billing', status: 'rejected', requestedBy: 'me', reviewNote: 'Too early', createdAt: '2026-11-20T10:00:00Z' },
      { id: 'a1', title: 'Theirs', status: 'pending', requestedBy: 'someone-else' },
      { id: 'a0', title: 'Add web', status: 'approved', requestedBy: 'me' },
    ] } });
  });
  const mine = await listMyProposals('p1', 'me');
  assert.deepEqual(mine.map(p => [p.id, p.status, p.reviewNote]), [['a2', 'rejected', 'Too early'], ['a0', 'approved', '']]);
});

test('a malformed list is an error, not "no proposals"', async (t) => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: {} }));
  await assert.rejects(listMyProposals('p1', 'me'), /invalid list of proposals/);
});
