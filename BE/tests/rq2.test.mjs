import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agreementOf, blindText, buildSheets, finalVerdicts, messagesFor, metricsOf, parseCsv, parseVerdict, postProcess, renderReport, seededShuffle, splitClaims, toCsv,
} from '../src/domain/evaluation/rq2.ts';
import { SYSTEM_PROMPT } from '../src/application/use-cases/llm/ProjectChatUseCase.ts';

// D10 — RQ2 tooling: the three conditions, claim splitting, blind sheets, agreement and metrics.

const project = { name: 'axios', repoUrl: 'https://github.com/axios/axios' };
const msgs = c => messagesFor(c, { project, context: 'SNAPSHOTS: `a1b2c3d`', question: 'What changed?', mentorPrompt: SYSTEM_PROMPT });

test('C0 sees no project data; C1 sees it without labels; C2 is the mentor itself with the same data', () => {
  assert.ok(!msgs('C0')[0].content.includes('PROJECT DATA') && msgs('C0')[0].content.includes('axios'));
  assert.ok(msgs('C1')[0].content.includes('`a1b2c3d`') && !/\[FACT\]|Cite commits/.test(msgs('C1')[0].content));
  assert.ok(msgs('C2')[0].content.startsWith(SYSTEM_PROMPT) && msgs('C2')[0].content.includes('`a1b2c3d`'));
  for (const c of ['C0', 'C1', 'C2']) assert.deepEqual(msgs(c)[1], { role: 'user', content: 'What changed?' });
});

test('only C2 goes through the citation check, as in the app', () => {
  const raw = '[FACT] The fetch adapter was added in `deadbe1`. [FACT] Interceptors moved in `a1b2c3d`.';
  const valid = h => h.startsWith('a1b2c3d');
  assert.equal(postProcess('C1', raw, valid).text, raw);
  assert.equal(postProcess('C1', raw, valid).check, null);
  const c2 = postProcess('C2', raw, valid);
  assert.equal(c2.check.downgraded, 1);
  assert.ok(!c2.text.includes('deadbe1'));
});

test('claims: each labelled segment, else each sentence; headings, list markers and fragments are not claims', () => {
  const claims = splitClaims([
    '## Summary',
    '- [FACT] Axios added a fetch adapter in `a1b2c3d`. [INFERENCE] This suggests a move away from XHR.',
    '`b2c3d4e` [FACT] The core folder grew to 40 files.',
    'The project has three layers. It uses interceptors! Yes.',
    '1. [UNKNOWN] The data does not say why.',
  ].join('\n'));
  assert.deepEqual(claims.map(c => [c.label, c.text, c.citations]), [
    ['FACT', 'Axios added a fetch adapter in `a1b2c3d`.', ['a1b2c3d']],
    ['INFERENCE', 'This suggests a move away from XHR.', []],
    ['FACT', '`b2c3d4e` The core folder grew to 40 files.', ['b2c3d4e']],
    [null, 'The project has three layers.', []],
    [null, 'It uses interceptors!', []],
    ['UNKNOWN', 'The data does not say why.', []],
  ]);
  assert.equal(blindText('[FACT] a  b [INFERENCE] c'), 'a b c');
  // A markdown table: the header and rule rows are layout; each data row is a claim.
  const table = splitClaims('| Commit | Date | Added |\n|---|---|---:|\n| `484aa4f` | 2022-10-04 | 217 |\n| `8e4314b` | 2024-04-28 | 36 |');
  assert.deepEqual(table.map(c => c.citations), [['484aa4f'], ['8e4314b']]);
});

const answers = [
  { repo: 'axios', questionId: 'Q1', question: 'What changed?', answerable: true, expected: 'a commit', condition: 'C0', model: 'm', text: 'Axios moved to fetch in 2023. It is popular.', raw: '', check: null, validCitations: [], usage: null, latencyMs: 1, askedAt: '' },
  { repo: 'axios', questionId: 'Q1', question: 'What changed?', answerable: true, expected: 'a commit', condition: 'C1', model: 'm', text: 'The fetch adapter came in `a1b2c3d`. Files grew to 40.', raw: '', check: null, validCitations: ['a1b2c3d'], usage: null, latencyMs: 1, askedAt: '' },
  { repo: 'axios', questionId: 'Q1', question: 'What changed?', answerable: true, expected: 'a commit', condition: 'C2', model: 'm', text: '[FACT] The fetch adapter came in `a1b2c3d`.\n[INFERENCE] XHR is now legacy code.', raw: '', check: null, validCitations: ['a1b2c3d'], usage: null, latencyMs: 1, askedAt: '' },
  { repo: 'axios', questionId: 'Q9', question: 'How many users?', answerable: false, expected: 'decline', condition: 'C2', model: 'm', text: '[UNKNOWN] The data does not say how many users it has.', raw: '', check: null, validCitations: [], usage: null, latencyMs: 1, askedAt: '' },
];

