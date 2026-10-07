import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustedRandIndex, componentCycles, layerViolations, nameGrounding, referenceGrouping, sizeBalance } from '../src/domain/architecture/quality.ts';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('a name is grounded when the member paths support one of its words', () => {
  const r = nameGrounding([
    { name: 'Authentication', memberIds: ['src/auth/login.ts', 'src/auth/token.ts'] },           // auth ← authentication
    { name: 'Order Management', memberIds: ['src/orders/OrderService.ts'] },                     // order ← orders; "management" is generic
    { name: 'Mining Pipeline', memberIds: ['BE/src/infrastructure/services/MiningService.ts'] }, // camelCase split
    { name: 'Payment Gateway', memberIds: ['src/billing/stripe.ts'] },                           // nothing supports it
    { name: 'Core Services', memberIds: ['src/x/a.ts'] },                                        // only generic words: too vague to check
    { name: 'Unassigned Files', memberIds: ['README.ts'] },                                      // made by clustering, not judged
  ]);
  assert.deepEqual(r.ungrounded, ['Payment Gateway', 'Core Services']);
  close(r.score, 3 / 5);
  assert.equal(nameGrounding([]).score, 1);
});

test('components in a dependency loop are found (Tarjan)', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const r = componentCycles(ids, [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'b', target: 'c' }, { source: 'c', target: 'd' }, { source: 'd', target: 'd' }]);
  assert.deepEqual(r.cycles, [['a', 'b']]);
  close(r.score, 0.5);
  const chain = componentCycles(ids, [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' }]);
  assert.deepEqual(chain.cycles, [['a', 'b', 'c']]);
  close(chain.score, 0.25);
  assert.equal(componentCycles(ids, []).score, 1);
});

test('dependencies pointing up the layers are violations, weighted by how many dependencies back them', () => {
  const comps = [{ id: 'ui', role: 'controller' }, { id: 'svc', role: 'service' }, { id: 'db', role: 'repository' }, { id: 'x', role: 'other' }];
  const r = layerViolations(comps, [
    { source: 'ui', target: 'svc', weight: 6 }, { source: 'svc', target: 'db', weight: 3 },
    { source: 'db', target: 'ui', weight: 1 },  // repository -> controller: wrong way
    { source: 'x', target: 'ui', weight: 50 },  // unknown role: not judged
  ]);
  assert.deepEqual(r.violations, [{ source: 'db', target: 'ui', weight: 1 }]);
  close(r.score, 0.9);
  assert.equal(layerViolations(comps, []).score, 1);
});

test('size balance is 1 for equal components and low when one holds almost everything', () => {
  assert.equal(sizeBalance([5, 5, 5, 5]), 1);
  assert.ok(sizeBalance([97, 1, 1, 1]) < 0.2);
  assert.equal(sizeBalance([10]), 1);
  assert.ok(sizeBalance([10, 10, 1]) > sizeBalance([18, 2, 1]));
});

test('adjusted Rand index: 1 for the same grouping under other names, about 0 for an unrelated one', () => {
  const a = new Map([['f1', 'x'], ['f2', 'x'], ['f3', 'y'], ['f4', 'y'], ['f5', 'z'], ['f6', 'z']]);
  const renamed = new Map([['f1', 'P'], ['f2', 'P'], ['f3', 'Q'], ['f4', 'Q'], ['f5', 'R'], ['f6', 'R'], ['only-here', 'R']]);
  assert.deepEqual(adjustedRandIndex(a, renamed), { score: 1, common: 6 });
  const crossed = new Map([['f1', 'P'], ['f2', 'Q'], ['f3', 'R'], ['f4', 'P'], ['f5', 'Q'], ['f6', 'R']]);
  assert.ok(adjustedRandIndex(a, crossed).score <= 0);
  // Textbook value: one file moved out of three groups of two.
  const oneMoved = new Map([['f1', 'x'], ['f2', 'x'], ['f3', 'y'], ['f4', 'z'], ['f5', 'z'], ['f6', 'z']]);
  close(adjustedRandIndex(a, oneMoved).score, 0.4444);
  assert.equal(adjustedRandIndex(new Map([['f1', 'x']]), new Map([['f1', 'y']])), null);
});

test('a reference architecture maps files by path prefix, most specific prefix first', () => {
  const ref = [
    { name: 'Domain', prefixes: ['BE/src/domain/'] },
    { name: 'LLM', prefixes: ['BE/src/domain/architecture/llm/', 'BE/src/infrastructure/llm'] },
    { name: 'Presentation', prefixes: ['./BE/src/presentation/'] },
  ];
  const g = referenceGrouping(['BE/src/domain/entities/User.ts', 'BE/src/domain/architecture/llm/refine.ts', 'BE/src/infrastructure/llm/runtime.ts', 'BE/src/presentation/routes/a.ts', 'FE/src/App.tsx'], ref);
  assert.deepEqual([...g], [
    ['BE/src/domain/entities/User.ts', 'Domain'], ['BE/src/domain/architecture/llm/refine.ts', 'LLM'],
    ['BE/src/infrastructure/llm/runtime.ts', 'LLM'], ['BE/src/presentation/routes/a.ts', 'Presentation'],
  ]);
});
