import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeMapping, fileDependencies } from '../src/domain/architecture/buildView.ts';
import { refineMapping } from '../src/domain/architecture/llm/refine.ts';
import { LlmError } from '../src/domain/architecture/llm/types.ts';
import { expandDelta } from '../src/domain/architecture/llm/verify.ts';
import { retryAfter } from '../src/infrastructure/llm/OpenAiCompatibleClient.ts';

// Three folders of four files; clustering finds them as three clusters.
const nodes = [], edges = [];
['orders', 'payments', 'customers'].forEach((area, a, all) => {
  const names = Array.from({ length: 4 }, (_, i) => `src/${area}/file${i}.ts`);
  names.forEach(id => nodes.push({ id }));
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) edges.push({ source: names[i], target: names[j].replace('.ts', ''), type: 'imports' });
  if (a) edges.push({ source: names[0], target: `src/${all[a - 1]}/file0`, type: 'imports' });
});
const graph = { nodes, edges };
const deps = fileDependencies(graph);
const SMALL = { minComponents: 2, maxComponents: 6 };
const initial = proposeMapping(graph, SMALL).components;
const clusters = initial.map((c, i) => ({ id: `c${i}`, files: c.memberIds.map(f => deps.files.indexOf(f)) }));
const named = () => clusters.map((c, i) => ({ cluster: c.id, name: `Area ${i}`, role: 'service', description: `Area ${i}.` }));
const delta = (extra = {}) => ({ clusters: named(), newClusters: [], moves: [], ...extra });

function fake(...answers) {
  const calls = [];
  return {
    calls,
    info: { provider: 'test', model: 'test-model', host: 'localhost', external: false },
    async complete(messages, options) {
      calls.push({ messages, options });
      const next = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (next instanceof Error) throw next;
      options?.onUsage?.({ inputTokens: 100, outputTokens: 20, estimated: false }, 1);
      return JSON.stringify(next);
    },
  };
}
const run = (client, options = {}) => refineMapping({ files: deps.files, edges: deps.edges, initial, client, options: { ...SMALL, ...options } });

test('a delta answer is rebuilt into the full grouping: names, moves, merges and new clusters', () => {
  const ctx = { fileCount: deps.files.length, clusters };
  const kept = expandDelta(delta(), ctx);
  assert.equal(kept.ok, true);
  assert.deepEqual(kept.value.components.map(c => c.files.length), clusters.map(c => c.files.length));
  // Move one file into a new cluster with a second one, and empty c2 into c0 (a merge).
  const [a, b] = clusters[1].files;
  const moved = expandDelta(delta({
    clusters: named().filter(c => c.cluster !== 'c2'),
    newClusters: [{ cluster: 'n1', name: 'Split Off', role: 'util', description: 'Two files.' }],
    moves: [{ file: a, to: 'n1' }, { file: b, to: 'n1' }, ...clusters[2].files.map(f => ({ file: f, to: 'c0' }))],
  }), ctx);
  assert.equal(moved.ok, true, JSON.stringify(moved.issues));
  const byName = Object.fromEntries(moved.value.components.map(c => [c.name, c.files.sort((x, y) => x - y)]));
  assert.deepEqual(byName['Split Off'], [a, b].sort((x, y) => x - y));
  assert.equal(byName['Area 0'].length, clusters[0].files.length + clusters[2].files.length);
  assert.equal(byName['Area 2'], undefined, 'an emptied cluster is dropped');
});

test('a delta that cannot be rebuilt says why', () => {
  const ctx = { fileCount: deps.files.length, clusters };
  const codes = raw => expandDelta(raw, ctx).issues.map(i => i.code);
  assert.deepEqual(codes({ foo: 1 }), ['M001']);
  assert.deepEqual(codes(delta({ moves: [{ file: 999, to: 'c0' }] })), ['M002']);
  assert.deepEqual(codes(delta({ moves: [{ file: 0, to: 'c9' }] })), ['M002']);
  assert.deepEqual(codes(delta({ moves: [{ file: 0, to: 'c1' }, { file: 0, to: 'c2' }] })), ['M002']);
  assert.deepEqual(codes(delta({ newClusters: [{ cluster: 'c0', name: 'X', role: 'util', description: 'x' }] })), ['M002']);
  assert.deepEqual(codes(delta({ clusters: named().slice(1) })), ['M005'], 'a cluster that keeps files needs a name');
  // The full format of older answers is still accepted and judged as before.
  assert.equal(expandDelta({ components: [{ name: 'All', role: 'service', description: 'x', files: [0] }] }, ctx).ok, true);
});

