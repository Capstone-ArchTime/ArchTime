import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {
  MAX_COMMITS, MAX_COMPONENTS, MAX_EDGES, MAX_FILES, MAX_PAIRS, IMPACT_NOTE,
  parseEvidenceImpact, parseCommitImpacts, getEvidenceImpact, getCommitImpacts,
  commitsTouchingComponent, componentDelta, deltaText, impactSummary, andMore, shortHash, shortDate, evidenceLink, changeLabel, linkedEvidence, linkedCommitMissing,
} = await import('../src/features/evidence-bridge.ts');

Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
const storage = () => ({ getItem: () => null, setItem() {} });
const signedIn = t => {
  t.mock.property(globalThis, 'sessionStorage', storage());
  t.mock.property(globalThis, 'localStorage', storage());
};

const snap = (n, extra = {}) => ({ id: `s${n}`, hash: `h${n}`, title: `commit ${n}`, date: `2024-01-0${n}T10:00:00.000Z`, ...extra });
const sample = pairs => ({ totalFilePairs: pairs.length, filePairs: pairs.map(([source, target]) => ({ source, target })) });
const evidenceBody = (extra = {}) => ({
  label: 'INFERENCE', note: 'n', evidence: { id: 'e3', commit: 'h3', title: 'change 3', date: '2024-01-03T10:00:00.000Z', type: 'DEPENDENCY CHANGE', depsAdded: 3, depsRemoved: 1 },
  snapshot: snap(3), baseline: snap(2), hasBaseline: true, fileChanges: { pairsAdded: 3, pairsRemoved: 1, filesAdded: 1, filesRemoved: 0 },
  grouped: true, mapping: { generator: 'cluster-only', createdAt: '2024-02-02T00:00:00.000Z', stale: false },
  components: [{ id: 'ui', filesAdded: 1, filesRemoved: 0, pairsAdded: 2, pairsRemoved: 0 }, { id: 'api', filesAdded: 0, filesRemoved: 0, pairsAdded: 3, pairsRemoved: 1 }],
  componentEdges: [{ id: 'ui->api', kind: 'cross', source: 'ui', target: 'api', added: sample([['src/ui/a.ts', 'src/api/x.ts']]), removed: sample([]) }],
  unmappedFiles: { total: 1, files: ['src/old/gone.ts'] }, unmappedPairs: 0,
  ...extra,
});
const commit = (n, components, edges = [], extra = {}) => ({ commit: `h${n}`, title: `change ${n}`, date: `2024-01-0${n}T10:00:00.000Z`, evidenceId: `e${n}`, comparable: true, components, componentEdges: edges, unmappedCount: 0, ...extra });
const edge = (id, source, target, added, removed, kind = 'cross') => ({ id, kind, source, target, added, removed });
const commitsBody = (commits, extra = {}) => ({ label: 'INFERENCE', note: 'n', snapshot: snap(5), limit: 20, grouped: true, mapping: { generator: 'cluster-only', createdAt: '2024-02-02T00:00:00.000Z' }, commits, skipped: 0, ...extra });

// ---- parseEvidenceImpact ---------------------------------------------------------------------------------------------------

test('a grouped evidence impact is read with its components, changed dependencies and unmapped files', () => {
  const impact = parseEvidenceImpact({ success: true, data: evidenceBody() });
  assert.equal(impact.grouped, true);
  assert.equal(impact.label, 'INFERENCE');
  assert.deepEqual(impact.evidence, { id: 'e3', commit: 'h3', title: 'change 3', date: '2024-01-03T10:00:00.000Z', type: 'DEPENDENCY CHANGE', depsAdded: 3, depsRemoved: 1 });
  assert.equal(impact.snapshot.id, 's3');
  assert.equal(impact.baseline.id, 's2');
  assert.equal(impact.hasBaseline, true);
  assert.deepEqual(impact.components.map(c => c.id), ['ui', 'api']);
  assert.deepEqual(impact.componentEdges[0].added, { total: 1, pairs: [{ source: 'src/ui/a.ts', target: 'src/api/x.ts' }] });
  assert.deepEqual(impact.componentEdges[0].removed, { total: 0, pairs: [] });
  assert.deepEqual(impact.unmappedFiles, { total: 1, files: ['src/old/gone.ts'] });
  assert.deepEqual(impact.mapping, { generator: 'cluster-only', createdAt: '2024-02-02T00:00:00.000Z', stale: false });
});

