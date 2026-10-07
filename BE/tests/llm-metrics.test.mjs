import test from 'node:test';
import assert from 'node:assert/strict';
import { modelStats, modularity, normalizeWeights, QUALITY_WEIGHTS, runCost, runQuality, scoreModels, SCORE_PRESETS, stability, modeFor } from '../src/domain/architecture/llm/metrics.ts';
import { sumUsage } from '../src/domain/architecture/llm/types.ts';
import { buildRun, ratedQuality, statusOf } from '../src/infrastructure/services/LlmRunService.ts';
import { seal, unseal } from '../src/infrastructure/llm/secrets.ts';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// Two triangles joined by one edge: the natural split has modularity 5/14.
const FILES = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'];
const EDGES = [['a1', 'a2'], ['a2', 'a3'], ['a1', 'a3'], ['b1', 'b2'], ['b2', 'b3'], ['b1', 'b3'], ['a1', 'b1']].map(([source, target]) => ({ source, target }));
const split = new Map(FILES.map(f => [f, f[0]]));

test('modularity: textbook value, direction and duplicates ignored, all-in-one is zero', () => {
  close(modularity(FILES, EDGES, split), 5 / 14);
  close(modularity(FILES, [...EDGES, { source: 'a2', target: 'a1' }, { source: 'a1', target: 'a1' }], split), 5 / 14);
  close(modularity(FILES, EDGES, new Map(FILES.map(f => [f, 'x']))), 0);
  assert.ok(modularity(FILES, EDGES, new Map(FILES.map((f, i) => [f, String(i % 2)]))) < 5 / 14, 'a worse split scores lower');
  assert.equal(modularity(FILES, [], split), 0);
});

test('run quality: zero without a verified answer, full marks for a clean first-try answer', () => {
  const base = { accepted: true, mode: 'refine', attemptsUsed: 1, validation: { errors: 0, warnings: 0 }, modularity: 0.4, baselineModularity: 0.4, roles: ['service', 'controller'], movedRatio: 0.1, maxMoveRatio: 0.4 };
  assert.equal(runQuality(base).score, 1);
  assert.equal(runQuality(base).version, 2);
  assert.equal(runQuality({ ...base, accepted: false }).score, 0);
  // Without the structure parts the weights of V, M, R, E, B (0.60 in total) are scaled up to 1.
  const third = runQuality({ ...base, attemptsUsed: 3 });
  close(third.E, 0.3333, 1e-4);
  close(third.score, 1 - (0.10 / 0.60) * (2 / 3), 1e-3);
  // Half the roles unknown, two warnings, cohesion halved, moved 30% of files when 20% is free and 40% is the cap.
  const q = runQuality({ ...base, roles: ['service', 'other'], validation: { errors: 0, warnings: 2 }, modularity: 0.2, movedRatio: 0.3 });
  assert.deepEqual([q.R, q.V, q.M, q.B], [0.5, 0.9, 0.5, 0.5]);
  close(q.score, (0.20 * 0.9 + 0.15 * 0.5 + 0.10 * 0.5 + 0.10 + 0.05 * 0.5) / 0.60, 1e-4);
});

test('run quality v2: grounding, acyclicity, layering and balance count, weighted as documented', () => {
  const base = { accepted: true, mode: 'refine', attemptsUsed: 1, validation: { errors: 0, warnings: 0 }, modularity: 0.4, baselineModularity: 0.4, roles: ['service'], movedRatio: 0, maxMoveRatio: 0.4 };
  const all = runQuality({ ...base, grounding: 1, acyclicity: 1, layering: 1, balance: 1 });
  assert.equal(all.score, 1);
  const q = runQuality({ ...base, grounding: 0.5, acyclicity: 0.75, layering: 0, balance: 1 });
  assert.deepEqual([q.G, q.C, q.L, q.Bal], [0.5, 0.75, 0, 1]);
  close(q.score, 1 - 0.20 * 0.5 - 0.08 * 0.25 - 0.07 * 1, 1e-4);
  const sum = Object.values(QUALITY_WEIGHTS).reduce((a, b) => a + b, 0);
  close(sum, 1, 1e-9);
});