test('sheets are blind: opaque ids, no condition, no labels, shuffled the same way for the same seed', () => {
  const s = buildSheets(answers, 'seed-1');
  assert.equal(s.claimSheet.length, 7);
  assert.equal(s.answerSheet.length, 4);
  const sheetText = JSON.stringify([s.claimSheet, s.answerSheet]);
  assert.ok(!/C0|C1|C2|\[FACT\]|\[INFERENCE\]|\[UNKNOWN\]/.test(sheetText));
  assert.ok(s.claimSheet.every(r => /^c[0-9a-f]{8}$/.test(r.claim_id) && r.verdict === ''));
  assert.deepEqual(buildSheets(answers, 'seed-1'), s);
  assert.notDeepEqual(buildSheets(answers, 'seed-2').claimSheet.map(r => r.claim_id), s.claimSheet.map(r => r.claim_id));
  const fact = s.claimKey.find(k => k.condition === 'C2' && k.label === 'FACT');
  assert.deepEqual([fact.citations, fact.validCitations], [['a1b2c3d'], ['a1b2c3d']]);
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], 'x'), seededShuffle([1, 2, 3, 4, 5], 'x'));
});

test('sheets survive a round trip through CSV as a spreadsheet saves it', () => {
  const rows = [{ id: 'c1', text: 'He said "hi", then\nleft' }, { id: 'c2', text: 'plain' }];
  const csv = toCsv(rows, ['id', 'text']);
  assert.deepEqual(parseCsv('﻿' + csv), rows);
  assert.deepEqual(parseCsv('id,text\nc3,"a, b"\n\n'), [{ id: 'c3', text: 'a, b' }]);
  assert.deepEqual(['S', 'supported', 'C', 'Contradicted', 'n', 'Not verifiable', '?'].map(parseVerdict), ['S', 'S', 'C', 'C', 'N', 'N', null]);
});

test('agreement, final verdicts with adjudication, and the metrics per condition', () => {
  const s = buildSheets(answers, 'seed-1');
  // C0's claims cannot be checked; C1's cited claim holds and its other one is wrong; C2's FACT and UNKNOWN hold, its INFERENCE cannot be checked.
  const verdictOf = k => (k.condition === 'C0' ? 'N' : k.condition === 'C1' ? (k.citations.length ? 'S' : 'C') : k.label === 'INFERENCE' ? 'N' : 'S');
  const a = s.claimKey.map(k => ({ claim_id: k.claim_id, verdict: verdictOf(k) }));
  // B disagrees on the C1 "Files grew" claim.
  const disputed = s.claimKey.find(k => k.condition === 'C1' && verdictOf(k) === 'C').claim_id;
  const b = a.map(r => (r.claim_id === disputed ? { ...r, verdict: 'S' } : r));
  const ag = agreementOf(a, b);
  assert.deepEqual(ag.disagreements, [disputed]);
  assert.equal(ag.claims.n, 7);
  assert.equal(finalVerdicts(a, b).has(disputed), false, 'pending until adjudicated');
  const verdicts = finalVerdicts(a, b, [{ claim_id: disputed, verdict: 'Contradicted' }]);
  assert.equal(verdicts.get(disputed), 'C');

  const answerSheet = s.answerKey.map(k => ({ answer_id: k.answer_id, refusal: k.questionId === 'Q9' ? 'yes' : 'no', coverage: k.condition === 'C0' ? 'no' : k.condition === 'C1' ? 'partial' : 'yes' }));
  const m = Object.fromEntries(metricsOf({ claimKey: s.claimKey, verdicts, answerKey: s.answerKey, answerSheets: [answerSheet, answerSheet] }).map(x => [x.condition, x]));
  assert.deepEqual([m.C0.unsupportedRate, m.C1.unsupportedRate, m.C2.unsupportedRate], [1, 0.5, 0.3333]);
  assert.deepEqual([m.C1.citationAccuracy, m.C1.citedClaims, m.C2.citationAccuracy], [1, 1, 1]);
  assert.deepEqual([m.C2.factPrecision, m.C2.factClaims, m.C1.factPrecision], [1, 1, null]);
  assert.deepEqual([m.C2.refusalRateUnanswerable, m.C2.refusalRateAnswerable, m.C0.refusalRateUnanswerable], [1, 0, null]);
  assert.deepEqual([m.C0.coverage, m.C1.coverage, m.C2.coverage], [0, 0.5, 1]);
  assert.equal(m.C1.citationValidity, 1);

  const report = renderReport({ metrics: Object.values(m), agreement: ag, pending: 0, models: ['m'], repos: ['axios'] });
  assert.match(report, /\| Unsupported rate \(C \+ N\) \| 100\.0 % \| 50\.0 % \| 33\.3 % \|/);
  assert.match(report, /FACT label precision \| n\/a \(no labels\) \| n\/a \(no labels\) \| 100\.0 % of 1 \|/);
});
