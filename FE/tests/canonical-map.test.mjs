import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_KIND, NOT_CONFIRMED, canonicalStatus, canonicalSummary, computedMapKind } from '../src/features/canonical-map.ts';
import { fromServer } from '../src/features/workspace-sync.ts';

test('computed maps are told apart by their generator; nothing else passes for one', () => {
  assert.equal(computedMapKind('cluster-only'), 'clustered');
  assert.equal(computedMapKind('cluster+llm'), 'refined');
  assert.equal(computedMapKind('manual'), null);
  assert.equal(computedMapKind(undefined), null);
  for (const kind of ['clustered', 'refined', 'canonical']) assert.ok(MAP_KIND[kind].label && MAP_KIND[kind].description);
});

test('the canonical status reads the server confirmation and rejects anything malformed', () => {
  const status = canonicalStatus({ confirmedAt: '2026-10-01T08:00:00.000Z', confirmedByName: ' Mia Mentor ', confirmedRevision: 7 });
  assert.deepEqual(status, { confirmed: true, confirmedAt: '2026-10-01T08:00:00.000Z', confirmedByName: 'Mia Mentor', confirmedRevision: 7 });
  assert.deepEqual(canonicalStatus({ confirmedAt: null, confirmedByName: 'x' }), NOT_CONFIRMED);
  assert.deepEqual(canonicalStatus({ confirmedAt: 'yesterday' }), NOT_CONFIRMED);
  assert.deepEqual(canonicalStatus(null), NOT_CONFIRMED);
  assert.equal(canonicalStatus({ confirmedAt: '2026-10-01T08:00:00.000Z', confirmedRevision: -1 }).confirmedRevision, null);
});

test('the summary names who vouches for the map, when, and at which revision', () => {
  const day = () => '1 Oct 2026';
  assert.equal(canonicalSummary(canonicalStatus({ confirmedAt: '2026-10-01T08:00:00.000Z', confirmedByName: 'Mia', confirmedRevision: 7 }), day), 'Confirmed by Mia on 1 Oct 2026 (revision 7).');
  assert.equal(canonicalSummary(canonicalStatus({ confirmedAt: '2026-10-01T08:00:00.000Z' }), day), 'Confirmed on 1 Oct 2026.');
  assert.match(canonicalSummary(NOT_CONFIRMED), /No canonical map yet/);
});

test('a loaded workspace keeps who confirmed it; a draft carries no confirmer', () => {
  const confirmed = fromServer({ revision: 5, diagram: { components: [], dependencies: [], confirmedAt: '2026-10-01T08:00:00.000Z', confirmedBy: 'u1', confirmedByName: 'Mia', confirmedRevision: 4 } });
  assert.equal(confirmed.diagram.confirmedByName, 'Mia');
  assert.equal(confirmed.diagram.confirmedRevision, 4);
  const draft = fromServer({ revision: 5, diagram: { components: [], dependencies: [], confirmedAt: null, confirmedByName: 'stale' } });
  assert.equal(draft.diagram.confirmedByName, undefined);
});