test('run quality: a names-only answer is not judged on structure it could not change', () => {
  const q = runQuality({ accepted: true, mode: 'name-only', attemptsUsed: 1, validation: { errors: 0, warnings: 0 }, modularity: 0, baselineModularity: 0.5, roles: ['other', 'service'], maxMoveRatio: 0.4, grounding: 1 });
  assert.equal(q.M, 1);
  close(q.score, (0.20 + 0.10 * 0.5 + 0.10 + 0.20) / 0.60, 1e-3);
});

test('cost: per-million pricing, cached input at its own price, no price means free', () => {
  const pricing = { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, currency: 'USD' };
  close(runCost({ inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0 }, pricing), 4.5);
  close(runCost({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 500_000 }, pricing), 1.5 + 0.15);
  close(runCost({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 500_000 }, { ...pricing, cacheReadPerMTok: undefined }), 3);
  assert.equal(runCost({ inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 }, null), 0);
});

test('usage totals add every attempt and remember an estimate', () => {
  const t = sumUsage([{ usage: { inputTokens: 100, outputTokens: 20, estimated: false } }, {}, { usage: { inputTokens: 50, outputTokens: 5, cacheReadTokens: 40, reasoningTokens: 3, estimated: true } }]);
  assert.deepEqual(t, { inputTokens: 150, outputTokens: 25, cacheReadTokens: 40, reasoningTokens: 3, totalTokens: 175, estimated: true });
});

const run = (over = {}) => ({ status: 'accepted', attemptsUsed: 1, filesSent: 100, quality: 0.9, latencyMs: 10_000, totalTokens: 8_000, cost: 0.05, ...over });

test('model stats: rates, per-100-file medians, cost per success; cancelled runs ignored', () => {
  const s = modelStats([
    run(), run({ attemptsUsed: 2, filesSent: 200, latencyMs: 30_000, totalTokens: 20_000 }),
    run({ status: 'fallback', errorKind: 'timeout', quality: 0, latencyMs: 20_000 }),
    run({ status: 'cancelled', latencyMs: 999_999 }),
  ]);
  assert.equal(s.n, 3);
  close(s.successRate, 2 / 3);
  close(s.firstPassRate, 1 / 3);
  close(s.providerErrorRate, 1 / 3);
  assert.equal(s.latencyPer100, 12_500); // accepted runs only: medians of 10k and 15k per 100 files
  assert.equal(s.tokensPer100, 9_000);
  close(s.costPerSuccess, 0.15 / 2);
  assert.equal(s.latencyP95Ms, 30_000);
  assert.deepEqual(modelStats([]).n, 0);
  assert.equal(modelStats([run({ status: 'fallback' })]).costPerSuccess, Infinity);
});

test('stability rewards success and steady latency', () => {
  assert.equal(stability({ successRate: 1, firstPassRate: 1, providerErrorRate: 0, latencyCV: 0 }), 1);
  assert.equal(stability({ successRate: 0, firstPassRate: 0, providerErrorRate: 1, latencyCV: 5 }), 0);
});

