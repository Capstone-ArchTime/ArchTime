import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENTOR_QUESTION_MAX, adrLabel, componentContext, decisionContext, learningHref, mentorHref, mentorQuestion, openingWorkspace, pathToContinue, readMentorParams, sourceItems,
} from '../src/features/onboarding-context.ts';

const decision = (id, number, status, componentIds, extra = {}) => ({
  id, number, title: `Decision ${number}`, status, context: 'Spikes.', decision: 'Queue it.', alternatives: 'Direct calls.', consequences: 'Delays.', componentIds, sources: [], ...extra,
});
const refs = {
  components: [
    { id: 'billing', name: 'Billing', kind: 'Service', description: 'Owns invoices.' },
    { id: 'orders', name: 'Orders', kind: 'Service', description: '' },
    { id: 'audit', name: 'Audit', kind: 'Library', description: '' },
  ],
  dependencies: [
    { id: 'd1', source: 'orders', target: 'billing', label: 'creates invoices' },
    { id: 'd2', source: 'billing', target: 'audit', label: 'logs' },
    { id: 'd3', source: 'audit', target: 'billing', label: '' },
    { id: 'd4', source: 'billing', target: 'removed', label: 'old link' },
    { id: 'd5', source: 'orders', target: 'audit', label: 'unrelated' },
  ],
  decisions: [
    decision('adr-3', 3, 'Accepted', ['billing', 'orders']),
    decision('adr-1', 1, 'Accepted', ['billing']),
    decision('adr-2', 2, 'Proposed', ['billing']),
    decision('adr-4', 4, 'Deprecated', ['billing']),
    decision('adr-5', 5, 'Accepted', ['orders']),
  ],
};

test('ADRs are numbered with three digits', () => {
  assert.equal(adrLabel(3), 'ADR-003');
  assert.equal(adrLabel(1234), 'ADR-1234');
});

test("a component step shows the component's dependencies both ways and the Accepted decisions about it", () => {
  const context = componentContext(refs, 'billing');
  assert.equal(context.component.description, 'Owns invoices.');
  assert.deepEqual(context.incoming, [{ id: 'audit', name: 'Audit', label: '' }, { id: 'orders', name: 'Orders', label: 'creates invoices' }]);
  assert.deepEqual(context.outgoing, [{ id: 'audit', name: 'Audit', label: 'logs' }, { id: 'removed', name: 'removed', label: 'old link' }], 'a removed component reads by its id');
  assert.deepEqual(context.decisions, [{ id: 'adr-1', label: 'ADR-001', title: 'Decision 1' }, { id: 'adr-3', label: 'ADR-003', title: 'Decision 3' }], 'Proposed and Deprecated ones are left out');
  assert.equal(componentContext(refs, 'ghost'), null);
  assert.equal(componentContext(refs, undefined), null);
  assert.deepEqual(componentContext(refs, 'orders').incoming, []);
});

