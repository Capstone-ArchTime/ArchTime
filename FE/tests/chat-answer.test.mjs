import test from 'node:test';
import assert from 'node:assert/strict';
import { countedItems, evidenceHref, parseAnswer, shortCommit, toggleDetail, tokenizeAnswer } from '../src/features/chat-answer.ts';

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

// ── Markdown the model writes: **bold**, headings and tables ───────────────────────────────────────────────────────
const text = value => ({ kind: 'text', value });
const bold = (...children) => ({ kind: 'bold', children });

test('**bold** becomes bold and its asterisks disappear', () => {
  assert.deepEqual(tokenizeAnswer('a **b** c'), [text('a '), bold(text('b')), text(' c')]);
});

test('bold may hold a label, as in the answers the model writes', () => {
  const out = tokenizeAnswer('- **[FACT] Has a planner:** it has `2d0ad95` and `80d2bfe`.', ['2d0ad95']);
  assert.deepEqual(out[0], text('- '));
  assert.deepEqual(out[1], bold({ kind: 'label', value: 'FACT' }, text(' Has a planner:')));
  assert.deepEqual(out.filter(s => s.kind === 'commit').map(s => s.commit), ['2d0ad95']);
  assert.deepEqual(out.filter(s => s.kind === 'code').map(s => s.value), ['80d2bfe']);
});

test('asterisks inside a code span are never bold markers', () => {
  const out = tokenizeAnswer('Use `src/**/*.ts` and `lib/**/*.js` here, **really**.');
  assert.deepEqual(out.filter(s => s.kind === 'code').map(s => s.value), ['src/**/*.ts', 'lib/**/*.js']);
  assert.deepEqual(out.filter(s => s.kind === 'bold'), [bold(text('really'))]);
});

test('a ** with no partner, or around spaces, stays as written', () => {
  assert.deepEqual(tokenizeAnswer('**open'), [text('**open')]);
  assert.deepEqual(tokenizeAnswer('2 ** 3 ** 4'), [text('2 ** 3 ** 4')]);
  assert.deepEqual(tokenizeAnswer('**bold **'), [text('**bold **')]);
  assert.deepEqual(tokenizeAnswer('****'), [text('****')]);
});

test('bold never spans a line break', () => {
  assert.deepEqual(tokenizeAnswer('**a\nb**'), [text('**a\nb**')]);
  assert.deepEqual(tokenizeAnswer('**a**\n**b**'), [bold(text('a')), text('\n'), bold(text('b'))]);
});

test('plain answers lay out as one text block, as before', () => {
  const blocks = parseAnswer('[FACT] `a1b2c3d` split billing.\n- second line', ['a1b2c3d']);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'text');
  assert.deepEqual(kinds(blocks[0].segments), ['label', 'text', 'commit', 'text']);
});

test('a heading line becomes a heading without its hashes', () => {
  const blocks = parseAnswer('### Summary\nbody text');
  assert.deepEqual(blocks.map(b => b.kind), ['heading', 'text']);
  assert.deepEqual(blocks[0].segments, [text('Summary')]);
  assert.deepEqual(parseAnswer('#hashtag')[0].kind, 'text');
});

test('a markdown table becomes a table whose cells keep commits and bold', () => {
  const blocks = parseAnswer('Intro\n\n| Commit | Files |\n|---|---|\n| `a1b2c3d` | 12 |\n| **x** | 3 |\n\nOutro', ['a1b2c3d']);
  assert.deepEqual(blocks.map(b => b.kind), ['text', 'table', 'text']);
  const table = blocks[1];
  assert.deepEqual(table.header, [[text('Commit')], [text('Files')]]);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0][0][0].kind, 'commit');
  assert.deepEqual(table.rows[1][0], [bold(text('x'))]);
  assert.deepEqual(blocks[0].segments, [text('Intro')]);
  assert.deepEqual(blocks[2].segments, [text('Outro')]);
});

test('table rows with too few cells are padded, and lines without the rule row are not a table', () => {
  const padded = parseAnswer('| A | B |\n|:--|--:|\n| only |')[0];
  assert.equal(padded.kind, 'table');
  assert.deepEqual(padded.rows[0], [[text('only')], []]);
  const notTable = parseAnswer('| a | b |\n| c | d |');
  assert.deepEqual(notTable.map(b => b.kind), ['text']);
});

test('an empty answer has no blocks', () => {
  assert.deepEqual(parseAnswer(''), []);
  assert.deepEqual(parseAnswer('\n\n'), []);
});
