import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STEPS, STEP_KINDS, addOption, answerFeedback, assessmentNote, attentionText, checkDraft, draftFromPath, firstOpenStep, kindLabel,
  learnerState, moveStep, newDraft, newStep, pathStatusTag, payloadFromDraft, problemsByStep, progressText, refGone, removeOption, stepProblemList, struggled,
} from '../src/features/onboarding-view.ts';

const revision = (commit = 'a'.repeat(40)) => ({ commit, snapshotId: 's1', workspaceRevision: 3, pinnedAt: '2026-10-20T00:00:00.000Z' });
const savedPath = {
  id: 'p1', projectId: 'proj', title: 'Week 1', description: 'Start here', status: 'published', revision: 4, updatedAt: '2026-10-24T00:00:00.000Z',
  steps: [
    { id: 'step-aaaaaaaa', kind: 'component', title: 'Billing', body: 'Read it', componentId: 'billing', revision: revision() },
    { id: 'step-bbbbbbbb', kind: 'commit', title: 'The split', body: '', commitTitle: 'Split', revision: revision('b'.repeat(40)) },
    { id: 'step-cccccccc', kind: 'adr', title: 'Why a queue', body: '', adrId: 'adr-1', revision: revision() },
    { id: 'step-dddddddd', kind: 'question', title: 'Check', body: '', question: { prompt: 'Which?', options: ['Orders', 'Billing', 'Shipping'], correctIndex: 1, explanation: 'Billing owns invoices.' }, revision: revision() },
  ],
};
const keys = i => `key-${i}`;

test('the four kinds of step have a label each', () => {
  assert.deepEqual(STEP_KINDS.map(k => k.kind), ['component', 'commit', 'adr', 'question']);
  assert.equal(kindLabel('adr'), 'Design decision');
  assert.equal(kindLabel('question'), 'Question');
});

test('a step that still holds needs no note; one that may not says why', () => {
  assert.equal(assessmentNote(undefined), null);
  assert.equal(assessmentNote({ status: 'current', issues: [] }), null);
  const outdated = assessmentNote({ status: 'outdated', issues: [{ code: 'MAP_CHANGED', message: 'This component changed since the step was written.' }] });
  assert.equal(outdated.level, 'warning');
  assert.equal(outdated.text, 'This component changed since the step was written. The step may describe it as it was.', 'what changed is the step\'s own subject');
  assert.match(assessmentNote({ status: 'outdated', issues: [] }).text, /changed after it was written/);
  const gone = assessmentNote({ status: 'missing', issues: [{ code: 'REF_GONE', message: 'The component this step is about is no longer in the component diagram.' }] });
  assert.equal(gone.text, 'The component this step is about is no longer in the component diagram.');
  const missing = assessmentNote({ status: 'missing', issues: [{ code: 'COMMIT_GONE', message: 'Commit a1b2c3d is no longer in the repository history.' }, { code: 'MAP_CHANGED', message: 'map' }] });
  assert.equal(missing.level, 'error');
  assert.equal(missing.text, 'Commit a1b2c3d is no longer in the repository history.', 'the map change is not repeated here');
  assert.match(assessmentNote({ status: 'missing', issues: [] }).text, /no longer in the repository/);
});

test('a step whose component or decision was removed is told apart from other missing steps', () => {
  assert.equal(refGone(undefined), false);
  assert.equal(refGone({ status: 'current', issues: [] }), false);
  assert.equal(refGone({ status: 'missing', issues: [{ code: 'COMMIT_GONE', message: 'gone' }] }), false);
  assert.equal(refGone({ status: 'missing', issues: [{ code: 'REF_GONE', message: 'gone' }] }), true);
});

test('progress and answers are put into words', () => {
  assert.equal(progressText({ done: 1, total: 4, percent: 25 }), '1 of 4 steps');
  assert.equal(progressText({ done: 0, total: 1, percent: 0 }), '0 of 1 step');
  assert.deepEqual(answerFeedback({ correct: true, attempts: 1 }), { type: 'success', text: 'Correct, on the first try.' });
  assert.match(answerFeedback({ correct: true, attempts: 3 }).text, /after 3 tries/);
  assert.equal(answerFeedback({ correct: false, attempts: 2 }).type, 'error');
});

test('the first step still to do is found, and a finished path has none', () => {
  const step = completed => ({ progress: { completed } });
  assert.equal(firstOpenStep([step(true), step(false), step(false)]), 1);
  assert.equal(firstOpenStep([step(true), step(true)]), -1);
  assert.equal(firstOpenStep([]), -1);
});