test("an ADR step shows the components it concerns and its sources; only commits link anywhere", () => {
  const sources = [
    { kind: 'commit', ref: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', title: 'Split billing', date: '2026-09-01T00:00:00.000Z' },
    { kind: 'snapshot', ref: '66f0000000000000000000aa', title: 'Snapshot of the split' },
    { kind: 'evidence', ref: '66f0000000000000000000bb', title: 'Billing gained a queue' },
    { kind: 'approval', ref: '66f0000000000000000000cc', title: 'Approved by the team' },
  ];
  const withSources = { ...refs, decisions: [decision('adr-9', 9, 'Accepted', ['billing', 'gone'], { sources })] };
  const context = decisionContext('proj 1', withSources, 'adr-9');
  assert.equal(context.label, 'ADR-009');
  assert.equal(context.decision.alternatives, 'Direct calls.');
  assert.deepEqual(context.components, [{ id: 'billing', name: 'Billing' }, { id: 'gone', name: 'gone' }]);
  assert.deepEqual(context.sources.map(s => [s.label, s.href]), [
    ['Commit a1b2c3d', '/evidence?projectId=proj%201&commit=a1b2c3d'],
    ['Snapshot', null], ['Evidence', null], ['Approved request', null],
  ]);
  assert.equal(context.sources[0].date, '2026-09-01T00:00:00.000Z');
  assert.equal(context.sources[3].title, 'Approved by the team');
  assert.equal(decisionContext('p', refs, 'adr-404'), null);
  assert.deepEqual(sourceItems('p', []), []);
});

test('the mentor question is about the step, and a check question asks for help, not the answer', () => {
  assert.match(mentorQuestion({ kind: 'component', title: 'Meet billing', componentName: 'Billing' }), /^What does the Billing component do in this workspace\?/);
  assert.match(mentorQuestion({ kind: 'component', title: 'Meet billing' }), /the Meet billing component/, 'a component that is gone falls back to the step title');
  assert.match(mentorQuestion({ kind: 'adr', title: 'Why', decision: { label: 'ADR-003', title: 'Use a queue' } }), /^Why was ADR-003 "Use a queue" decided\?/);
  assert.match(mentorQuestion({ kind: 'adr', title: 'Why a queue' }), /the design decision "Why a queue"/);
  assert.equal(mentorQuestion({ kind: 'commit', title: 'The split', commit: { hash: 'a1b2c3d4e5f6', title: 'Split billing' } }), 'What changed in the architecture in commit a1b2c3d ("Split billing"), and why?');
  assert.equal(mentorQuestion({ kind: 'commit', title: 'The split', commit: { hash: 'a1b2c3d4e5f6' } }), 'What changed in the architecture in commit a1b2c3d, and why?');
  assert.match(mentorQuestion({ kind: 'commit', title: 'The split' }), /the commit "The split"/);
  const help = mentorQuestion({ kind: 'question', title: 'Check', prompt: 'Which component owns invoices?' });
  assert.match(help, /without telling me the answer: Which component owns invoices\?$/);
  assert.equal(mentorQuestion({ kind: 'question', title: 'Check', prompt: 'x'.repeat(5000) }).length, MENTOR_QUESTION_MAX);
});

test('the mentor link carries the workspace and the question, and Insights reads them back', () => {
  const href = mentorHref('proj&1', 'What does "Billing" do? 100% & more');
  assert.ok(href.startsWith('/insights?'));
  assert.deepEqual(readMentorParams(href.slice('/insights'.length)), { projectId: 'proj&1', question: 'What does "Billing" do? 100% & more' });
  assert.deepEqual(readMentorParams(''), { projectId: null, question: '' });
  assert.deepEqual(readMentorParams('?projectId=&q='), { projectId: null, question: '' });
  assert.equal(readMentorParams(`?q=${'y'.repeat(5000)}`).question.length, MENTOR_QUESTION_MAX);
  assert.equal(new URLSearchParams(mentorHref('p', 'z'.repeat(5000)).split('?')[1]).get('q').length, MENTOR_QUESTION_MAX);
});

test('Insights opens on the step\'s workspace, and never sends its question to another one', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(openingWorkspace(list, { projectId: 'b', question: 'What does Billing do?' }), { projectId: 'b', question: 'What does Billing do?', note: '' });
  // Opened plainly: the first workspace, nothing to explain.
  assert.deepEqual(openingWorkspace(list, { projectId: null, question: '' }), { projectId: 'a', question: '', note: '' });
  // The step's workspace is not there (beyond the list, or no longer open to the learner): the question is dropped and said so.
  const gone = openingWorkspace(list, { projectId: 'zzz', question: 'What does Billing do?' });
  assert.equal(gone.projectId, 'a');
  assert.equal(gone.question, '');
  assert.match(gone.note, /not available/);
  assert.match(gone.note, /question was not filled in/);
  assert.match(openingWorkspace(list, { projectId: 'zzz', question: '' }).note, /not available/);
  assert.deepEqual(openingWorkspace([], { projectId: 'zzz', question: 'Q' }).projectId, '');
});

const myPath = (pathId, nextStep, extra = {}) => ({
  pathId, projectId: 'proj', projectName: 'Shop', title: pathId, description: '', assignedAt: '', lastActivityAt: '', done: 1, total: 4, percent: 25, nextStep, ...extra,
});

test('the path to continue is the most recently touched one not finished, and finished ones never count', () => {
  const next = { id: 'step-1', title: 'Billing', kind: 'component', index: 1 };
  assert.equal(pathToContinue([]), null);
  assert.equal(pathToContinue([myPath('done', null, { done: 4, percent: 100 })]), null);
  const picked = pathToContinue([myPath('done', null), myPath('recent', next), myPath('older', next)]);
  assert.equal(picked.path.pathId, 'recent');
  assert.equal(picked.others, 1);
  assert.equal(pathToContinue([myPath('only', next)]).others, 0);
});

test('a learning link can open one step', () => {
  assert.equal(learningHref('p 1', 'path/2'), '/learning/p%201/path%2F2');
  assert.equal(learningHref('p', 'q', 'step-abc'), '/learning/p/q?step=step-abc');
});