test('the body is read with or without its data envelope', () => {
  assert.equal(parseEvidenceImpact(evidenceBody()).evidence.commit, 'h3');
  assert.equal(parseEvidenceImpact({ data: evidenceBody() }).evidence.commit, 'h3');
});

test('grouped:false keeps the raw file counts and the reason, and has no components', () => {
  const impact = parseEvidenceImpact({ data: { ...evidenceBody(), grouped: false, reason: 'Not grouped.', components: undefined, componentEdges: undefined } });
  assert.equal(impact.grouped, false);
  assert.equal(impact.reason, 'Not grouped.');
  assert.deepEqual(impact.fileChanges, { pairsAdded: 3, pairsRemoved: 1, filesAdded: 1, filesRemoved: 0 });
  assert.equal('components' in impact, false);
  assert.equal(parseEvidenceImpact({ data: { ...evidenceBody(), grouped: false } }).reason, 'This commit has not been grouped into components yet.', 'a missing reason gets a plain one');
});

test('the first mined commit has no baseline', () => {
  const impact = parseEvidenceImpact({ data: evidenceBody({ baseline: null, hasBaseline: false }) });
  assert.equal(impact.baseline, null);
  assert.equal(impact.hasBaseline, false);
});

test('anything that is not an impact answer is null, never a half-built object', () => {
  for (const bad of [undefined, null, 5, 'x', [], {}, { data: null }, { data: {} }, evidenceBody({ grouped: 'yes' }), evidenceBody({ evidence: null }), evidenceBody({ evidence: { id: 'e' } }), evidenceBody({ snapshot: {} }), evidenceBody({ snapshot: 'x' })]) {
    assert.equal(parseEvidenceImpact(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
});

test('malformed parts are dropped or zeroed, not trusted', () => {
  const impact = parseEvidenceImpact({ data: evidenceBody({
    fileChanges: { pairsAdded: -4, pairsRemoved: '2', filesAdded: 2.7, filesRemoved: NaN },
    components: [{ id: 'ui', filesAdded: 'many', pairsAdded: 3 }, { id: '' }, { id: 7 }, null, 'x', { id: 'api' }],
    componentEdges: [
      { id: 'a->b', kind: 'cross', source: 'a', target: 'b', added: { totalFilePairs: 2, filePairs: [{ source: 's', target: 't' }, { source: 's' }, null, { source: 1, target: 2 }] }, removed: 'x' },
      { id: 'weird', kind: 'sideways', source: 'a', target: 'b' }, { kind: 'cross' }, 'nope',
      { id: 'x->(unmapped)', kind: 'unmapped', source: 'x', target: '', added: sample([]), removed: sample([]) },
    ],
    unmappedFiles: { total: 'lots', files: ['a.ts', 3, null, 'b.ts'] }, unmappedPairs: 'two', mapping: 'old', extraneous: { evil: true },
  }) });
  assert.deepEqual(impact.fileChanges, { pairsAdded: 0, pairsRemoved: 0, filesAdded: 2, filesRemoved: 0 });
  assert.deepEqual(impact.components, [{ id: 'ui', filesAdded: 0, filesRemoved: 0, pairsAdded: 3, pairsRemoved: 0 }, { id: 'api', filesAdded: 0, filesRemoved: 0, pairsAdded: 0, pairsRemoved: 0 }]);
  assert.deepEqual(impact.componentEdges.map(e => e.id), ['a->b', 'x->(unmapped)']);
  assert.deepEqual(impact.componentEdges[0].added, { total: 2, pairs: [{ source: 's', target: 't' }] });
  assert.deepEqual(impact.componentEdges[0].removed, { total: 0, pairs: [] });
  assert.equal(impact.componentEdges[1].target, null, 'an empty side is no side');
  assert.deepEqual(impact.unmappedFiles, { total: 2, files: ['a.ts', 'b.ts'] }, 'the total is never below what is listed');
  assert.equal(impact.unmappedPairs, 0);
  assert.deepEqual(impact.mapping, { generator: '', createdAt: '', stale: false });
  assert.equal('extraneous' in impact, false);
});

test('a grouped answer with no lists is read as having none', () => {
  const impact = parseEvidenceImpact({ data: evidenceBody({ components: 'x', componentEdges: undefined, unmappedFiles: null, mapping: undefined }) });
  assert.equal(impact.grouped, true);
  assert.deepEqual([impact.components, impact.componentEdges, impact.unmappedFiles], [[], [], { total: 0, files: [] }]);
});

test('lists and long text are capped', () => {
  const many = n => Array.from({ length: n }, (_, i) => i);
  const impact = parseEvidenceImpact({ data: evidenceBody({
    components: many(MAX_COMPONENTS + 50).map(i => ({ id: `c${i}` })),
    componentEdges: many(MAX_EDGES + 50).map(i => ({ id: `e${i}`, kind: 'cross', source: 'a', target: 'b', added: { totalFilePairs: 900, filePairs: many(MAX_PAIRS + 10).map(j => ({ source: `s${j}`, target: 't' })) } })),
    unmappedFiles: { total: 500, files: many(MAX_FILES + 20).map(i => `f${i}.ts`) },
    evidence: { id: 'e', commit: 'h', title: 'x'.repeat(5000) },
  }) });
  assert.equal(impact.components.length, MAX_COMPONENTS);
  assert.equal(impact.componentEdges.length, MAX_EDGES);
  assert.equal(impact.componentEdges[0].added.pairs.length, MAX_PAIRS);
  assert.equal(impact.componentEdges[0].added.total, 900, 'the true total survives the cap on listed pairs');
  assert.equal(impact.unmappedFiles.files.length, MAX_FILES);
  assert.equal(impact.unmappedFiles.total, 500);
  assert.ok(impact.evidence.title.length <= 400);
});

// ---- parseCommitImpacts ----------------------------------------------------------------------------------------------------

test('the commits of a snapshot are read with their component ids and counts', () => {
  const out = parseCommitImpacts({ data: commitsBody([commit(4, ['api'], [edge('ui->api', 'ui', 'api', 2, 1)], { unmappedCount: 3 }), commit(3, [])], { skipped: 2 }) });
  assert.equal(out.grouped, true);
  assert.equal(out.limit, 20);
  assert.equal(out.snapshot.id, 's5');
  assert.equal(out.skipped, 2);
  assert.deepEqual(out.commits[0], { commit: 'h4', title: 'change 4', date: '2024-01-04T10:00:00.000Z', evidenceId: 'e4', comparable: true, components: ['api'], componentEdges: [edge('ui->api', 'ui', 'api', 2, 1)], unmappedCount: 3 });
  assert.deepEqual(out.mapping, { generator: 'cluster-only', createdAt: '2024-02-02T00:00:00.000Z' });
});

test('grouped:false has no commits whatever the server put there', () => {
  const out = parseCommitImpacts({ data: commitsBody([commit(4, ['api'])], { grouped: false, reason: 'No mapping.' }) });
  assert.equal(out.grouped, false);
  assert.equal(out.reason, 'No mapping.');
  assert.deepEqual(out.commits, []);
});

test('malformed commit lists never throw; bad rows are dropped', () => {
  for (const bad of [undefined, null, 'x', [], {}, { data: {} }, commitsBody([], { grouped: 1 }), commitsBody([], { snapshot: null })]) assert.equal(parseCommitImpacts(bad), null);
  const out = parseCommitImpacts({ data: commitsBody([
    null, 'x', { commit: '' }, { title: 'no hash' },
    { commit: 'h1', components: ['ui', 4, '', null], componentEdges: [{ id: 'a', kind: 'cross', source: 'a', target: 'b', added: '2', removed: -1 }, { id: 'b', kind: 'bad' }], comparable: 'yes', date: 'not a date', unmappedCount: 'x' },
  ], { commits: undefined, skipped: -3 }) });
  assert.equal(out.commits.length, 0, 'a missing list is no commits');
  const withRows = parseCommitImpacts({ data: commitsBody([
    null, 'x', { commit: '' }, { title: 'no hash' },
    { commit: 'h1', components: ['ui', 4, '', null], componentEdges: [{ id: 'a', kind: 'cross', source: 'a', target: 'b', added: '2', removed: -1 }, { id: 'b', kind: 'bad' }], comparable: 'yes', date: 'not a date', unmappedCount: 'x' },
  ]) });
  assert.equal(withRows.commits.length, 1);
  assert.deepEqual(withRows.commits[0], { commit: 'h1', title: '', date: '', evidenceId: '', comparable: false, components: ['ui'], componentEdges: [edge('a', 'a', 'b', 0, 0)], unmappedCount: 0 });
  assert.equal(out.skipped, 0);
});

test('the commit list is capped', () => {
  const out = parseCommitImpacts({ data: commitsBody(Array.from({ length: MAX_COMMITS + 30 }, (_, i) => ({ ...commit(1, ['a']), commit: `h${i}` }))) });
  assert.equal(out.commits.length, MAX_COMMITS);
});

// ---- requests --------------------------------------------------------------------------------------------------------------

test('the requests ask the right addresses and parse the envelope', async t => {
  signedIn(t);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url));
    return Response.json({ success: true, data: String(url).includes('/evidences/') ? evidenceBody() : commitsBody([commit(4, ['api'])]) });
  });
  const impact = await getEvidenceImpact('p 1', 'e/3');
  assert.equal(impact.evidence.commit, 'h3');
  const list = await getCommitImpacts('p1', 's5', 20);
  assert.equal(list.commits.length, 1);
  await getCommitImpacts('p1');
  assert.match(urls[0], /\/projects\/p%201\/evidences\/e%2F3\/impact$/);
  assert.match(urls[1], /\/projects\/p1\/architecture\/impact\?snapshotId=s5&limit=20$/);
  assert.match(urls[2], /\/projects\/p1\/architecture\/impact$/, 'no query when nothing is asked');
});

