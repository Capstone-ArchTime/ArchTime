import test from 'node:test';
import assert from 'node:assert/strict';
import { maxMno, mno, mojoDistance, mojoFM } from '../src/domain/architecture/mojo.ts';

// Brute force: shortest sequence of Move (one item to another or a new cluster) and Join (two clusters) operations,
// found by breadth-first search over every partition of the items.
const key = parts => parts.map(p => [...p].sort().join(',')).sort().join('|');
const toParts = grouping => {
  const by = new Map();
  for (const [item, g] of grouping) by.set(g, [...(by.get(g) ?? []), item]);
  return [...by.values()];
};
function neighbours(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) out.push([...parts.filter((_, k) => k !== i && k !== j), [...parts[i], ...parts[j]]]);
    for (const item of parts[i]) {
      const rest = parts.map((p, k) => (k === i ? p.filter(x => x !== item) : p)).filter(p => p.length);
      if (parts[i].length > 1) out.push([...rest, [item]]);
      parts.forEach((p, k) => { if (k !== i) out.push(rest.map(q => (q === p ? [...q, item] : q))); });
    }
  }
  return out;
}
function bruteMno(a, b) {
  const target = key(toParts(b));
  let frontier = [toParts(a)], seen = new Set([key(frontier[0])]), d = 0;
  while (frontier.length) {
    if (frontier.some(p => key(p) === target)) return d;
    const next = [];
    for (const p of frontier) for (const q of neighbours(p)) { const k = key(q); if (!seen.has(k)) { seen.add(k); next.push(q); } }
    frontier = next; d++;
  }
  throw new Error('unreachable');
}
function partitions(items) {
  if (!items.length) return [[]];
  const [first, ...rest] = items;
  return partitions(rest).flatMap(p => [[[first], ...p], ...p.map((_, i) => p.map((q, k) => (k === i ? [first, ...q] : q)))]);
}
const grouping = parts => new Map(parts.flatMap((p, i) => p.map(x => [x, `g${i}`])));

test('mno equals the brute-force shortest Move/Join sequence for every pair of partitions of 5 items', () => {
  const all = partitions(['a', 'b', 'c', 'd', 'e']).map(grouping);
  assert.equal(all.length, 52);
  for (const a of all) for (const b of all) assert.equal(mno(a, b), bruteMno(a, b), `${key(toParts(a))} -> ${key(toParts(b))}`);
});

test('maxMno equals the brute-force farthest partition, for every target partition of up to 6 items', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const items = 'abcdef'.slice(0, n).split('');
    const all = partitions(items).map(grouping);
    for (const b of all) assert.equal(maxMno(b), Math.max(...all.map(a => mno(a, b))), `target ${key(toParts(b))}`);
  }
});

test('MoJoFM is 100 for the same grouping, whatever the group names, and 0 for the farthest one', () => {
  const a = new Map([['x', '1'], ['y', '1'], ['z', '2'], ['w', '2']]);
  const renamed = new Map([['x', 'p'], ['y', 'p'], ['z', 'q'], ['w', 'q']]);
  assert.deepEqual(mojoFM(a, renamed), { score: 100, distance: 0, common: 4 });
  const singletons = new Map([['x', 's1'], ['y', 's2'], ['z', 's3'], ['w', 's4']]);
  const farthest = new Map([['x', 'all'], ['y', 'all'], ['z', 'all'], ['w', 'all']]);
  assert.equal(mojoFM(farthest, singletons).score, 0);
});

test('only shared files are compared, and too few shared files give no score', () => {
  const a = new Map([['x', '1'], ['y', '1'], ['gone', '2']]);
  const b = new Map([['x', 'p'], ['y', 'p'], ['new', 'q']]);
  assert.deepEqual(mojoFM(a, b), { score: 100, distance: 0, common: 2 });
  assert.equal(mojoFM(new Map([['x', '1']]), new Map([['x', 'p']])), null);
});

test('MoJo distance takes the cheaper direction', () => {
  const a = new Map([['x', '1'], ['y', '1'], ['z', '1']]);
  const b = new Map([['x', 'p'], ['y', 'q'], ['z', 'r']]);
  assert.equal(mno(a, b), 2);
  assert.equal(mno(b, a), 2);
  assert.equal(mojoDistance(a, b), 2);
});