test('a mentor is told how many steps need attention, and only when some do', () => {
  assert.equal(attentionText({ outdatedSteps: 0, missingSteps: 0 }), '');
  assert.equal(attentionText({ outdatedSteps: 2, missingSteps: 0 }), '2 may be out of date');
  assert.equal(attentionText({ outdatedSteps: 0, missingSteps: 1 }), '1 step points at something that is gone');
  assert.equal(attentionText({ outdatedSteps: 1, missingSteps: 3 }), '3 steps point at something that is gone, 1 may be out of date');
  assert.deepEqual(pathStatusTag('published'), { color: 'green', label: 'Published' });
  assert.equal(pathStatusTag('draft').label, 'Draft');
});

test('a learner is not started, in progress or finished', () => {
  assert.equal(learnerState({ done: 0, total: 4 }), 'not started');
  assert.equal(learnerState({ done: 2, total: 4 }), 'in progress');
  assert.equal(learnerState({ done: 4, total: 4 }), 'finished');
  assert.equal(learnerState({ done: 0, total: 0 }), 'not started', 'an empty path is never finished');
  assert.equal(struggled(3, false), true);
  assert.equal(struggled(2, false), false);
  assert.equal(struggled(5, true), false, 'someone who got it in the end did not struggle');
});

test('a saved path becomes a draft that remembers its revision and its steps\' ids', () => {
  const draft = draftFromPath(savedPath, keys);
  assert.deepEqual([draft.title, draft.status, draft.expectedRevision], ['Week 1', 'published', 4]);
  assert.deepEqual(draft.steps.map(s => [s.key, s.id, s.kind]), [['key-0', 'step-aaaaaaaa', 'component'], ['key-1', 'step-bbbbbbbb', 'commit'], ['key-2', 'step-cccccccc', 'adr'], ['key-3', 'step-dddddddd', 'question']]);
  assert.equal(draft.steps[1].commit, 'b'.repeat(40), 'a commit step keeps the commit it was pinned to');
  assert.equal(draft.steps[0].commit, '', 'other steps do not borrow the commit of their pin');
  assert.deepEqual(draft.steps[3].question, { prompt: 'Which?', options: ['Orders', 'Billing', 'Shipping'], correctIndex: 1, explanation: 'Billing owns invoices.' });
  assert.ok(draft.steps.every(s => s.repin === false));
});

test('saving an unchanged draft sends back ids, the revision and only what each kind uses', () => {
  const body = payloadFromDraft(draftFromPath(savedPath, keys));
  assert.equal(body.expectedRevision, 4);
  assert.deepEqual(body.steps.map(s => Object.keys(s).sort()), [
    ['body', 'componentId', 'id', 'kind', 'title'],
    ['body', 'commit', 'id', 'kind', 'title'],
    ['adrId', 'body', 'id', 'kind', 'title'],
    ['body', 'id', 'kind', 'question', 'title'],
  ]);
  assert.equal(body.steps[1].commit, 'b'.repeat(40));
  assert.deepEqual(body.steps[3].question.options, ['Orders', 'Billing', 'Shipping']);
});

test('a new draft sends no id and no revision, trims its text, and asks for a re-pin only when told to', () => {
  const draft = { ...newDraft(), title: '  Onboarding  ', description: ' d ', steps: [{ ...newStep('adr', 'k1'), title: ' Why ', adrId: 'adr-1', repin: true }, { ...newStep('commit', 'k2'), title: 'C', commit: ' a1b2c3d ' }] };
  const body = payloadFromDraft(draft);
  assert.deepEqual([body.title, body.description, body.status], ['Onboarding', 'd', 'draft']);
  assert.equal('expectedRevision' in body, false);
  assert.deepEqual(body.steps[0], { kind: 'adr', title: 'Why', body: '', repin: true, adrId: 'adr-1' });
  assert.deepEqual(body.steps[1], { kind: 'commit', title: 'C', body: '', commit: 'a1b2c3d' });
  const blankCommit = payloadFromDraft({ ...newDraft(), steps: [{ ...newStep('commit', 'k'), title: 'C' }] }).steps[0];
  assert.equal('commit' in blankCommit, false, 'an empty commit is left out so an existing step keeps the one it has');
});

