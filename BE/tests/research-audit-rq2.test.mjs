// Research audit (2026-11-24), RQ2: deterministic answer ids and file names, prompt versions, warnings against pooling
// mixed runs, an abstention-robust measure (supported claims per answerable answer), and Gwet's AC1 next to kappa.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agreementOf, answerFileName, answerIdOf, buildSheets, C0_PROMPT, fingerprint, metricsOf, mixedRuns, promptVersionOf, renderReport,
} from '../src/domain/evaluation/rq2.ts';

test('answer ids and file names are deterministic; run 1 keeps the file name it had before repeated runs', () => {
  const slot = { repo: 'react-router', questionId: 'Q3', condition: 'C2' };
  assert.equal(answerIdOf(slot), 'react-router.Q3.C2.r1');
  assert.equal(answerIdOf({ ...slot, run: 3 }), 'react-router.Q3.C2.r3');
  assert.equal(answerFileName(slot), 'react-router.Q3.C2.json');
  assert.equal(answerFileName({ ...slot, run: 1 }), 'react-router.Q3.C2.json');
  assert.equal(answerFileName({ ...slot, run: 2 }), 'react-router.Q3.C2.r2.json');
});

test('the prompt version changes when, and only when, the fixed prompt of the condition changes', () => {
  assert.equal(promptVersionOf('C0', 'mentor v1'), `C0-${fingerprint(C0_PROMPT)}`);
  assert.equal(promptVersionOf('C0', 'mentor v1'), promptVersionOf('C0', 'mentor v2'), 'C0 does not use the mentor prompt');
  assert.notEqual(promptVersionOf('C2', 'mentor v1'), promptVersionOf('C2', 'mentor v2'));
  assert.match(promptVersionOf('C1', 'x'), /^C1-[0-9a-f]{16}$/);
});

test('mixedRuns flags prompt versions, models and project contexts that would be pooled silently', () => {
  const a = (condition, extra = {}) => ({ repo: 'r', condition, model: 'p/m', promptVersion: `${condition}-v1`, contextSha256: condition === 'C0' ? null : 'ctx1', ...extra });
  assert.deepEqual(mixedRuns([a('C0'), a('C1'), a('C2')]), []);
  const warnings = mixedRuns([a('C2'), a('C2', { promptVersion: 'C2-v2' }), a('C1', { model: 'p/other' }), a('C1', { contextSha256: 'ctx2' })]);
  assert.ok(warnings.some(w => /^C2: 2 prompt versions/.test(w)));
  assert.ok(warnings.some(w => /^C1: 2 models/.test(w)));
  assert.ok(warnings.some(w => /^r: C1\/C2 answers built from 2 different project contexts \(ctx1, ctx2\)/.test(w)));
  const md = renderReport({ metrics: [], agreement: { claims: null, refusal: null, disagreements: [] }, pending: 0, models: [], repos: [], warnings });
  assert.match(md, /Warning: these answers mix runs/);
  assert.match(md, /citation accuracy, not validity, is the semantic measure/);
});

const ans = (questionId, condition, text, answerable = true) => ({
  repo: 'r', questionId, question: questionId, answerable, expected: '', condition, run: 1, model: 'm', text, raw: '', check: null,
  validCitations: [], usage: null, latencyMs: 1, askedAt: '',
});

test('a condition that refuses more cannot look better on supported claims per answerable answer', () => {
  // C1 answers both answerable questions with one Supported and one Not-verifiable claim each (unsupported 50 %).
  // C2 refuses Q2 and answers Q1 with one Supported claim (unsupported 0 %) but supports less per answer.
  const list = [
    ans('Q1', 'C1', 'The core module holds forty files. It was probably designed for speed.'),
    ans('Q2', 'C1', 'Commit abc1234 added the router. The team likes routers a lot.'),
    ans('Q1', 'C2', 'The core module holds forty files.'),
    ans('Q2', 'C2', 'The data does not say.'),
  ];
  const s = buildSheets(list, 'seed');
  const verdicts = new Map(s.claimKey.map(k => {
    const text = s.claimSheet.find(r => r.claim_id === k.claim_id).claim;
    return [k.claim_id, /probably|likes|does not say/.test(text) ? 'N' : 'S'];
  }));
  const refusalSheet = s.answerKey.map(k => ({ answer_id: k.answer_id, refusal: k.condition === 'C2' && k.questionId === 'Q2' ? 'yes' : 'no', coverage: '' }));
  const m = Object.fromEntries(metricsOf({ claimKey: s.claimKey, verdicts, answerKey: s.answerKey, answerSheets: [refusalSheet] }).map(x => [x.condition, x]));
  assert.equal(m.C1.unsupportedRate, 0.5);
  assert.equal(m.C2.unsupportedRate, 0.5, 'the refusal sentence itself is judged Not verifiable here');
  assert.deepEqual([m.C1.supportedPerAnswerableAnswer, m.C2.supportedPerAnswerableAnswer], [1, 0.5]);
  assert.deepEqual([m.C1.answeredWithSupport, m.C2.answeredWithSupport], [1, 0.5]);
  assert.equal(m.C2.refusalRateAnswerable, 0.5);
  assert.equal(m.C0.supportedPerAnswerableAnswer, null, 'no answers, no value');
});

test('RQ2 agreement reports Gwet AC1 next to kappa for claim verdicts and refusals', () => {
  const a = [{ claim_id: 'c1', verdict: 'S' }, { claim_id: 'c2', verdict: 'S' }, { claim_id: 'c3', verdict: 'N' }];
  const b = [{ claim_id: 'c1', verdict: 'S' }, { claim_id: 'c2', verdict: 'N' }, { claim_id: 'c3', verdict: 'N' }];
  const ra = [{ answer_id: 'a1', refusal: 'no' }, { answer_id: 'a2', refusal: 'no' }];
  const ag = agreementOf(a, b, ra, ra);
  assert.equal(ag.claimsAC1.n, 3);
  assert.equal(ag.claimsAC1.categories, 3, 'the scale is S, C, N even when C was never used');
  assert.equal(ag.refusalAC1.ac1, 1);
  assert.equal(ag.refusal.kappa, null, 'kappa is undefined when both annotators always say no; AC1 is not');
});
