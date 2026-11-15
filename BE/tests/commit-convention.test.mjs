import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCommitConvention, parseCommitMessage } from '../src/domain/architecture/commitConvention.ts';

// T5 / RF-30 (BM03 #11, BR-33): the commit convention "type(scope): summary" with "Task:" and "Arch-Change:" trailers.
// The declared architectural intent (Arch-Change) is compared with the components whose dependencies the commit really
// changed, measured with bridge.ts on the commit's snapshot and its base. Problems become findings of type "convention",
// in the shape of the existing conformance findings (D5).

// ── parsing ───────────────────────────────────────────────────────────────────────────────────────────────────────────

test('a valid message: type, scope, summary, tasks and declared changes', () => {
  const m = parseCommitMessage('feat(billing): stop reading orders directly', ['Task: D6, ARCH-12', 'Arch-Change: Billing, orders']);
  assert.deepEqual(m.header, { type: 'feat', scope: 'billing', summary: 'stop reading orders directly', breaking: false });
  assert.deepEqual(m.problems, []);
  assert.deepEqual(m.tasks, ['D6', 'ARCH-12']);
  assert.deepEqual(m.archChange, { kind: 'components', names: ['Billing', 'orders'] });
  assert.deepEqual(parseCommitMessage('fix(api)!: drop v1 routes', ['Arch-Change: none']).archChange, { kind: 'none' });
  assert.equal(parseCommitMessage('fix(api)!: drop v1 routes').header.breaking, true);
});

test('invalid messages: no header, unknown type, missing scope, missing summary', () => {
  const codes = (title) => parseCommitMessage(title).problems.map(p => p.code);
  assert.deepEqual(codes('Update stuff'), ['invalid-header']);
  assert.deepEqual(codes('feature(api): add'), ['unknown-type']);
  assert.deepEqual(codes('docs: user guide'), ['missing-scope']);
  assert.deepEqual(codes('fix(api):'), ['missing-summary']);
  assert.deepEqual(codes('fix(api):    '), ['missing-summary']);
  assert.deepEqual(codes('fix(): something'), ['missing-scope']);
  assert.deepEqual(codes(''), ['invalid-header']);
});

test('merge and revert commits written by git are not held to the header format', () => {
  assert.deepEqual(parseCommitMessage("Merge branch 'docs/x' into Develop").problems, []);
  assert.deepEqual(parseCommitMessage('Merge pull request #12 from org/branch').problems, []);
  assert.deepEqual(parseCommitMessage('Revert "feat(api): add"').problems, []);
});

test('Arch-Change: missing, "none" in any case, components separated by commas, semicolons or arrows', () => {
  assert.deepEqual(parseCommitMessage('fix(a): b').archChange, { kind: 'missing' });
  assert.deepEqual(parseCommitMessage('fix(a): b', ['Arch-Change: NONE']).archChange, { kind: 'none' });
  assert.deepEqual(parseCommitMessage('fix(a): b', ['arch-change: Web -> API; Domain']).archChange, { kind: 'components', names: ['Web', 'API', 'Domain'] });
  assert.deepEqual(parseCommitMessage('fix(a): b', ['Arch-Change:   ']).archChange, { kind: 'missing' });
});

// ── comparing with the real change ────────────────────────────────────────────────────────────────────────────────────

const components = [
  { id: 'web', name: 'Web', pathPrefixes: ['FE/src'] },
  { id: 'api', name: 'API', pathPrefixes: ['BE/src'] },
  { id: 'domain', name: 'Domain', pathPrefixes: ['BE/src/domain'] },
  { id: 'db', name: 'Database', pathPrefixes: ['BE/src/db'] },
];
const graph = (edges) => {
  const files = new Set(['FE/src/app.ts', 'BE/src/server.ts', 'BE/src/domain/order.ts', 'BE/src/db/orders.ts', 'BE/src/domain/rules.ts']);
  return { nodes: [...files].map(id => ({ id })), edges: edges.map(([source, target]) => ({ source, target })) };
};
const before = graph([['BE/src/server.ts', 'BE/src/domain/order.ts']]);
// The commit adds domain -> db (cross) and an import inside domain (internal, not an architecture change).
const after = graph([['BE/src/server.ts', 'BE/src/domain/order.ts'], ['BE/src/domain/order.ts', 'BE/src/db/orders.ts'], ['BE/src/domain/order.ts', 'BE/src/domain/rules.ts']]);
const check = (title, trailers, b = before, a = after) => checkCommitConvention({ hash: 'abc1234', title, trailers, before: b, after: a, components });
const summary = findings => findings.map(f => [f.ruleId, f.source, f.target]);

