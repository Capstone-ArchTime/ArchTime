import test from 'node:test';
import assert from 'node:assert/strict';
import { JiraExportError, MSG22, parseJiraExport } from '../src/domain/tasks/jiraExport.ts';

// T2 / RF-07 (BR-23, BR-25): JiraExportParser reads a Jira JSON export (the issue search format: { issues: [{ key,
// fields }] }) into tasks (key, summary, status, assignee, story points, sprint) and sprints. One task without a key
// rejects the whole file with MSG22: nothing of a bad file is imported. Written before the parser.

const sprintField = (id, name, state, extra = {}) => ({ id, name, state, startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-14T00:00:00.000Z', ...extra });
const issue = (key, fields = {}) => ({
  key,
  fields: {
    summary: `Summary of ${key}`,
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    assignee: { displayName: 'Truong', emailAddress: 'truong@example.com' },
    customfield_10016: 3,
    customfield_10020: [sprintField(7, 'Sprint 2', 'active')],
    ...fields,
  },
});
const exportOf = (...issues) => JSON.stringify({ issues });

const rejects = (input, check) => {
  assert.throws(() => parseJiraExport(input), err => {
    assert.ok(err instanceof JiraExportError, `expected JiraExportError, got ${err}`);
    check?.(err);
    return true;
  });
};

test('a valid export gives each task its key, summary, status, assignee, story points and sprint', () => {
  const { tasks, sprints } = parseJiraExport(exportOf(issue('ARCH-12')));
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0], {
    key: 'ARCH-12',
    summary: 'Summary of ARCH-12',
    status: 'In Progress',
    statusCategory: 'in-progress',
    assignee: 'Truong',
    storyPoints: 3,
    sprint: 'jira:7',
  });
  assert.deepEqual(sprints, [{ id: 'jira:7', name: 'Sprint 2', state: 'active', startDate: new Date('2026-11-01T00:00:00.000Z'), endDate: new Date('2026-11-14T00:00:00.000Z') }]);
});

test('many tasks keep the order of the file and share one record per sprint', () => {
  const { tasks, sprints } = parseJiraExport(exportOf(
    issue('ARCH-1'),
    issue('ARCH-2', { status: { name: 'Done', statusCategory: { key: 'done' } } }),
    issue('ARCH-3', { customfield_10020: [sprintField(8, 'Sprint 3', 'future')] }),
  ));
  assert.deepEqual(tasks.map(t => t.key), ['ARCH-1', 'ARCH-2', 'ARCH-3']);
  assert.equal(tasks[1].statusCategory, 'done');
  assert.deepEqual(sprints.map(s => s.name), ['Sprint 2', 'Sprint 3']);
});

test('MSG22: one task without a key rejects the whole file, naming the task', () => {
  for (const missing of [undefined, '', '   ', null]) {
    rejects(exportOf(issue('ARCH-1'), { ...issue('x'), key: missing }), err => {
      assert.equal(err.messageId, MSG22);
      assert.equal(err.taskIndex, 2);
      assert.match(err.message, /task 2/i);
      assert.match(err.message, /nothing was imported/i);
    });
  }
});

test('a file that is not JSON, or not a Jira export, is refused with a reason', () => {
  rejects('{ "issues": [', err => assert.match(err.message, /not valid JSON/i));
  rejects('', err => assert.match(err.message, /empty/i));
  rejects(JSON.stringify({ projects: [] }), err => assert.match(err.message, /issues/i));
  rejects(JSON.stringify('just a string'), err => assert.match(err.message, /issues/i));
  rejects(JSON.stringify({ issues: [42] }), err => assert.match(err.message, /task 1/i));
});

test('missing optional fields become null: no status, assignee, story points or sprint', () => {
  const { tasks, sprints } = parseJiraExport(exportOf({ key: 'ARCH-9', fields: { summary: 'Only a summary' } }));
  assert.deepEqual(tasks[0], { key: 'ARCH-9', summary: 'Only a summary', status: null, statusCategory: 'todo', assignee: null, storyPoints: null, sprint: null });
  assert.deepEqual(sprints, []);
  // A task with no fields at all still has its key; the summary falls back to the empty string.
  assert.equal(parseJiraExport(exportOf({ key: 'ARCH-10' })).tasks[0].summary, '');
});

test('an export with no tasks is refused, so an empty file cannot mark every task removed', () => {
  rejects(exportOf(), err => assert.match(err.message, /no tasks/i));
  rejects(JSON.stringify([]), err => assert.match(err.message, /no tasks/i));
});

