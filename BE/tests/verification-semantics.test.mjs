// Research audit (2026-11-24): what the verification rules M001-M008 do and do not guarantee. They are structural:
// answers that are architecturally wrong but well-shaped pass them. These tests pin that down so that the paper does not
// describe the rules as a check of semantic correctness, and they cover the advisory move audit (auditRefinement).
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRefinement, verifyNaming, verifyRefine } from '../src/domain/architecture/llm/verify.ts';
import { DEFAULT_REFINE_OPTIONS } from '../src/domain/architecture/llm/types.ts';

// 24 files in 8 initial clusters of three (files 3k, 3k+1, 3k+2 in cluster k); each cluster is internally connected.
const initialCluster = Array.from({ length: 24 }, (_, f) => Math.floor(f / 3));
const ctx = { fileCount: 24, initialCluster, options: { ...DEFAULT_REFINE_OPTIONS } };
const edges = Array.from({ length: 8 }, (_, k) => [[3 * k, 3 * k + 1], [3 * k + 1, 3 * k + 2], [3 * k, 3 * k + 2]]).flat();
const NAMES = ['Auth', 'Billing', 'Search', 'Documents', 'Collections', 'Notifications', 'Import', 'Export'];
const component = (name, files, role = 'service', description = 'Does one thing.') => ({ name, role, description, files });
const asClusters = (names) => names.map((name, k) => component(name, [3 * k, 3 * k + 1, 3 * k + 2]));

test('the correct answer passes', () => {
  assert.equal(verifyRefine({ components: asClusters(NAMES) }, ctx).ok, true);
});

test('semantically wrong, structurally valid: two names swapped pass every rule', () => {
  const r = verifyRefine({ components: asClusters(['Billing', 'Auth', ...NAMES.slice(2)]) }, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
});

test('semantically wrong, structurally valid: an unfitting role and a false description pass (M006, M007 check form only)', () => {
  const answer = asClusters(NAMES);
  answer[0] = component('Auth', [0, 1, 2], 'repository', 'Renders the marketing landing page.');
  assert.equal(verifyRefine({ components: answer }, ctx).ok, true);
});

test('semantically wrong, structurally valid: arbitrary moves under the 40 % limit pass; the advisory audit flags them', () => {
  // One file of each of the first four clusters is moved, round robin, into a cluster it has no import relation with.
  const answer = [
    component('Auth', [1, 2, 9]), component('Billing', [4, 5, 0]), component('Search', [7, 8, 3]), component('Documents', [10, 11, 6]),
    ...[4, 5, 6, 7].map(k => component(NAMES[k], [3 * k, 3 * k + 1, 3 * k + 2])),
  ];
  const r = verifyRefine({ components: answer }, ctx);
  assert.equal(r.ok, true, 'M001-M008 all pass');
  assert.equal(r.movedRatio, 4 / 24);
  const audit = auditRefinement({ initialCluster, components: answer, edges });
  assert.equal(audit.moved, 4);
  assert.deepEqual(audit.unsupportedMoves.map(m => [m.file, m.from, m.to, m.edgesToOrigin, m.edgesToTarget]),
    [[0, 0, 1, 2, 0], [3, 1, 2, 2, 0], [6, 2, 3, 2, 0], [9, 3, 0, 2, 0]], 'every move rests on the model alone');
});

test('the audit accepts a move backed by imports and marks one with weaker support than its origin', () => {
  // File 2 imports two files of cluster 1 and one of its own cluster 0: moving it to cluster 1 is supported.
  const extra = [...edges.filter(([a, b]) => !(a === 0 && b === 2)), [2, 3], [2, 4]];
  const answer = [component('Auth', [0, 1]), component('Billing', [3, 4, 5, 2]), ...[2, 3, 4, 5, 6, 7].map(k => component(NAMES[k], [3 * k, 3 * k + 1, 3 * k + 2]))];
  const supported = auditRefinement({ initialCluster, components: answer, edges: extra });
  assert.deepEqual([supported.moved, supported.unsupportedMoves.length, supported.weakerMoves.length], [1, 0, 0]);
  // With three relations kept to its origin and one to the target, the move is weaker than staying.
  const weak = auditRefinement({ initialCluster, components: answer, edges: [...edges, [2, 3]] });
  assert.deepEqual(weak.weakerMoves.map(m => [m.file, m.edgesToOrigin, m.edgesToTarget]), [[2, 2, 1]]);
});

test('the rules do catch structural faults: missing or repeated files, too many moves, bad names and roles', () => {
  const codes = (components) => verifyRefine({ components }, ctx).issues.map(i => i.code).sort();
  const missing = asClusters(NAMES); missing[7] = component('Export', [21, 22]);
  assert.ok(codes(missing).includes('M002'));
  const repeated = asClusters(NAMES); repeated[0] = component('Auth', [0, 1, 2, 3]);
  assert.ok(codes(repeated).includes('M002'));
  const dup = asClusters(NAMES); dup[1] = component('auth', [3, 4, 5]);
  assert.ok(codes(dup).includes('M005'));
  const role = asClusters(NAMES); role[2] = component('Search', [6, 7, 8], 'helper');
  assert.ok(codes(role).includes('M006'));
  // A rotation over the first six clusters (two of three files of each move on): 12 of 24 files moved, sizes stay at three.
  const big = Array.from({ length: 8 }, (_, k) => component(NAMES[k], k < 6 ? [3 * k, (3 * ((k + 1) % 6)) + 1, (3 * ((k + 2) % 6)) + 2] : [3 * k, 3 * k + 1, 3 * k + 2]));
  assert.ok(codes(big).includes('M004'), 'more than 40 % moved');
});

test('name-only mode (50 of the 59 test-set milestones) applies no count, size or move rule: 20 clusters named pass', () => {
  const clusterIds = Array.from({ length: 20 }, (_, i) => `c${i}`);
  const answer = { components: clusterIds.map((cluster, i) => ({ cluster, name: `Part ${i}`, role: 'other', description: 'x' })) };
  const r = verifyNaming(answer, { clusterIds });
  assert.equal(r.ok, true, 'M003 (8-15 components) is not checked in name-only mode');
  const wrong = { components: clusterIds.map((cluster, i) => ({ cluster, name: i === 3 ? 'Part 4' : `Part ${i}`, role: 'other', description: 'x' })) };
  assert.ok(verifyNaming(wrong, { clusterIds }).issues.some(i => i.code === 'M005'), 'names are still checked');
});
