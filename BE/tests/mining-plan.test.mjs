import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GIT_LOG_FORMAT, analysisProgress, chunk, monthlyHistogram, orderForMining, parseCommitLog, parseMineRequest, parseTagRefs, redactSecret, selectPending,
  snapshotLabel,
} from '../src/domain/mining/miningPlan.ts';

const commit = (hash, iso) => ({ hash, date: new Date(iso), author: 'a@x', ref: 'main', message: hash });
const none = { full: new Set(), short: new Set() };

test('parseMineRequest defaults to mining everything remaining', () => {
  assert.deepEqual(parseMineRequest(undefined), { mode: 'remaining', since: undefined, until: undefined, force: false });
});

test('range requests validate bounds and treat a date-only until as inclusive', () => {
  const r = parseMineRequest({ mode: 'range', since: '2024-01-01', until: '2024-01-31' });
  assert.equal(r.since.toISOString(), '2024-01-01T00:00:00.000Z');
  assert.equal(r.until.toISOString(), '2024-01-31T23:59:59.999Z');
  assert.throws(() => parseMineRequest({ mode: 'range' }), /since and\/or until/);
  assert.throws(() => parseMineRequest({ mode: 'range', since: '2024-02-01', until: '2024-01-01' }), /not be after/);
  assert.throws(() => parseMineRequest({ mode: 'range', since: 'nope' }), /not a valid date/);
  assert.throws(() => parseMineRequest({ mode: 'everything' }), /mode must be/);
  assert.equal(parseMineRequest({ mode: 'remaining', force: true }).force, false);
});

test('selectPending applies the range and skips commits that are already mined', () => {
  const commits = [commit('a'.repeat(40), '2024-01-10T00:00:00Z'), commit('b'.repeat(40), '2024-02-10T00:00:00Z'), commit('c'.repeat(40), '2024-03-10T00:00:00Z')];
  const range = parseMineRequest({ mode: 'range', since: '2024-02-01', until: '2024-03-31' });
  assert.deepEqual(selectPending(commits, none, range).map(c => c.hash[0]), ['b', 'c']);
  const mined = { full: new Set(['b'.repeat(40)]), short: new Set(['c'.repeat(7)]) }; // c is a legacy short-hash snapshot
  assert.deepEqual(selectPending(commits, mined, range), []);
  assert.deepEqual(selectPending(commits, mined, parseMineRequest(undefined)).map(c => c.hash[0]), ['a']);
  assert.equal(selectPending(commits, mined, { ...range, force: true }).length, 2);
});

test('chunk, histogram and progress', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 50), []);
  assert.deepEqual(monthlyHistogram([commit('a', '2024-02-01T00:00:00Z'), commit('b', '2024-01-31T23:00:00Z'), commit('c', '2024-02-02T00:00:00Z')]),
    [{ month: '2024-01', commits: 1 }, { month: '2024-02', commits: 2 }]);
  assert.equal(analysisProgress(0, 100), 10);
  assert.equal(analysisProgress(50, 100), 55);
  assert.equal(analysisProgress(100, 100), 100);
  assert.equal(analysisProgress(0, 0), 100);
});

test('redactSecret removes URL credentials and the raw token', () => {
  const text = redactSecret("fatal: unable to access 'https://ghp_abc123@github.com/o/r/': denied ghp_abc123", 'ghp_abc123');
  assert.ok(!text.includes('ghp_abc123'));
});

test('parseCommitLog reads real git output including subjects with odd characters', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mining-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x.io', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x.io' } });
  try {
    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(dir, 'a.txt'), '1');
    git('add', '.');
    git('commit', '-q', '-m', 'first: a|b "quoted"', '--date', '2024-01-05T10:00:00Z');
    fs.writeFileSync(path.join(dir, 'a.txt'), '2');
    git('commit', '-q', '-am', 'second', '--date', '2024-03-05T10:00:00Z');
    const commits = parseCommitLog(git('log', '--all', '--source', '--date-order', '--reverse', `--format=${GIT_LOG_FORMAT}`));
    assert.equal(commits.length, 2);
    assert.equal(commits[0].message, 'first: a|b "quoted"');
    assert.equal(commits[0].date.toISOString(), '2024-01-05T10:00:00.000Z');
    assert.equal(commits[1].ref, 'main');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('milestones requests: accepted, and milestonesOnly is only read in that mode', () => {
  assert.deepEqual(parseMineRequest({ mode: 'milestones' }), { mode: 'milestones', since: undefined, until: undefined, force: false, milestonesOnly: false });
  assert.equal(parseMineRequest({ mode: 'milestones', milestonesOnly: true }).milestonesOnly, true);
  assert.equal('milestonesOnly' in parseMineRequest({ mode: 'remaining', milestonesOnly: true }), false);
  assert.throws(() => parseMineRequest({ mode: 'tags' }), /milestones/);
});

test('parseTagRefs peels annotated tags, keeps lightweight ones, and groups several tags on one commit', () => {
  const a = 'a'.repeat(40), b = 'b'.repeat(40), tagObject = 'c'.repeat(40);
  const raw = [`v1.10.0\x1f${a}\x1f`, `v1.2.0\x1f${a}\x1f`, `release-2\x1f${tagObject}\x1f${b}`, `broken\x1fnot-a-hash\x1f`, ''].join('\n');
  const tags = parseTagRefs(raw);
  assert.deepEqual([...tags.keys()].sort(), [a, b]);
  assert.deepEqual(tags.get(a), ['v1.2.0', 'v1.10.0'], 'numeric order, not string order');
  assert.deepEqual(tags.get(b), ['release-2'], 'the annotated tag counts for the commit it points at');
  assert.equal(snapshotLabel(a.toUpperCase(), tags), 'v1.2.0, v1.10.0');
  assert.equal(snapshotLabel('d'.repeat(40), tags), 'ddddddd', 'untagged: the short hash, as before');
});

test('orderForMining puts tagged commits first in milestones mode and never adds or repeats one', () => {
  const pending = ['1', '2', '3', '4', '5'].map((n, i) => commit(n.repeat(40), `2024-01-0${i + 1}T00:00:00Z`));
  const tags = new Map([[pending[3].hash, ['v2']], [pending[1].hash, ['v1']]]);
  const ids = (list) => list.map((c) => c.hash[0]).join('');
  assert.equal(ids(orderForMining(pending, tags, { mode: 'milestones' })), '24135');
  assert.equal(ids(orderForMining(pending, tags, { mode: 'milestones', milestonesOnly: true })), '24');
  assert.equal(ids(orderForMining(pending, tags, { mode: 'remaining' })), '12345', 'other modes keep their order');
  assert.equal(ids(orderForMining(pending, new Map(), { mode: 'milestones', milestonesOnly: true })), '', 'no tags: nothing to mine first');
});