test('steps can be moved without changing the list they came from', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveStep(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveStep(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveStep(list, 1, 99), ['a', 'c', 'd', 'b']);
  assert.deepEqual(moveStep(list, 1, -5), ['b', 'a', 'c', 'd']);
  assert.deepEqual(moveStep(list, 3, -1), ['d', 'a', 'b', 'c'], 'a negative place means the start, not counting from the end');
  assert.deepEqual(moveStep(list, 9, 0), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

test('a question holds two to six answers and keeps pointing at the right one', () => {
  let q = { prompt: '?', options: ['a', 'b'], correctIndex: 1, explanation: '' };
  for (let i = 0; i < 10; i++) q = addOption(q);
  assert.equal(q.options.length, 6);
  assert.deepEqual(removeOption({ ...q, options: ['a', 'b', 'c', 'd'], correctIndex: 2 }, 0).correctIndex, 1, 'removing an answer before the right one shifts it');
  assert.equal(removeOption({ ...q, options: ['a', 'b', 'c', 'd'], correctIndex: 1 }, 3).correctIndex, 1, 'removing one after leaves it');
  assert.equal(removeOption({ ...q, options: ['a', 'b', 'c', 'd'], correctIndex: 2 }, 2).correctIndex, 0, 'removing the right answer falls back to the first');
  const two = { prompt: '?', options: ['a', 'b'], correctIndex: 0, explanation: '' };
  assert.equal(removeOption(two, 0), two, 'two answers is the least');
});

test('a draft that is complete has no problems; each gap is named like the server names it', () => {
  assert.deepEqual(checkDraft(draftFromPath(savedPath, keys)), {});
  const draft = {
    ...newDraft(), status: 'published',
    steps: [
      newStep('component', 'k0'),
      { ...newStep('commit', 'k1'), title: 'C' },
      { ...newStep('adr', 'k2'), title: 'A' },
      { ...newStep('question', 'k3'), title: 'Q', question: { prompt: '', options: ['x', 'X'], correctIndex: 5, explanation: '' } },
      { ...newStep('question', 'k4'), title: 'Q2', question: { prompt: 'p', options: ['x', ''], correctIndex: 0, explanation: '' } },
    ],
  };
  assert.deepEqual(Object.keys(checkDraft(draft)).sort(), [
    'steps[0].componentId', 'steps[0].title', 'steps[1].commit', 'steps[2].adrId', 'steps[3].question.correctIndex', 'steps[3].question.options',
    'steps[3].question.prompt', 'steps[4].question.options', 'title',
  ].sort());
  assert.equal(checkDraft({ ...newDraft(), title: 'T', status: 'published' }).steps, 'A published path needs at least one step.');
  assert.deepEqual(checkDraft({ ...newDraft(), title: 'T' }), {}, 'a draft may be empty');
  const many = { ...newDraft(), title: 'T', steps: Array.from({ length: MAX_STEPS + 1 }, (_, i) => ({ ...newStep('adr', `k${i}`), title: 'A', adrId: 'adr-1' })) };
  assert.match(checkDraft(many).steps, /At most 50/);
});

test('an existing commit step needs no commit typed again, a new one does', () => {
  const existing = { ...newStep('commit', 'k'), id: 'step-aaaaaaaa', title: 'C' };
  assert.equal(checkDraft({ ...newDraft(), title: 'T', steps: [existing] })['steps[0].commit'], undefined);
  assert.ok(checkDraft({ ...newDraft(), title: 'T', steps: [{ ...existing, id: undefined }] })['steps[0].commit']);
});

test('problems are split into the path\'s own and each step\'s', () => {
  const problems = problemsByStep({ title: 'Required.', 'steps[0].componentId': 'No such component.', 'steps[0].title': 'Required.', 'steps[3].question.options': 'Two answers are the same.', 'steps[2]': 'Must be an object.' });
  assert.deepEqual(problems.path, { title: 'Required.' });
  assert.deepEqual(problems.steps[0], { componentId: 'No such component.', title: 'Required.' });
  assert.deepEqual(problems.steps[3], { 'question.options': 'Two answers are the same.' });
  assert.deepEqual(problems.steps[2], { _: 'Must be an object.' });
  assert.deepEqual(stepProblemList(problems, 0).sort(), ['No such component.', 'Required.']);
  assert.deepEqual(stepProblemList(problems, 9), []);
  assert.deepEqual(problemsByStep(undefined), { path: {}, steps: {} });
});

test('a fresh step starts blank, with a question ready for when the kind is changed to one', () => {
  const step = newStep('question', 'k');
  assert.deepEqual([step.kind, step.title, step.componentId, step.adrId, step.commit, step.repin], ['question', '', '', '', '', false]);
  assert.deepEqual(step.question, { prompt: '', options: ['', ''], correctIndex: 0, explanation: '' });
  assert.notEqual(newStep('question', 'a').question.options, newStep('question', 'b').question.options, 'steps do not share their lists');
});
