import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, fromServer } from '../src/features/maintainer-workspace.ts';

test('a workspace nobody has saved yet is empty: no sample components, rules or decisions', () => {
  const ws = emptyWorkspace();
  assert.deepEqual(ws.diagram.components, []);
  assert.deepEqual(ws.diagram.dependencies, []);
  assert.deepEqual(ws.rules, []);
  assert.deepEqual(ws.decisions, []);
  assert.equal(ws.diagram.revision, 1);
  assert.equal(ws.diagram.confirmedAt, null);
});

test('every call gives a fresh empty workspace, so editing one never changes the next', () => {
  const a = emptyWorkspace();
  a.diagram.components.push({ id: 'x', name: 'X', kind: 'Service', description: '' });
  assert.equal(emptyWorkspace().diagram.components.length, 0);
});

test('the server workspace is used as sent, with the diagram revision winning over the top-level one', () => {
  const ws = fromServer({
    revision: 9,
    diagram: { components: [{ id: 'a', name: 'A', kind: 'UI', description: '' }], dependencies: [], revision: 4, confirmedAt: '2026-10-20T00:00:00Z' },
    rules: [{ id: 'r' }],
    decisions: [],
  }, emptyWorkspace());
  assert.equal(ws.diagram.revision, 4);
  assert.equal(ws.diagram.confirmedAt, '2026-10-20T00:00:00Z');
  assert.equal(ws.diagram.components.length, 1);
  assert.equal(ws.rules.length, 1);
});

test('lists the server leaves out become empty lists, never undefined', () => {
  const ws = fromServer({ revision: 3 }, emptyWorkspace());
  assert.deepEqual(ws.diagram.components, []);
  assert.deepEqual(ws.diagram.dependencies, []);
  assert.deepEqual(ws.rules, []);
  assert.deepEqual(ws.decisions, []);
  assert.equal(ws.diagram.revision, 3);
});

test('after a save the fallback supplies what the server did not repeat', () => {
  const next = emptyWorkspace();
  next.diagram.components.push({ id: 'a', name: 'A', kind: 'UI', description: '' });
  const ws = fromServer({}, { ...next, diagram: { ...next.diagram, revision: next.diagram.revision + 1 } });
  assert.equal(ws.diagram.components.length, 1);
  assert.equal(ws.diagram.revision, 2);
});