test('fields of the wrong type reject the file instead of being dropped silently', () => {
  rejects(exportOf(issue('ARCH-1', { summary: 42 })), err => assert.match(err.message, /ARCH-1.*summary/i));
  rejects(exportOf(issue('ARCH-1', { customfield_10016: 'three' })), err => assert.match(err.message, /story points/i));
  rejects(exportOf(issue('ARCH-1', { customfield_10016: -1 })), err => assert.match(err.message, /story points/i));
  rejects(exportOf(issue('ARCH-1', { status: 7 })), err => assert.match(err.message, /status/i));
  rejects(exportOf(issue('ARCH-1', { assignee: ['a'] })), err => assert.match(err.message, /assignee/i));
  rejects(exportOf({ key: 42, fields: {} }), err => assert.match(err.message, /key/i));
  rejects(exportOf({ key: 'not a key!', fields: {} }), err => assert.match(err.message, /key/i));
  rejects(exportOf(issue('ARCH-1'), issue('ARCH-1')), err => assert.match(err.message, /ARCH-1.*twice/i));
});

test('sprint: the active sprint of a carried-over task wins, else the last one; legacy Jira Server strings are read', () => {
  const carried = parseJiraExport(exportOf(issue('ARCH-1', { customfield_10020: [sprintField(1, 'Sprint 1', 'closed'), sprintField(2, 'Sprint 2', 'active'), sprintField(3, 'Sprint 3', 'future')] })));
  assert.equal(carried.tasks[0].sprint, 'jira:2');
  assert.deepEqual(carried.sprints.map(s => s.id), ['jira:1', 'jira:2', 'jira:3']);

  const last = parseJiraExport(exportOf(issue('ARCH-1', { customfield_10020: [sprintField(1, 'Sprint 1', 'closed'), sprintField(3, 'Sprint 3', 'closed')] })));
  assert.equal(last.tasks[0].sprint, 'jira:3');

  const legacy = 'com.atlassian.greenhopper.service.sprint.Sprint@1a2b[id=12,rapidViewId=3,state=ACTIVE,name=Sprint Alpha,startDate=2026-11-01T08:00:00.000Z,endDate=2026-11-15T08:00:00.000Z,completeDate=<null>,sequence=12]';
  const server = parseJiraExport(exportOf(issue('ARCH-1', { customfield_10020: [legacy] })));
  assert.equal(server.tasks[0].sprint, 'jira:12');
  assert.deepEqual(server.sprints[0], { id: 'jira:12', name: 'Sprint Alpha', state: 'active', startDate: new Date('2026-11-01T08:00:00.000Z'), endDate: new Date('2026-11-15T08:00:00.000Z') });

  rejects(exportOf(issue('ARCH-1', { customfield_10020: [{ id: 5 }] })), err => assert.match(err.message, /sprint/i));
});

test('story points and sprint are found by field name when the export carries "names" (expand=names)', () => {
  const file = JSON.stringify({
    names: { customfield_10099: 'Story Points', customfield_10101: 'Sprint' },
    issues: [{ key: 'ARCH-5', fields: { summary: 's', customfield_10099: 5, customfield_10101: [sprintField(4, 'Sprint 4', 'active')] } }],
  });
  const { tasks } = parseJiraExport(file);
  assert.equal(tasks[0].storyPoints, 5);
  assert.equal(tasks[0].sprint, 'jira:4');
});

test('team task ids without a dash (T22) are valid keys; keys are trimmed and upper-cased', () => {
  const { tasks } = parseJiraExport(exportOf(issue('T22'), issue(' arch-7 ')));
  assert.deepEqual(tasks.map(t => t.key), ['T22', 'ARCH-7']);
});

test('the parser accepts an already parsed object as well as the text of the file', () => {
  assert.equal(parseJiraExport({ issues: [issue('ARCH-1')] }).tasks.length, 1);
});

// ── DS-07b: "refused with the line of the bad task" ──────────────────────────
import { issueLines } from '../src/domain/tasks/jiraExport.ts';

test('DS-07b: a refusal names the line of the file where the bad task starts', () => {
  const text = '{\n  "issues": [\n    { "key": "ARCH-1", "fields": { "summary": "a" } },\n    { "fields": { "summary": "no key" } }\n  ]\n}';
  rejects(text, err => {
    assert.equal(err.messageId, MSG22);
    assert.equal(err.line, 4);
    assert.match(err.message, /task 2 \(line 4\)/);
  });
  // A parsed object has no lines: the task position alone is given.
  rejects({ issues: [issue('ARCH-1'), { fields: {} }] }, err => assert.equal(err.line, null));
});

test('the line scanner skips brackets inside strings, reads a root array, and counts blank lines', () => {
  assert.deepEqual(issueLines('{"issues":[{"key":"A-1"},\n{"key":"A-2","s":"],[,{"},\n\n {}]}'), [1, 2, 4]);
  assert.deepEqual(issueLines('[\n {"key":"A-1"},\n {}\n]'), [2, 3]);
  assert.deepEqual(issueLines('{"names":{"x":"issues"},"meta":[1,2],"issues":[\n{}]}'), [2]);
  assert.deepEqual(issueLines('{"issues":[]}'), []);
  assert.deepEqual(issueLines('{"a":"\\"issues\\"","issues":[{}]}'), [1]);
});
