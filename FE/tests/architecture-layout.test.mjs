import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph } from '../src/features/architecture/layout.ts';
import { validateLayout } from '../src/features/architecture/layout-validate.ts';

const W = 196, H = 76;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function randomGraph(seed, n, m, withHints) {
  const r = rng(seed);
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${String(i).padStart(2, '0')}`, width: W, height: H, ...(withHints ? { layer: Math.floor(r() * 4) } : {}) }));
  const edges = [];
  const seen = new Set();
  while (edges.length < m) {
    const a = nodes[Math.floor(r() * n)].id, b = nodes[Math.floor(r() * n)].id;
    if (a === b || seen.has(`${a}>${b}`)) continue;
    seen.add(`${a}>${b}`);
    edges.push({ id: `${a}->${b}`, source: a, target: b });
  }
  return { nodes, edges };
}

test('layering follows dependencies and flags cycles', () => {
  const nodes = ['a', 'b', 'c', 'd'].map(id => ({ id, width: W, height: H }));
  const edges = [['a', 'b'], ['b', 'c'], ['c', 'b'], ['a', 'd']].map(([s, t]) => ({ id: `${s}->${t}`, source: s, target: t }));
  const layout = layoutGraph(nodes, edges);
  const layer = Object.fromEntries(layout.nodes.map(n => [n.id, n.layer]));
  assert.ok(layer.a < layer.b && layer.a < layer.d, 'sources sit above what they depend on');
  assert.notEqual(layer.b, layer.c, 'a two-node cycle still spans two layers');
  assert.equal(layout.edges.find(e => e.id === 'a->d').inCycle, false);
  assert.equal(layout.edges.find(e => e.id === 'b->c').inCycle, true);
  assert.equal(layout.edges.find(e => e.id === 'c->b').inCycle, true);
  assert.deepEqual(validateLayout(layout), []);
});

test('layer hints win, edges against the flow are drawn reversed and same-layer edges are flat', () => {
  const nodes = [{ id: 'top', layer: 0 }, { id: 'mid', layer: 1 }, { id: 'low', layer: 2 }, { id: 'peer', layer: 1 }].map(n => ({ width: W, height: H, ...n }));
  const edges = [['top', 'low'], ['low', 'top'], ['mid', 'peer']].map(([s, t]) => ({ id: `${s}->${t}`, source: s, target: t }));
  const layout = layoutGraph(nodes, edges);
  assert.deepEqual(layout.nodes.map(n => [n.id, n.layer]).sort(), [['low', 2], ['mid', 1], ['peer', 1], ['top', 0]]);
  assert.equal(layout.edges.find(e => e.id === 'low->top').reversed, true);
  assert.equal(layout.edges.find(e => e.id === 'top->low').reversed, false);
  assert.equal(layout.edges.find(e => e.id === 'mid->peer').flat, true);
  // A reversed edge is still drawn from its source to its target.
  const reversed = layout.edges.find(e => e.id === 'low->top');
  assert.ok(reversed.points[0].y > reversed.points.at(-1).y);
  assert.deepEqual(validateLayout(layout), []);
});

test('the layout does not depend on input order', () => {
  const { nodes, edges } = randomGraph(7, 12, 30, false);
  const a = layoutGraph(nodes, edges);
  const b = layoutGraph([...nodes].reverse(), [...edges].reverse());
  assert.deepEqual(a, b);
});

test('random graphs of component size never overlap nodes or run edges through them', () => {
  const failures = [];
  for (let seed = 1; seed <= 60; seed++) {
    const n = 6 + (seed % 10);
    const { nodes, edges } = randomGraph(seed, n, Math.min(n * 3, n * (n - 1) / 2), seed % 2 === 0);
    const issues = validateLayout(layoutGraph(nodes, edges));
    if (issues.length) failures.push(`seed ${seed}: ${issues.slice(0, 2).map(i => `${i.code} ${i.message}`).join('; ')}`);
  }
  assert.deepEqual(failures, []);
});

test('dense 15-node graphs lay out quickly', () => {
  const { nodes, edges } = randomGraph(99, 15, 60, false);
  const start = performance.now();
  for (let i = 0; i < 10; i++) layoutGraph(nodes, edges);
  assert.ok((performance.now() - start) / 10 < 100, 'one layout should take well under 100ms');
});

test('edge ends are spread across a node instead of stacked', () => {
  const nodes = ['hub', 'a', 'b', 'c', 'd'].map(id => ({ id, width: W, height: H, layer: id === 'hub' ? 0 : 1 }));
  const edges = ['a', 'b', 'c', 'd'].map(t => ({ id: `hub->${t}`, source: 'hub', target: t }));
  const layout = layoutGraph(nodes, edges);
  const xs = layout.edges.map(e => e.points[0].x).sort((p, q) => p - q);
  assert.equal(new Set(xs).size, 4);
  assert.ok(xs[1] - xs[0] >= 20);
  assert.deepEqual(validateLayout(layout), []);
});

test('empty and degenerate input', () => {
  assert.equal(layoutGraph([], []).nodes.length, 0);
  const one = layoutGraph([{ id: 'x', width: W, height: H }], [{ id: 'x->x', source: 'x', target: 'x' }, { id: 'x->?', source: 'x', target: 'missing' }]);
  assert.equal(one.edges.length, 0);
  assert.deepEqual(validateLayout(one), []);
});

test('the layout validator catches overlaps and edges through nodes', () => {
  const nodes = ['a', 'b', 'c'].map(id => ({ id, width: W, height: H, layer: id === 'b' ? 1 : id === 'a' ? 0 : 2 }));
  const layout = layoutGraph(nodes, [{ id: 'a->c', source: 'a', target: 'c' }]);
  assert.deepEqual(validateLayout(layout), []);
  const broken = structuredClone(layout);
  broken.nodes.find(n => n.id === 'c').x = broken.nodes.find(n => n.id === 'b').x + 10; // overlap is only possible if rows share y, so move c up into b's row
  broken.nodes.find(n => n.id === 'c').y = broken.nodes.find(n => n.id === 'b').y;
  assert.ok(validateLayout(broken).some(i => i.code === 'L001'));
  const through = structuredClone(layout);
  const edge = through.edges[0];
  const b = through.nodes.find(n => n.id === 'b');
  edge.points = [edge.points[0], { x: b.x + b.width / 2, y: b.y + b.height / 2 }, edge.points.at(-1)];
  edge.segments = [{ kind: 'line', to: edge.points[1] }, { kind: 'line', to: edge.points[2] }];
  assert.ok(validateLayout(through).some(i => i.code === 'L002'));
});