test('matching: the declared components are the ones whose dependencies changed, so there is no finding', () => {
  assert.deepEqual(check('feat(orders): persist orders', ['Task: T5', 'Arch-Change: Domain, Database']), []);
  // Naming one end of each changed dependency is enough; ids work as well as names, case does not matter.
  assert.deepEqual(check('feat(orders): persist orders', ['Task: T5', 'Arch-Change: domain']), []);
  // "none" with nothing changed between components (only an import inside Domain) is right.
  const internalOnly = graph([['BE/src/server.ts', 'BE/src/domain/order.ts'], ['BE/src/domain/order.ts', 'BE/src/domain/rules.ts']]);
  assert.deepEqual(check('refactor(domain): split rules', ['Arch-Change: none'], before, internalOnly), []);
  // No trailers at all is fine when no dependency between components changed.
  assert.deepEqual(check('refactor(domain): split rules', [], before, internalOnly), []);
});

test('mismatching: an undeclared change, a declared change that did not happen, an unknown component, a missing task', () => {
  const undeclared = check('feat(orders): persist orders', ['Task: T5', 'Arch-Change: none']);
  assert.deepEqual(summary(undeclared), [['convention:undeclared-change', 'domain', 'db']]);
  const f = undeclared[0];
  assert.equal(f.type, 'convention');
  assert.equal(f.severity, 'warning');
  assert.deepEqual(f.imports, [{ from: 'BE/src/domain/order.ts', to: 'BE/src/db/orders.ts' }]);
  assert.deepEqual(f.files, ['BE/src/domain/order.ts']);
  assert.match(f.ruleName, /Domain → Database.*Arch-Change/);

  assert.deepEqual(summary(check('feat(orders): persist orders', ['Task: T5'])), [['convention:undeclared-change', 'domain', 'db']]);
  assert.deepEqual(summary(check('feat(orders): persist orders', ['Task: T5', 'Arch-Change: Domain, Web'])), [['convention:declared-change-not-found', 'web', 'web']]);
  assert.deepEqual(summary(check('feat(orders): persist orders', ['Task: T5', 'Arch-Change: Domain, Payments'])), [['convention:unknown-component', '(commit)', '(commit)']]);
  // An architecture change without the task it belongs to.
  assert.deepEqual(summary(check('feat(orders): persist orders', ['Arch-Change: Domain'])), [['convention:missing-task', '(commit)', '(commit)']]);
});

test('multiple changed components: one finding per undeclared dependency, declared ones left out', () => {
  const wide = graph([
    ['BE/src/server.ts', 'BE/src/domain/order.ts'], ['BE/src/domain/order.ts', 'BE/src/db/orders.ts'], ['FE/src/app.ts', 'BE/src/server.ts'],
  ]);
  const removedToo = graph([['BE/src/domain/order.ts', 'BE/src/db/orders.ts'], ['FE/src/app.ts', 'BE/src/server.ts']]);
  assert.deepEqual(summary(check('feat(app): wire', ['Task: T5', 'Arch-Change: none'], before, wide)), [
    ['convention:undeclared-change', 'domain', 'db'], ['convention:undeclared-change', 'web', 'api'],
  ]);
  assert.deepEqual(summary(check('feat(app): wire', ['Task: T5', 'Arch-Change: Web'], before, wide)), [['convention:undeclared-change', 'domain', 'db']]);
  // A removed dependency (api -> domain) is a change as well.
  assert.deepEqual(summary(check('feat(app): wire', ['Task: T5', 'Arch-Change: Web, Database'], before, removedToo)), [['convention:undeclared-change', 'api', 'domain']]);
});

test('format findings come with the change findings; keys hold the commit, so a decision never carries to another commit', () => {
  const findings = check('Persist orders', ['Arch-Change: none']);
  assert.deepEqual(summary(findings), [['convention:invalid-header', '(commit)', '(commit)'], ['convention:missing-task', '(commit)', '(commit)'], ['convention:undeclared-change', 'domain', 'db']]);
  assert.ok(findings.every(f => f.key.startsWith('convention|') && f.key.includes('abc1234')));
  assert.equal(new Set(findings.map(f => f.key)).size, findings.length);
});

test('the first mined commit has nothing to compare with: only its message format is checked', () => {
  assert.deepEqual(summary(check('feat(orders): persist orders', [], null, after)), []);
  assert.deepEqual(summary(check('bad message', [], null, after)), [['convention:invalid-header', '(commit)', '(commit)']]);
});

test('files no component owns are not an architecture change between components', () => {
  const stray = { nodes: [...after.nodes, { id: 'scripts/seed.ts' }], edges: [...before.edges, { source: 'scripts/seed.ts', target: 'BE/src/db/orders.ts' }] };
  assert.deepEqual(check('chore(scripts): seed', ['Arch-Change: none'], before, stray), []);
});
