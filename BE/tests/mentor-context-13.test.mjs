// Mentor context protocol 1.3 (docs/rq2-protocol.md §1.3): the ARCHITECTURE block and its assembly into the PROJECT
// DATA, the C1/C2 equality, citation filtering, the test-set lock and the trial spot checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleMentorContext, buildArchitectureContext, MAX_CONTEXT_MILESTONES, NO_ARCHITECTURE_NOTE, pickMilestones, WITHHELD_NOTE,
} from '../src/domain/mentor/architectureContext.ts';
import { buildProjectContext, BASE_CONTEXT_CHARS_13, MENTOR_CONTEXT_VERSION } from '../src/application/use-cases/llm/ProjectChatContext.ts';
import { SYSTEM_PROMPT } from '../src/application/use-cases/llm/ProjectChatUseCase.ts';
import { fingerprint, messagesFor, postProcess } from '../src/domain/evaluation/rq2.ts';
import { githubSlug, isTestSetRepo, testSetLocked, TEST_SET_REPOS } from '../src/domain/evaluation/testSet.ts';
import { trialChecks } from '../src/domain/mentor/trial.ts';

const comp = (id, name, memberIds, extra = {}) => ({ id, name, memberIds, ...extra });
const files = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}.ts`);
const ms = (hash, date, components, edges = []) => ({ hash, date, version: undefined, generator: 'cluster+llm', components, edges });

// ── The block ────────────────────────────────────────────────────────────────────────────────────────────────────

test('missing components: a milestone with only unassigned files lists no component and says so', () => {
  const ctx = buildArchitectureContext([ms('a'.repeat(40), '2026-01-01', [comp('u', 'Unassigned Files', files('x/', 3))])], files('x/', 3));
  assert.match(ctx.text, /COMPONENTS at milestone `aaaaaaa` 2026-01-01 \(0 components, 3 files unassigned\):/);
  assert.equal(ctx.stats.components, 0);
});

test('missing dependencies and empty evolution history are stated, not left out', () => {
  const ctx = buildArchitectureContext([ms('a'.repeat(40), '2026-01-01', [comp('c', 'Core', files('c/', 3)), comp('w', 'Web', files('w/', 3))])], [...files('c/', 3), ...files('w/', 3)]);
  assert.match(ctx.text, /COMPONENT DEPENDENCIES \(imports between components\):\n- none/);
  assert.match(ctx.text, /EVOLUTION EVENTS between consecutive milestones \(0; 0 renames not listed\):\n- none reported/);
});

test('trial findings (regressions): renames are counted not listed, file counts are per step, a hash used as version is not repeated', () => {
  const A = files('a/', 5), B = files('b/', 5);
  const m1 = { ...ms('1'.repeat(40), '2026-01-01', [comp('a', 'Auth', A), comp('b', 'Billing', B)]), version: '1111111' };
  const m2 = { ...ms('2'.repeat(40), '2026-02-01', [comp('a2', 'Identity', A), comp('b', 'Billing', B), comp('n', 'News', files('n/', 3))]), version: 'v2.0.0' };
  const ctx = buildArchitectureContext([m1, m2], [...A, ...B]);
  assert.match(ctx.text, /EVOLUTION EVENTS between consecutive milestones \(1; 1 renames not listed\)/);
  assert.ok(!/- renamed:/.test(ctx.text));
  assert.match(ctx.text, /- added \(new-files\): — -> News .*\(files in this step: \+3 -0, 0 moved\)/);
  assert.match(ctx.text, /- `1111111` 2026-01-01:/, 'no "1111111 1111111"');
  assert.match(ctx.text, /- `2222222` v2\.0\.0 2026-02-01:/);
});

test('no stored grouping, or the test-set lock: the PROJECT DATA says so and adds no architecture commits', () => {
  const base = { text: 'SNAPSHOTS ...', knownCommits: ['aaaaaaa'] };
  const none = assembleMentorContext({ version: '1.3', base, architecture: null, withheld: false });
  assert.ok(none.text.endsWith(NO_ARCHITECTURE_NOTE));
  assert.equal(none.architecture, null);
  const arch = buildArchitectureContext([ms('b'.repeat(40), '2026-01-01', [comp('c', 'Core', files('c/', 3))])], files('c/', 3));
  const withheld = assembleMentorContext({ version: '1.3', base, architecture: arch, withheld: true });
  assert.ok(withheld.text.endsWith(WITHHELD_NOTE));
  assert.ok(!withheld.text.includes('COMPONENTS'), 'nothing of the block leaks when withheld');
  assert.deepEqual(withheld.knownCommits, ['aaaaaaa']);
  const open = assembleMentorContext({ version: '1.3', base, architecture: arch, withheld: false });
  assert.deepEqual(open.knownCommits, ['aaaaaaa', 'bbbbbbb']);
  assert.equal(assembleMentorContext({ version: '1.2', base, architecture: arch, withheld: false }).text, base.text, '1.2 is the snapshot/evidence part alone');
});

test('large repositories: 300 components and thousands of edges stay within the budget with every section present', () => {
  const big = Array.from({ length: 300 }, (_, i) => comp(`c${i}`, `Component ${i}`, files(`m${i}/`, 5), { description: 'x'.repeat(500) }));
  const edges = big.flatMap((c, i) => big.slice(i + 1, i + 15).map(d => ({ source: c.memberIds[0], target: d.memberIds[1] })));
  const msList = Array.from({ length: 12 }, (_, k) => ms(`${k}`.padStart(7, '0') + 'f'.repeat(33), `2026-0${1 + (k % 9)}-01`, big.slice(0, 200 + k * 8), edges));
  const top = Array.from({ length: 50 }, (_, i) => ({ hash: `${i}`.padStart(7, '1') + 'e'.repeat(33), date: '2026-01-01', depAdded: 100 - i, depRemoved: 0 }));
  const ctx = buildArchitectureContext(msList, big.flatMap(c => c.memberIds), {}, top);
  assert.ok(ctx.text.length <= 9_000, `${ctx.text.length} characters`);
  for (const s of ['FOLDERS', 'COMPONENTS at milestone', 'COMPONENT DEPENDENCIES', 'EVOLUTION EVENTS', 'MILESTONES', 'LARGEST DEPENDENCY CHANGES']) assert.ok(ctx.text.includes(s), s);
  assert.match(ctx.text, /more components not listed/);
  assert.equal(ctx.stats.truncated, true);
  assert.ok(ctx.text.includes('description (generated): ' + 'x'.repeat(159).slice(0, 10)), 'descriptions are clipped');
});

test('context truncation: the 1.3 snapshot/evidence part is cut at its own budget; 1.2 output is unchanged', () => {
  const evidences = Array.from({ length: 25 }, (_, i) => ({ commit: `${i}`.padStart(7, 'a'), changeTitle: 't'.repeat(120), type: 'DEPENDENCY CHANGE', date: '2026-01-01', files: 9, summary: 's'.repeat(300), depsAdded: 1, depsRemoved: 0, sourceFiles: files('a/very/long/path/name/', 6) }));
  const snapshots = Array.from({ length: 15 }, (_, i) => ({ hash: `${i}`.padStart(7, 'b'), title: 'x'.repeat(120), author: 'A', date: '2026-01-01', files: 10, archChanges: 1, depAdded: 1, depRemoved: 0 }));
  const input = { project: { name: 'p', repoUrl: 'https://github.com/o/p' }, snapshots, snapshotTotal: 15, evidences, evidenceTotal: 25, structure: { hash: 'ccccccc', title: 't', nodeCount: 2, edgeCount: 0, nodes: [{ name: 'a.ts', type: 'module' }] } };
  const v13 = buildProjectContext({ ...input, project: { ...input.project, description: 'd'.repeat(400) } }, { version: '1.3' });
  assert.ok(v13.text.length <= BASE_CONTEXT_CHARS_13 + '\n(project data truncated)'.length);
  assert.ok(!v13.text.includes('LATEST STRUCTURE'), '1.3 replaces the file-name list by the folder summary');
  assert.match(v13.text, /1 dependency changes/);
  const v12 = buildProjectContext(input);
  assert.match(v12.text, /LATEST STRUCTURE/);
  assert.match(v12.text, /1 architectural changes/);
  assert.equal(MENTOR_CONTEXT_VERSION, '1.3');
});

test('evidence ranking: largest whole-history changes in the given order, capped; representative files by fan-in; dependencies by weight', () => {
  const core = comp('c', 'Core', ['c/hub.ts', 'c/leaf.ts', 'c/mid.ts']);
  const web = comp('w', 'Web', ['w/a.ts', 'w/b.ts', 'w/c.ts']);
  const jobs = comp('j', 'Jobs', ['j/a.ts', 'j/b.ts', 'j/c.ts']);
  const edges = [
    { source: 'w/a.ts', target: 'c/hub.ts' }, { source: 'w/b.ts', target: 'c/hub.ts' }, { source: 'j/a.ts', target: 'c/hub.ts' }, { source: 'c/leaf.ts', target: 'c/mid.ts' },
    { source: 'w/c.ts', target: 'c/mid.ts' }, { source: 'j/b.ts', target: 'w/a.ts' },
  ];
  const top = Array.from({ length: 12 }, (_, i) => ({ hash: `${String(i).padStart(2, '0')}abcde${'0'.repeat(31)}`, date: '2026-01-01', depAdded: 50 - i, depRemoved: 1 }));
  const ctx = buildArchitectureContext([ms('d'.repeat(40), '2026-01-01', [core, web, jobs], edges)], [...core.memberIds, ...web.memberIds, ...jobs.memberIds], {}, top);
  assert.match(ctx.text, /- Core: 3 files; e\.g\. c\/hub\.ts, c\/mid\.ts, c\/leaf\.ts/, 'hub (fan-in 3) first, then mid (2)');
  assert.ok(ctx.text.indexOf('Web -> Core (3 imports)') < ctx.text.indexOf('Jobs -> Core (1 imports)'));
  const lines = ctx.text.split('\n').filter(l => /^- `\d\dabcde`/.test(l));
  assert.equal(lines.length, 10, 'capped at the 10 largest');
  assert.ok(lines[0].startsWith('- `00abcde`') && lines[9].startsWith('- `09abcde`'), 'in the ranking order given by the query');
  assert.match(ctx.text, /\(2 more commits not listed\)/);
});

test('historical retrieval: events between every consecutive pair of milestones, all milestones listed oldest first', () => {
  const A = files('a/', 6), B = files('b/', 6), N = files('n/', 4);
  const m1 = ms('1'.repeat(40), '2025-01-01', [comp('a', 'Auth', A), comp('b', 'Billing', B)]);
  const m2 = ms('2'.repeat(40), '2025-06-01', [comp('a', 'Auth', A), comp('b', 'Billing', B), comp('n', 'Notifications', N)]);
  const m3 = ms('3'.repeat(40), '2026-01-01', [comp('ab', 'Accounts', [...A, ...B, ...files('g/', 2)]), comp('n', 'Notifications', N)]);
  const ctx = buildArchitectureContext([m1, m2, m3], [...A, ...B, ...N]);
  assert.match(ctx.text, /- added \(new-files\): — -> Notifications between `1111111` 2025-01-01 and `2222222` 2025-06-01/);
  assert.match(ctx.text, /- merged: Auth \+ Billing -> Accounts between `2222222` 2025-06-01 and `3333333` 2026-01-01/);
  const order = ['`1111111`', '`2222222`', '`3333333`'].map(h => ctx.text.lastIndexOf(`- ${h}`));
  assert.ok(order[0] < order[1] && order[1] < order[2]);
  const many = Array.from({ length: 31 }, (_, i) => i);
  const picked = pickMilestones(many);
  assert.equal(picked.length, MAX_CONTEXT_MILESTONES);
  assert.deepEqual([picked[0], picked.at(-1)], [0, 30], 'first and last milestone always kept');
  assert.deepEqual(pickMilestones([1, 2, 3]), [1, 2, 3]);
});

test('reproducible fingerprints: the same data in another order gives the same text and fingerprint', () => {
  const A = files('a/', 4), B = files('b/', 3);
  const edges = [{ source: A[0], target: B[0] }, { source: A[1], target: B[1] }, { source: B[2], target: A[3] }];
  const one = buildArchitectureContext([ms('9'.repeat(40), '2026-01-01', [comp('a', 'Alpha', A), comp('b', 'Beta', B)], edges)], [...A, ...B]);
  const two = buildArchitectureContext([ms('9'.repeat(40), '2026-01-01', [comp('b', 'Beta', [...B].reverse()), comp('a', 'Alpha', [...A].reverse())], [...edges].reverse())], [...B, ...A]);
  assert.equal(one.text, two.text);
  assert.equal(fingerprint(one.text), fingerprint(two.text));
});

// ── Conditions and citations ─────────────────────────────────────────────────────────────────────────────────────

const project = { name: 'demo', repoUrl: 'https://github.com/o/demo' };
const data = assembleMentorContext({
  version: '1.3', base: { text: 'SNAPSHOTS (newest first)\n- `aaaaaaa` ...', knownCommits: ['aaaaaaa'] },
  architecture: buildArchitectureContext([ms('b'.repeat(40), '2026-01-01', [comp('c', 'Core', files('c/', 3))])], files('c/', 3)), withheld: false,
}).text;

test('C1 and C2 receive byte-identical PROJECT DATA; C0 receives none; only the instructions differ', () => {
  const block = (m) => { const s = m[0].content; const i = s.indexOf('--- PROJECT DATA ---'); return i < 0 ? null : s.slice(i); };
  const c0 = messagesFor('C0', { project, context: data, question: 'Q?', mentorPrompt: SYSTEM_PROMPT });
  const c1 = messagesFor('C1', { project, context: data, question: 'Q?', mentorPrompt: SYSTEM_PROMPT });
  const c2 = messagesFor('C2', { project, context: data, question: 'Q?', mentorPrompt: SYSTEM_PROMPT });
  assert.equal(block(c0), null);
  assert.ok(!c0[0].content.includes('ARCHITECTURE'));
  assert.equal(block(c1), block(c2));
  assert.ok(block(c1).includes('COMPONENTS at milestone'));
  assert.deepEqual([c1[1], c2[1]], [c0[1], c0[1]], 'same user message');
  assert.notEqual(c1[0].content.slice(0, c1[0].content.indexOf('--- PROJECT DATA ---')), c2[0].content.slice(0, c2[0].content.indexOf('--- PROJECT DATA ---')), 'instructions differ');
});

test('invalid commit references: C2 removes non-mined hashes and downgrades an uncited FACT; C1 keeps the text as written', () => {
  const answer = '[FACT] The core moved in `bbbbbbb`. [FACT] Billing was added in `deadbee`.';
  const isMined = (h) => 'bbbbbbbbbbbb'.startsWith(h);
  const c2 = postProcess('C2', answer, isMined);
  assert.equal(c2.check.removedCitations.length, 1);
  assert.equal(c2.check.downgraded, 1);
  assert.ok(!c2.text.includes('deadbee'));
  assert.match(c2.text, /\[INFERENCE\] Billing was added/);
  assert.equal(postProcess('C1', answer, isMined).text, answer);
});

test('a commit cut off by truncation is not offered to the citation check as known', () => {
  const top = Array.from({ length: 10 }, (_, i) => ({ hash: `${i}`.repeat(7) + 'a'.repeat(33), date: '2026-01-01', depAdded: 1, depRemoved: 1 }));
  const ctx = buildArchitectureContext([ms('e'.repeat(40), '2026-01-01', [comp('c', 'Core', files('c/', 3))])], files('c/', 3), { maxChars: 1200 }, top);
  for (const h of ctx.knownCommits) assert.ok(ctx.text.includes(`\`${h}\``), `${h} is in the text`);
  assert.ok(ctx.knownCommits.length < 11);
});