test('scores: best model recommended; latency, cost and tokens are relative to the best; gates apply', () => {
  const many = (n, over) => Array.from({ length: n }, () => run(over));
  const candidates = [
    { id: 'fast-cheap', enabled: true, health: 'up', stats: modelStats(many(10, { quality: 0.7, latencyMs: 5_000, cost: 0.01, totalTokens: 6_000 })) },
    { id: 'accurate', enabled: true, health: 'up', stats: modelStats(many(10, { quality: 0.95, latencyMs: 20_000, cost: 0.08, totalTokens: 9_000 })) },
    { id: 'flaky', enabled: true, health: 'up', stats: modelStats([...many(2), ...many(8, { status: 'fallback', errorKind: 'rate_limit', quality: 0 })]) },
    { id: 'new', enabled: true, health: 'up', stats: modelStats(many(1, { quality: 1, latencyMs: 1_000, cost: 0.001 })) },
    { id: 'off', enabled: false, health: 'up', stats: modelStats(many(10, { quality: 1 })) },
    { id: 'down', enabled: true, health: 'down', stats: modelStats(many(10, { quality: 1 })) },
  ];
  const byId = Object.fromEntries(scoreModels(candidates).map(s => [s.id, s]));
  assert.equal(byId['fast-cheap'].components.latency, 0.2, 'the 1-run model is fastest; others are relative to it');
  assert.ok(byId.new.reasons.some(r => /needs 3/.test(r)) && !byId.new.eligible);
  assert.ok(byId.flaky.reasons.some(r => /success rate 20%/.test(r)));
  assert.deepEqual(byId.off.reasons, ['disabled']);
  assert.deepEqual(byId.down.reasons, ['health check failing']);
  const recommended = Object.values(byId).filter(s => s.recommended).map(s => s.id);
  assert.equal(recommended.length, 1);
  assert.ok(['fast-cheap', 'accurate'].includes(recommended[0]));
  // The preset decides between speed/price and quality.
  const quality = scoreModels(candidates, SCORE_PRESETS.quality).find(s => s.recommended).id;
  const budget = scoreModels(candidates, SCORE_PRESETS.budget).find(s => s.recommended).id;
  assert.equal(quality, 'accurate');
  assert.equal(budget, 'fast-cheap');
  assert.ok(byId.accurate.confident && !byId.new.confident);
});

test('scores: a model that fails at once is not rewarded for being fast and free', () => {
  // Regression: an unreachable model answered in 7 ms with 0 tokens and outranked a working one.
  const broken = { id: 'broken', enabled: true, stats: modelStats([run({ status: 'fallback', errorKind: 'network', quality: 0, latencyMs: 7, totalTokens: 0, cost: 0 })]) };
  const working = { id: 'working', enabled: true, stats: modelStats([run({ quality: 0.94, latencyMs: 15_000, totalTokens: 3_119, filesSent: 24, cost: 0.0006 })]) };
  const [b, w] = scoreModels([broken, working], SCORE_PRESETS.balanced, { minRuns: 1 });
  assert.deepEqual([b.components.latency, b.components.cost, b.components.tokens], [0, 0, 0]);
  assert.deepEqual([w.components.latency, w.components.cost, w.components.tokens], [1, 1, 1]);
  assert.ok(w.score > b.score + 30, `${w.score} vs ${b.score}`);
  assert.ok(w.recommended && !b.recommended);
});

test('scores: few runs are pulled to the average, and a benchmark can rank single runs', () => {
  const lucky = { id: 'lucky', enabled: true, stats: modelStats([run({ quality: 1 })]) };
  const steady = { id: 'steady', enabled: true, stats: modelStats(Array.from({ length: 20 }, () => run({ quality: 0.6 }))) };
  const [l] = scoreModels([lucky, steady]);
  assert.ok(l.components.quality < 0.8, `one perfect run must not count as perfect (${l.components.quality})`);
  const single = scoreModels([lucky, { ...steady, stats: modelStats([run({ quality: 0.6 })]) }], SCORE_PRESETS.balanced, { minRuns: 1 });
  assert.equal(single.find(s => s.recommended).id, 'lucky');
});

test('weights are normalised and invalid ones fall back to the preset', () => {
  const w = normalizeWeights({ quality: 2, stability: 1, latency: 1, cost: 0, tokens: 0 });
  close(w.quality, 0.5);
  close(normalizeWeights({ quality: -1, stability: 'x' }).stability, SCORE_PRESETS.balanced.stability);
  assert.deepEqual(normalizeWeights({ quality: 0, stability: 0, latency: 0, cost: 0, tokens: 0 }), SCORE_PRESETS.balanced);
  assert.equal(modeFor(400, 400), 'refine');
  assert.equal(modeFor(401, 400), 'name-only');
});

