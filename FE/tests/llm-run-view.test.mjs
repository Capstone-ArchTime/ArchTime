import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingStats, hasQuality, resultLabel, runKindNote } from '../src/features/llm-run-view.ts';

const labels = { accepted: 'Accepted', fallback: 'Fallback', failed: 'Failed', cancelled: 'Cancelled' };

test('an ordinary architecture drawing needs no note; the other kinds say what they were', () => {
  assert.equal(runKindNote('refine'), '');
  assert.equal(runKindNote('name-only'), 'names only');
  assert.equal(runKindNote('chat'), 'AI Insights chat');
});

test('a question that got an answer is Answered, a drawing that passed is Accepted', () => {
  assert.equal(resultLabel({ mode: 'chat', status: 'accepted' }, labels), 'Answered');
  assert.equal(resultLabel({ mode: 'refine', status: 'accepted' }, labels), 'Accepted');
  assert.equal(resultLabel({ mode: 'name-only', status: 'accepted' }, labels), 'Accepted');
});

test('a failed question or drawing keeps the usual wording', () => {
  assert.equal(resultLabel({ mode: 'chat', status: 'failed' }, labels), 'Failed');
  assert.equal(resultLabel({ mode: 'refine', status: 'fallback' }, labels), 'Fallback');
});

test('a run that drew an architecture has a quality to show', () => {
  assert.equal(hasQuality({ quality: { score: 0.82, attemptsUsed: 1 } }), true);
  assert.equal(hasQuality({ quality: { score: 0 } }), true, 'a score of zero is still a score');
});

test('a chat run, an empty record or a missing one has no quality to show', () => {
  assert.equal(hasQuality({ quality: null }), false);
  assert.equal(hasQuality({ quality: undefined }), false);
  assert.equal(hasQuality({ quality: {} }), false);
});

test('drawing statistics leave out the questions asked in AI Insights', () => {
  // 10 drawings (8 accepted) and 190 questions (all answered), as the model of the admin's usage table
  const d = drawingStats({ runs: 200, accepted: 198, chatRuns: 190, chatAccepted: 190 });
  assert.deepEqual(d, { runs: 10, accepted: 8, successRate: 0.8 });
});

test('failed questions do not lower the success rate of drawing', () => {
  const d = drawingStats({ runs: 14, accepted: 9, chatRuns: 6, chatAccepted: 1 });
  assert.equal(d.runs, 8);
  assert.equal(d.accepted, 8);
  assert.equal(d.successRate, 1);
});

test('a model that only answered questions has no drawing success rate, not zero', () => {
  assert.equal(drawingStats({ runs: 5, accepted: 5, chatRuns: 5, chatAccepted: 5 }).successRate, null);
  assert.equal(drawingStats({ runs: 0, accepted: 0, chatRuns: 0, chatAccepted: 0 }).successRate, null);
});

test('an older server that sends no chat counts is read as no questions', () => {
  assert.deepEqual(drawingStats({ runs: 4, accepted: 3 }), { runs: 4, accepted: 3, successRate: 0.75 });
});

test('the counts never go below zero', () => {
  const d = drawingStats({ runs: 2, accepted: 1, chatRuns: 5, chatAccepted: 4 });
  assert.equal(d.runs, 0);
  assert.equal(d.accepted, 0);
});
