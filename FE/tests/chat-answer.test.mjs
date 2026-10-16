import test from 'node:test';
import assert from 'node:assert/strict';
import { countedItems, evidenceHref, shortCommit, toggleDetail, tokenizeAnswer } from '../src/features/chat-answer.ts';

const kinds = segments => segments.map(segment => segment.kind);

test('labels, code and plain text are separated as before', () => {
  const out = tokenizeAnswer('[FACT] The `core` module split. [UNKNOWN] Why is not recorded.');
  assert.deepEqual(kinds(out), ['label', 'text', 'code', 'text', 'label', 'text']);
  assert.equal(out[0].value, 'FACT');
  assert.equal(out[2].value, 'core');
});

test('only a hash the server confirmed as cited becomes a clickable commit', () => {
  const out = tokenizeAnswer('See `a1b2c3d` and `deadbeef` and `core/Billing.java`.', ['a1b2c3d']);
  const commits = out.filter(segment => segment.kind === 'commit');
  assert.deepEqual(commits.map(segment => segment.commit), ['a1b2c3d']);
  assert.deepEqual(out.filter(segment => segment.kind === 'code').map(segment => segment.value), ['deadbeef', 'core/Billing.java']);
});

test('a longer or upper-case hash in the answer still matches the cited short hash', () => {
  const out = tokenizeAnswer('Commit `A1B2C3D4E5F6` changed it.', ['a1b2c3d']);
  const commit = out.find(segment => segment.kind === 'commit');
  assert.equal(commit.commit, 'a1b2c3d');
  assert.equal(commit.value, 'A1B2C3D4E5F6');
});

test('without cited commits every code span stays code, and short hex words are never links', () => {
  assert.deepEqual(kinds(tokenizeAnswer('Use `a1b2c3d` here')), ['text', 'code', 'text']);
  assert.deepEqual(kinds(tokenizeAnswer('Use `abc123` here', ['abc123'])), ['text', 'code', 'text']);
});

test('an unterminated backtick or an empty answer does not break the split', () => {
  assert.deepEqual(tokenizeAnswer(''), []);
  assert.deepEqual(tokenizeAnswer('half `open'), [{ kind: 'text', value: 'half `open' }]);
});

test('the evidence link carries the project and the commit the evidence page matches on', () => {
  assert.equal(evidenceHref('p1', 'a1b2c3d'), '/evidence?projectId=p1&commit=a1b2c3d');
  assert.equal(evidenceHref('a b&c', 'x=y'), '/evidence?projectId=a%20b%26c&commit=x%3Dy');
});

test('shortCommit trims, lowercases and cuts to seven characters', () => {
  assert.equal(shortCommit(' A1B2C3D4E5 '), 'a1b2c3d');
});

test('only evidence items make up the totals', () => {
  const items = [{ kind: 'evidence', commit: 'a' }, { kind: 'snapshot', commit: 'b' }, { kind: 'evidence', commit: 'c' }];
  assert.deepEqual(countedItems(items).map(item => item.commit), ['a', 'c']);
});

test('selecting what is open closes it, selecting something else switches to it', () => {
  const a = { kind: 'commit', commit: 'a1b2c3d' };
  const b = { kind: 'commit', commit: 'ffff000' };
  assert.deepEqual(toggleDetail(null, a), a);
  assert.equal(toggleDetail(a, a), null);
  assert.deepEqual(toggleDetail(a, b), b);
  assert.deepEqual(toggleDetail(a, { kind: 'files' }), { kind: 'files' });
  assert.equal(toggleDetail({ kind: 'files' }, { kind: 'files' }), null);
  assert.deepEqual(toggleDetail({ kind: 'files' }, { kind: 'deps' }), { kind: 'deps' });
});