test('a recorded run carries usage, cost, quality and why it ended', () => {
  const comps = (groups, role = 'service') => groups.map((g, i) => ({ id: `c${i}`, name: `C${i}`, role, label: 'INFERENCE', description: '', memberIds: g }));
  const receipt = {
    mode: 'refine', provider: 'anthropic', model: 'claude-x', external: true, filesSent: 6, accepted: true, movedRatio: 0,
    attempts: [
      { n: 1, ok: false, issues: [{ code: 'M002', message: '' }, { code: 'M002', message: '' }], usage: { inputTokens: 1000, outputTokens: 200, estimated: false }, latencyMs: 900 },
      { n: 2, ok: true, issues: [], usage: { inputTokens: 1200, outputTokens: 300, estimated: false }, latencyMs: 1100 },
    ],
  };
  receipt.usage = sumUsage(receipt.attempts);
  receipt.latencyMs = 2000;
  const row = buildRun({
    projectId: 'p', snapshotId: 's', userId: 'u', jobId: 'j', purpose: 'user', receipt, files: FILES, edges: EDGES,
    initial: comps([['a1', 'a2', 'a3'], ['b1', 'b2', 'b3']]), components: comps([['a1', 'a2', 'a3'], ['b1', 'b2', 'b3']]),
    validation: { ok: true, issues: [{ severity: 'warning', code: 'V002' }] }, maxMoveRatio: 0.4, wallMs: 2500,
    model: { modelId: 'm1', modelKey: 'claude-x', pricing: { inputPerMTok: 3, outputPerMTok: 15, currency: 'USD' } },
  });
  assert.equal(row.status, 'accepted');
  assert.deepEqual(row.usage, { inputTokens: 2200, outputTokens: 500, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 2700, estimated: false });
  close(row.cost.amount, (2200 * 3 + 500 * 15) / 1e6);
  assert.deepEqual(row.attempts[0].issueCodes, ['M002']);
  assert.equal(row.quality.attemptsUsed, 2);
  assert.equal(row.quality.M, 1);
  assert.equal(row.quality.warnings, 1);
  assert.ok(row.quality.score > 0.8 && row.quality.score < 1);
  assert.equal(row.errorKind, undefined);

  const failed = { ...receipt, accepted: false, fallbackReason: 'auth: bad key', attempts: [{ n: 1, ok: false, issues: [{ code: 'M000', message: '' }], errorKind: 'auth' }] };
  assert.equal(statusOf(failed), 'fallback');
  assert.equal(statusOf({ ...failed, fallbackReason: 'cancelled' }), 'cancelled');
  const failedRow = buildRun({ projectId: 'p', snapshotId: 's', purpose: 'user', receipt: failed, files: FILES, edges: EDGES, initial: [], components: [], validation: { ok: true, issues: [] }, maxMoveRatio: 0.4, wallMs: 1, model: { modelId: null, modelKey: 'env:x', pricing: null } });
  assert.equal(failedRow.errorKind, 'auth');
  assert.equal(failedRow.quality.score, 0);
  assert.equal(failedRow.cost.amount, 0);
  assert.equal(failedRow.userId, 'system');
});

test('user feedback counts for a fifth of quality', () => {
  assert.equal(ratedQuality(0.5), 0.5);
  close(ratedQuality(0.5, { rating: 1 }), 0.6);
  close(ratedQuality(0.5, { rating: 0 }), 0.4);
});

test('API keys are sealed with a fresh IV and only the last four characters stay readable', () => {
  const before = process.env.LLM_SECRET_KEY;
  process.env.LLM_SECRET_KEY = 'test-secret';
  try {
    const a = seal('sk-ant-1234567890'), b = seal('sk-ant-1234567890');
    assert.equal(a.last4, '7890');
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.ok(!a.ciphertext.includes('sk-ant'));
    assert.equal(unseal(a), 'sk-ant-1234567890');
    process.env.LLM_SECRET_KEY = 'another-secret';
    assert.throws(() => unseal(a), /could not be decrypted/);
  } finally {
    if (before === undefined) delete process.env.LLM_SECRET_KEY; else process.env.LLM_SECRET_KEY = before;
  }
});