// ── Test-set lock ────────────────────────────────────────────────────────────────────────────────────────────────

test('the five test repositories are recognised in any address form; development repositories are not', () => {
  assert.equal(githubSlug('https://github.com/remix-run/react-router.git'), 'remix-run/react-router');
  assert.equal(githubSlug('git@github.com:Outline/Outline.git'), 'outline/outline');
  assert.equal(githubSlug('https://github.com/facebook/docusaurus/'), 'facebook/docusaurus');
  for (const r of TEST_SET_REPOS) assert.ok(isTestSetRepo(`https://github.com/${r}`), r);
  assert.equal(isTestSetRepo('https://github.com/Capstone-ArchTime/ArchTime'), false);
  assert.equal(isTestSetRepo('https://github.com/remix-run/react-router-templates'), false);
  assert.equal(isTestSetRepo(null), false);
  assert.equal(testSetLocked({}), true, 'locked unless explicitly lifted');
  assert.equal(testSetLocked({ ARCHTIME_TEST_SET_LOCK: 'on' }), true);
  assert.equal(testSetLocked({ ARCHTIME_TEST_SET_LOCK: 'off' }), false);
});

// ── Trial spot checks ────────────────────────────────────────────────────────────────────────────────────────────

test('trial spot checks compare an answer with the database facts, per question', () => {
  const facts = { topChange: { hash: 'abc1234ffff', added: 40, removed: 2 }, newestChange: { hash: 'def5678eeee', author: 'Ann Lee' }, oldest: { hash: '0001112aaaa', files: 9 }, largestRemoval: { hash: '9998887bbbb', removed: 5 } };
  assert.deepEqual(trialChecks('Q2', 'The largest was `abc1234`.', facts).map(c => c.passed), [true]);
  assert.deepEqual(trialChecks('Q2', 'The largest was `fff0000`.', facts).map(c => c.passed), [false]);
  assert.deepEqual(trialChecks('Q6', 'ann lee did it', facts).map(c => c.passed), [true]);
  assert.deepEqual(trialChecks('Q9', 'anything', facts), []);
  assert.deepEqual(trialChecks('Q2', 'x', { ...facts, topChange: null }), []);
});