test('a response that is not an impact answer is an error, not a blank page', async t => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: { unexpected: true } }));
  await assert.rejects(getEvidenceImpact('p1', 'e1'), /invalid change summary/);
  await assert.rejects(getCommitImpacts('p1', 's1'), /invalid commit list/);
});

test('server errors keep their message', async t => {
  signedIn(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Evidence not found' } }, { status: 404 }));
  await assert.rejects(getEvidenceImpact('p1', 'e1'), error => error.status === 404 && error.message === 'Evidence not found');
});

// ---- view helpers ----------------------------------------------------------------------------------------------------------

test('commitsTouchingComponent keeps the order, honours the cap and skips commits that could not be compared', () => {
  const impacts = parseCommitImpacts({ data: commitsBody([
    commit(8, ['api']), commit(7, ['ui']), commit(6, ['api', 'ui']), commit(5, ['api'], [], { comparable: false }),
    commit(4, [], [edge('ui->api', 'ui', 'api', 1, 0)]), commit(3, ['api']), commit(2, ['api']),
  ]) });
  assert.deepEqual(commitsTouchingComponent(impacts, 'api').map(c => c.commit), ['h8', 'h6', 'h4', 'h3', 'h2']);
  assert.deepEqual(commitsTouchingComponent(impacts, 'api', 2).map(c => c.commit), ['h8', 'h6']);
  assert.deepEqual(commitsTouchingComponent(impacts, 'ui').map(c => c.commit), ['h7', 'h6', 'h4'], 'an edge ending or starting at the component counts');
  assert.deepEqual(commitsTouchingComponent(impacts, 'db'), []);
  assert.deepEqual(commitsTouchingComponent(impacts, ''), []);
  assert.deepEqual(commitsTouchingComponent(impacts, 'api', 0), []);
});

test('commitsTouchingComponent copes with missing or odd input', () => {
  for (const bad of [null, undefined, {}, { commits: 'x' }]) assert.deepEqual(commitsTouchingComponent(bad, 'api'), []);
  const grouped = parseCommitImpacts({ data: commitsBody([], { grouped: false }) });
  assert.deepEqual(commitsTouchingComponent(grouped, 'api'), [], 'a snapshot with no grouping has no commits to list');
});

test('componentDelta sums the changed dependencies that touch the component', () => {
  const c = commit(4, ['api'], [edge('ui->api', 'ui', 'api', 2, 1), edge('api->db', 'api', 'db', 1, 0), edge('ui->db', 'ui', 'db', 9, 9), edge('api', 'api', 'api', 1, 1, 'internal')]);
  assert.deepEqual(componentDelta(c, 'api'), { added: 4, removed: 2 });
  assert.deepEqual(componentDelta(c, 'db'), { added: 10, removed: 9 });
  assert.deepEqual(componentDelta(c, 'zzz'), { added: 0, removed: 0 });
});

test('deltaText is empty for no change and agrees in number', () => {
  assert.equal(deltaText({ added: 0, removed: 0 }), '');
  assert.equal(deltaText({ added: 1, removed: 0 }), '+1 / -0 dependency');
  assert.equal(deltaText({ added: 3, removed: 1 }), '+3 / -1 dependencies');
});

test('impactSummary says what changed in one line, and what it does not know', () => {
  assert.equal(impactSummary(parseEvidenceImpact(evidenceBody())), 'Changed 2 components · +3 / -1 dependencies');
  assert.equal(impactSummary(parseEvidenceImpact(evidenceBody({ components: [{ id: 'ui' }] }))), 'Changed 1 component · +3 / -1 dependencies');
  assert.equal(impactSummary(parseEvidenceImpact(evidenceBody({ components: [], fileChanges: { pairsAdded: 0, pairsRemoved: 0 } }))), 'No component changed · +0 / -0 dependencies');
  assert.equal(impactSummary(parseEvidenceImpact(evidenceBody({ grouped: false }))), 'Not grouped into components yet · +3 / -1 dependencies');
  assert.match(impactSummary(parseEvidenceImpact(evidenceBody({ hasBaseline: false, baseline: null }))), /^First mined commit/);
});

test('andMore only speaks when something is hidden', () => {
  assert.equal(andMore(14, 10), 'and 4 more');
  assert.equal(andMore(10, 10), '');
  assert.equal(andMore(3, 10), '');
  assert.equal(andMore(NaN, 1), '');
});

test('shortHash is safe to print and to put in a link', () => {
  assert.equal(shortHash('0123456789abcdef'), '0123456');
  assert.equal(shortHash('abc'), 'abc');
  assert.equal(shortHash('ab c/<script>d'), 'abcscri', 'only letters, digits and . _ - survive');
  assert.equal(shortHash('0123456789', 4), '0123');
  for (const bad of [undefined, null, 5, {}, []]) assert.equal(shortHash(bad), '');
});

test('shortDate is a UTC calendar date, or nothing', () => {
  assert.equal(shortDate('2024-01-03T23:30:00.000Z'), '2024-01-03');
  assert.equal(shortDate('nope'), '');
  assert.equal(shortDate(undefined), '');
  assert.equal(shortDate(5), '');
});

test('evidenceLink opens the Evidence page of the workspace on that commit', () => {
  assert.equal(evidenceLink('p1', 'abc1234'), '/evidence?projectId=p1&commit=abc1234');
  assert.equal(evidenceLink('p 1', 'a&b'), '/evidence?projectId=p%201&commit=a%26b');
});

test('linkedEvidence finds the evidence a ?commit= link names, until its drawer is closed', () => {
  const list = [{ id: 'e1', commit: 'abc1234' }, { id: 'e2', commit: 'def5678' }];
  assert.equal(linkedEvidence(list, 'def5678', null).id, 'e2');
  assert.equal(linkedEvidence(list, 'def5678', 'def5678'), null, 'a closed link does not open again');
  assert.equal(linkedEvidence(list, 'def5678', 'abc1234').id, 'e2', 'a different link still opens');
  assert.equal(linkedEvidence(list, 'zzz', null), null);
  assert.equal(linkedEvidence(list, null, null), null);
  assert.equal(linkedEvidence(list, '', null), null);
  assert.equal(linkedEvidence([], 'abc1234', null), null, 'nothing loaded yet');
  assert.equal(linkedEvidence(undefined, 'abc1234', null), null);
  assert.equal(linkedEvidence([{ id: 'x' }, null].filter(Boolean), 'abc1234', null), null, 'rows without a commit never match');
});

test('linkedCommitMissing is true only when a link names a commit that is absent from a loaded list', () => {
  const list = [{ commit: 'abc1234' }, { commit: 'def5678' }];
  assert.equal(linkedCommitMissing(list, 'zzz'), true);
  assert.equal(linkedCommitMissing(list, 'def5678'), false);
  assert.equal(linkedCommitMissing(list, null), false, 'no link, nothing to say');
  assert.equal(linkedCommitMissing(list, ''), false);
  assert.equal(linkedCommitMissing([], 'zzz'), false, 'nothing loaded yet: no note');
  assert.equal(linkedCommitMissing(undefined, 'zzz'), false);
  assert.equal(linkedCommitMissing([null, { commit: 'zzz' }], 'zzz'), false, 'bad rows are skipped, not thrown on');
});

test('changeLabel names both sides, or says a side has no component', () => {
  const nameOf = id => id.toUpperCase();
  assert.equal(changeLabel({ kind: 'cross', source: 'ui', target: 'api' }, nameOf), 'UI → API');
  assert.equal(changeLabel({ kind: 'internal', source: 'api', target: 'api' }, nameOf), 'Inside API');
  assert.equal(changeLabel({ kind: 'unmapped', source: 'api', target: null }, nameOf), 'API → files in no component');
  assert.equal(changeLabel({ kind: 'unmapped', source: null, target: 'db' }, nameOf), 'files in no component → DB');
});

test('the note says what the data is', () => {
  assert.match(IMPACT_NOTE, /^INFERENCE: computed by comparing mined snapshots/);
});