test('refine asks for a delta and accepts it after the same verification', async () => {
  const client = fake(delta());
  const result = await run(client);
  assert.equal(result.generator, 'cluster+llm');
  assert.equal(result.receipt.format, 'delta');
  assert.deepEqual(client.calls[0].options.schema.required, ['clusters', 'newClusters', 'moves']);
  assert.equal(client.calls[0].options.maxTokens, undefined, 'no request limit set: the client keeps its own output budget');
  // Verification still applies to the rebuilt grouping: too few components (merge everything) is rejected.
  const merge = fake(delta({ clusters: named().slice(0, 1), moves: clusters.slice(1).flatMap(c => c.files.map(f => ({ file: f, to: 'c0' }))) }), delta());
  const second = await run(merge);
  assert.deepEqual(second.receipt.attempts.map(a => a.ok), [false, true]);
  assert.ok(second.receipt.attempts[0].issues.some(i => i.code === 'M003' || i.code === 'M004'));
});

test('a rate limit is waited out for as long as the provider asks, without using up an attempt', async () => {
  const busy = new LlmError('rate_limit', 'Rate limited. Please try again in 20ms.', 20);
  const client = fake(busy, busy, delta());
  const started = Date.now();
  const result = await run(client, { maxAttempts: 1 });
  assert.equal(result.receipt.accepted, true, 'one attempt was enough: the two waits did not count');
  assert.deepEqual(result.receipt.attempts.map(a => [a.errorKind ?? 'ok', a.waitedMs ?? 0]), [['rate_limit', 20], ['rate_limit', 20], ['ok', 0]]);
  assert.ok(Date.now() - started >= 30);
  // Only two waits per run.
  const always = await run(fake(busy, busy, busy, busy), { maxAttempts: 1 });
  assert.equal(always.receipt.accepted, false);
});

test('a request too large for the model is asked again for names only', async () => {
  const tooLarge = new LlmError('too_large', 'Request too large for model on tokens per minute (TPM): Limit 6000, Requested 9000');
  const namesOnly = { components: clusters.map((c, i) => ({ cluster: c.id, name: `Named ${i}`, role: 'service', description: 'x' })) };
  const client = fake(tooLarge, namesOnly);
  const result = await run(client, { maxAttempts: 1 });
  assert.equal(result.receipt.accepted, true);
  assert.equal(result.receipt.mode, 'name-only');
  assert.match(result.receipt.narrowed, /too large/);
  assert.equal(result.receipt.format, undefined);
  assert.deepEqual(client.calls[1].options.schema.required, ['components']);
  assert.ok(client.calls[1].messages.at(-1).content.length < client.calls[0].messages.at(-1).content.length);
});

test('with a request limit, the answer budget fits it, and a prompt that cannot fit goes out names-only at once', async () => {
  const roomy = fake(delta());
  await run(roomy, { maxRequestTokens: 50_000 });
  const budget = roomy.calls[0].options.maxTokens;
  assert.ok(budget >= 2000 && budget < 50_000, `answer budget ${budget}`);
  const tight = fake({ components: clusters.map((c, i) => ({ cluster: c.id, name: `Named ${i}`, role: 'service', description: 'x' })) });
  const result = await run(tight, { maxRequestTokens: 400 });
  assert.equal(tight.calls.length, 1, 'no wasted refine request');
  assert.equal(result.receipt.mode, 'name-only');
  assert.match(result.receipt.narrowed, /tokens needed/);
});

test('the wait a provider asks for is read from Retry-After or from the message', () => {
  const headers = h => ({ headers: { get: n => h[n.toLowerCase()] ?? null } });
  assert.equal(retryAfter(headers({ 'retry-after': '3' }), ''), 3000);
  assert.equal(retryAfter(headers({}), 'Rate limit reached. Please try again in 7.66s. Visit ...'), 7910);
  assert.equal(retryAfter(headers({}), 'try again in 850ms'), 1100);
  assert.equal(retryAfter(headers({}), 'Please try again in 1m30.5s'), 90750);
  assert.equal(retryAfter(headers({}), 'no hint here'), undefined);
});
