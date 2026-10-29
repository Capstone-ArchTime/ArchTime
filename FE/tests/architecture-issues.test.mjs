import test from 'node:test';
import assert from 'node:assert/strict';
import { THRESHOLDS, issuesFor, nameList, planShow, summarize } from '../src/features/architecture/issues.ts';
import { getFixture } from '../src/features/architecture/fixtures.ts';

// A small layered system: web (controller) -> orders (service) -> store (repository), plus a billing service.
const comp = (id, name, role, files = 4) => ({ id, name, role, label: 'FACT', description: '', memberIds: Array.from({ length: files }, (_, i) => `src/${id}/f${i}.ts`) });
const edge = (source, target, weight = 1) => ({ id: `${source}->${target}`, source, target, weight, kinds: {}, evidence: [] });
const view = (over = {}) => ({
  components: [comp('web', 'Web API', 'controller'), comp('orders', 'Orders', 'service'), comp('billing', 'Billing', 'service'), comp('store', 'Store', 'repository')],
  edges: [edge('web', 'orders', 3), edge('orders', 'store', 5), edge('billing', 'store', 2)],
  ...over,
});
const healthy = () => ({
  grounding: { score: 1, ungrounded: [] }, acyclicity: { score: 1, cycles: [] }, layering: { score: 1, violations: [] },
  balance: 0.95, components: 4,
});
const quality = (over = {}) => ({ ...healthy(), ...over });
const of = (issues, type) => issues.filter(i => i.type === type);

test('a healthy view reports nothing, with or without a reference or a previous snapshot', () => {
  assert.deepEqual(issuesFor({ view: view(), quality: quality() }), []);
  assert.deepEqual(issuesFor({ view: view(), quality: quality({ agreement: { score: 0.95, common: 16 }, stability: { score: 0.9, common: 16, snapshotId: 's0' } }), canEdit: true }), []);
  assert.deepEqual(issuesFor({ view: view() }), [], 'no quality data and no loops: nothing to say');
  const ledger = getFixture('ledger').view;
  assert.deepEqual(issuesFor({ view: ledger }), [], 'the loop-free sample is clean');
  const s = summarize([]);
  assert.deepEqual([s.count, s.worst, s.label], [0, null, 'No issues']);
});

test('a dependency loop is high severity and names the components and the weakest link to cut', () => {
  const v = view({ edges: [edge('orders', 'billing', 7), edge('billing', 'orders', 2), edge('web', 'orders')] });
  const [issue, ...others] = issuesFor({ view: v, quality: quality({ acyclicity: { score: 0.5, cycles: [['billing', 'orders']] } }) });
  assert.equal(others.length, 0);
  assert.equal(issue.type, 'cycle');
  assert.equal(issue.severity, 'high');
  assert.equal(issue.title, 'Circular dependency between Billing and Orders');
  assert.deepEqual(issue.components, ['billing', 'orders']);
  assert.deepEqual(issue.edges.sort(), ['billing->orders', 'orders->billing']);
  assert.match(issue.explanation, /depend on each other in a loop/);
  assert.match(issue.suggestion, /moving the shared part to a lower layer/);
  assert.match(issue.suggestion, /invert one dependency/);
  assert.match(issue.suggestion, /Billing → Orders \(2 dependencies/, 'the lightest arrow is the one to cut');
});

test('loops come from the drawing itself when the server sent no measures (samples)', () => {
  const shop = getFixture('shophub').view;
  const found = of(issuesFor({ view: shop }), 'cycle');
  assert.equal(found.length, 3);
  assert.ok(found.every(i => i.severity === 'high' && i.components.length === 2));
  assert.deepEqual(found.map(i => i.components.join('+')).sort(), ['customer+notification', 'inventory+messaging', 'order+payment']);
  // Ids the view does not have are ignored rather than shown as raw ids.
  assert.deepEqual(issuesFor({ view: view(), quality: quality({ acyclicity: { score: 0, cycles: [['ghost', 'phantom'], ['web', 'ghost']] } }) }), []);
});

test('a dependency pointing up the layers names the edge and is medium, or high when most dependencies are wrong', () => {
  const v = view({ edges: [edge('web', 'orders', 3), edge('store', 'web', 4)] });
  const violation = { source: 'store', target: 'web', weight: 4 };
  const mild = issuesFor({ view: v, quality: quality({ layering: { score: 0.6, violations: [violation] } }) });
  assert.equal(mild.length, 1);
  assert.equal(mild[0].type, 'upward');
  assert.equal(mild[0].severity, 'medium');
  assert.equal(mild[0].title, 'Upward dependency: Store → Web API');
  assert.match(mild[0].explanation, /Store \(Repository\) depends on Web API \(Controller\)/);
  assert.match(mild[0].explanation, /4 dependencies/);
  assert.match(mild[0].suggestion, /let Web API call Store instead/);
  assert.deepEqual(mild[0].edges, ['store->web']);
  assert.deepEqual(mild[0].components, ['store', 'web']);
  const severe = issuesFor({ view: v, quality: quality({ layering: { score: THRESHOLDS.layeringHigh - 0.01, violations: [violation] } }) });
  assert.equal(severe[0].severity, 'high');
  const boundary = issuesFor({ view: v, quality: quality({ layering: { score: THRESHOLDS.layeringHigh, violations: [violation] } }) });
  assert.equal(boundary[0].severity, 'medium', 'exactly at the threshold is not yet high');
});

test('many upward dependencies: the heaviest are listed, the rest are rolled into one card', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `r${i}`);
  const v = { components: [comp('web', 'Web API', 'controller'), ...ids.map(id => comp(id, id.toUpperCase(), 'repository'))], edges: ids.map((id, i) => edge(id, 'web', i + 1)) };
  const violations = ids.map((id, i) => ({ source: id, target: 'web', weight: i + 1 }));
  const found = issuesFor({ view: v, quality: quality({ layering: { score: 0.7, violations } }) });
  const listed = of(found, 'upward');
  assert.equal(listed.length, THRESHOLDS.upwardListed);
  assert.deepEqual(listed.map(i => i.edges[0]), ['r8->web', 'r7->web', 'r6->web', 'r5->web', 'r4->web'], 'heaviest first');
  const more = of(found, 'upward-more');
  assert.equal(more.length, 1);
  assert.equal(more[0].title, '4 more upward dependencies');
  assert.equal(more[0].edges.length, 4);
  assert.ok(more[0].components.includes('web') && more[0].components.includes('r0'));
});

test('low agreement with the reference is an explicit "Differs from the intended architecture" issue', () => {
  const at = score => issuesFor({ view: view(), quality: quality({ agreement: { score, common: 40 } }), canEdit: true }).filter(i => i.type === 'deviation');
  const high = at(0.3);
  assert.equal(high.length, 1);
  assert.equal(high[0].title, 'Differs from the intended architecture');
  assert.equal(high[0].severity, 'high');
  assert.match(high[0].explanation, /only 30%/);
  assert.match(high[0].explanation, /40 files/);
  assert.match(high[0].suggestion, /Review which files moved/);
  assert.match(high[0].suggestion, /update the reference architecture/);
  assert.equal(high[0].action, 'set-reference');
  assert.equal(at(THRESHOLDS.agreementHigh)[0].severity, 'medium', 'at the high threshold it is medium');
  assert.equal(at(0.79)[0].severity, 'medium');
  assert.equal(at(THRESHOLDS.agreementMedium).length, 0, 'at or above the medium threshold the grouping is close enough');
  assert.equal(at(-0.2)[0].severity, 'high', 'a negative score reads as 0%');
  assert.match(at(-0.2)[0].explanation, /only 0%/);
});

test('someone who cannot edit is told who can act instead of being offered the reference editor', () => {
  const [issue] = issuesFor({ view: view(), quality: quality({ agreement: { score: 0.4, common: 12 } }), canEdit: false });
  assert.equal(issue.type, 'deviation');
  assert.match(issue.suggestion, /A maintainer of this workspace can review/);
  assert.equal(issue.action, undefined);
});

test('no reference means no deviation claim, only a hint to set one when the person can edit', () => {
  const editor = issuesFor({ view: view(), quality: quality(), canEdit: true });
  assert.equal(editor.length, 1);
  assert.equal(editor[0].type, 'no-reference');
  assert.equal(editor[0].kind, 'hint');
  assert.equal(editor[0].action, 'set-reference');
  assert.equal(of(editor, 'deviation').length, 0);
  assert.deepEqual(issuesFor({ view: view(), quality: quality(), canEdit: false }), [], 'a reader is not nagged about it');
  // A hint is not an issue: the chip would still say "No issues".
  const s = summarize(editor);
  assert.deepEqual([s.count, s.hints, s.worst, s.label], [0, 1, null, 'No issues']);
});

test('a big change since the previous snapshot is reported, with its own thresholds', () => {
  const at = score => of(issuesFor({ view: view(), quality: quality({ stability: { score, common: 30, snapshotId: 's0' } }) }), 'drift');
  assert.equal(at(0.2)[0].severity, 'medium');
  assert.equal(at(THRESHOLDS.stabilityMedium)[0].severity, 'low');
  assert.equal(at(0.79)[0].severity, 'low');
  assert.equal(at(THRESHOLDS.stabilityLow).length, 0);
  assert.match(at(0.2)[0].suggestion, /Compare revisions/);
});

test('names the paths do not support are listed with the components to highlight', () => {
  const v = view();
  v.components[1].name = 'Fancy Hub';
  const few = of(issuesFor({ view: v, quality: quality({ grounding: { score: 0.75, ungrounded: ['Fancy Hub'] } }), canEdit: true }), 'ungrounded');
  assert.equal(few.length, 1);
  assert.equal(few[0].severity, 'low');
  assert.equal(few[0].title, 'The name "Fancy Hub" is not supported by its files');
  assert.deepEqual(few[0].components, ['orders']);
  assert.match(few[0].suggestion, /Rename them .* or regenerate/);
  assert.equal(few[0].action, 'regenerate');
  const many = issuesFor({ view: v, quality: quality({ grounding: { score: 0.25, ungrounded: ['Fancy Hub', 'Core Services', 'Misc'] } }), canEdit: false });
  assert.equal(many[0].severity, 'medium');
  assert.equal(many[0].title, '3 component names are not supported by their files');
  assert.match(many[0].explanation, /"Fancy Hub", "Core Services" and "Misc" have no word/);
  assert.match(many[0].suggestion, /Ask a maintainer/);
  assert.equal(many[0].action, undefined);
  assert.equal(issuesFor({ view: v, quality: quality({ grounding: { score: THRESHOLDS.groundingMedium, ungrounded: ['Misc'] } }) })[0].severity, 'low');
});

test('one component holding most files is a low-severity finding naming it', () => {
  const v = view({ components: [comp('web', 'Web API', 'controller', 2), comp('orders', 'Orders', 'service', 40), comp('store', 'Store', 'repository', 2)], edges: [] });
  const found = issuesFor({ view: v, quality: quality({ balance: 0.3 }) });
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'unbalanced');
  assert.equal(found[0].severity, 'low');
  assert.equal(found[0].title, 'Orders holds most of the files');
  assert.match(found[0].explanation, /91% of all files \(40 of 44\)/);
  assert.deepEqual(found[0].components, ['orders']);
  assert.equal(issuesFor({ view: v, quality: quality({ balance: THRESHOLDS.balanceLow }) }).length, 0);
});

test('stale components, an AI fallback and notes', () => {
  const stale = issuesFor({ view: view(), stale: true, canEdit: true });
  assert.equal(stale.length, 1);
  assert.deepEqual([stale[0].type, stale[0].severity, stale[0].action], ['stale', 'medium', 'regenerate']);
  assert.match(issuesFor({ view: view(), stale: true })[0].suggestion, /Ask a maintainer/);
  assert.equal(issuesFor({ view: view(), stale: false }).length, 0);

  const fallback = issuesFor({ view: view(), receipt: { accepted: false, fallbackReason: 'The model returned invalid JSON.' }, canEdit: true });
  assert.equal(fallback[0].type, 'ai-fallback');
  assert.match(fallback[0].explanation, /The model returned invalid JSON\. The grouping by dependencies is shown instead\./);
  assert.match(issuesFor({ view: view(), receipt: { accepted: false } })[0].explanation, /No answer passed verification/);

  assert.equal(issuesFor({ view: view(), receipt: { accepted: true } }).length, 0);
  const notes = issuesFor({ view: view(), receipt: { accepted: true, notes: ['Names only: too many files.'] } });
  assert.deepEqual([notes[0].type, notes[0].kind], ['ai-notes', 'hint']);
  assert.equal(summarize(notes).count, 0);
});

test('the verifier warning about the component count says whether there are too few or too many', () => {
  const warn = (count) => ({ code: 'V002', severity: 'warning', subject: 'components', message: 'x', evidence: { count, min: 8, max: 15 } });
  const few = issuesFor({ view: view(), warnings: [warn(5)] });
  assert.equal(few[0].title, 'Few components');
  assert.match(few[0].explanation, /5 components; a readable map usually has 8 to 15/);
  const many = issuesFor({ view: view(), warnings: [warn(22)] });
  assert.equal(many[0].title, 'Many components');
  assert.match(many[0].suggestion, /Merge closely related components/);
  const other = issuesFor({ view: view(), warnings: [{ code: 'X999', severity: 'warning', subject: 'edge-1', message: 'Something odd.' }] });
  assert.equal(other[0].title, 'Check X999');
  assert.equal(other[0].explanation, 'Something odd.');
  assert.ok(other.every(i => i.severity === 'low'));
});

test('layout problems are one low card, naming overlapping components', () => {
  const layoutIssues = [
    { code: 'L001', severity: 'error', subject: 'web,orders', message: 'overlap' },
    { code: 'L002', severity: 'error', subject: 'web->store', message: 'through' },
  ];
  const [issue] = issuesFor({ view: view(), layoutIssues });
  assert.deepEqual([issue.type, issue.severity], ['layout', 'low']);
  assert.match(issue.explanation, /2 overlaps or crossings were found while drawing \(L001, L002\)/);
  assert.deepEqual(issue.components, ['web', 'orders']);
  assert.deepEqual(issuesFor({ view: view(), layoutIssues: [] }), []);
});

test('issues are ranked: severity first, problems before hints, then by kind and size', () => {
  const v = view({ edges: [edge('orders', 'billing', 7), edge('billing', 'orders', 2), edge('store', 'web', 4)] });
  const found = issuesFor({
    view: v,
    quality: quality({
      acyclicity: { score: 0.5, cycles: [['billing', 'orders']] },
      layering: { score: 0.6, violations: [{ source: 'store', target: 'web', weight: 4 }] },
      agreement: { score: 0.2, common: 20 },
      stability: { score: 0.3, common: 20, snapshotId: 's0' },
      grounding: { score: 0.75, ungrounded: ['Billing'] },
      balance: 0.2,
    }),
    stale: true, canEdit: true,
    warnings: [{ code: 'V002', severity: 'warning', subject: 'components', message: 'x', evidence: { count: 4, min: 8, max: 15 } }],
    receipt: { accepted: true, notes: ['n'] },
  });
  assert.deepEqual(found.map(i => i.type), ['cycle', 'deviation', 'upward', 'stale', 'drift', 'ungrounded', 'unbalanced', 'view-warning', 'ai-notes']);
  const rank = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < found.length; i++) assert.ok(rank[found[i - 1].severity] <= rank[found[i].severity], 'never a milder issue before a worse one');
  const s = summarize(found);
  assert.deepEqual([s.count, s.hints, s.worst, s.label], [8, 1, 'high', '8 issues']);
  assert.deepEqual(s.bySeverity, { high: 2, medium: 3, low: 3 });
  // The same data gives the same list, in the same order.
  assert.deepEqual(issuesFor({ view: v, quality: quality({ acyclicity: { score: 0.5, cycles: [['billing', 'orders']] } }) }), issuesFor({ view: v, quality: quality({ acyclicity: { score: 0.5, cycles: [['billing', 'orders']] } }) }));
});

test('bigger loops and heavier edges rank first within the same severity', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const v = { components: ids.map(id => comp(id, id.toUpperCase(), 'service')), edges: [edge('a', 'b'), edge('b', 'a'), edge('c', 'd'), edge('d', 'e'), edge('e', 'c')] };
  const found = of(issuesFor({ view: v, quality: quality({ acyclicity: { score: 0, cycles: [['a', 'b'], ['c', 'd', 'e']] } }) }), 'cycle');
  assert.deepEqual(found.map(i => i.components.length), [3, 2]);
});

test('a summary counts a single issue in the singular and reports the worst colour', () => {
  const [issue] = issuesFor({ view: view(), stale: true });
  const s = summarize([issue]);
  assert.deepEqual([s.count, s.worst, s.label], [1, 'medium', '1 issue']);
});

test('"Show in diagram" picks the existing selection that fits: a focus, an edge, or a set of components', () => {
  assert.deepEqual(planShow({ components: ['a'], edges: [] }), { kind: 'focus', id: 'a' });
  assert.deepEqual(planShow({ components: ['a', 'b'], edges: ['a->b'] }), { kind: 'edge', id: 'a->b' });
  assert.deepEqual(planShow({ components: ['a', 'b'], edges: ['a->b', 'b->a'] }), { kind: 'set', nodes: ['a', 'b'], edges: ['a->b', 'b->a'] });
  assert.deepEqual(planShow({ components: ['a', 'b', 'c'], edges: [] }), { kind: 'set', nodes: ['a', 'b', 'c'], edges: [] });
  assert.equal(planShow({ components: [], edges: [] }), null, 'whole-diagram findings have nothing to point at');
  const [deviation] = issuesFor({ view: view(), quality: quality({ agreement: { score: 0.1, common: 9 } }) });
  assert.equal(planShow(deviation), null);
});

test('name lists read naturally', () => {
  assert.equal(nameList([]), '');
  assert.equal(nameList(['A']), 'A');
  assert.equal(nameList(['A', 'B']), 'A and B');
  assert.equal(nameList(['A', 'B', 'C']), 'A, B and C');
  assert.equal(nameList(['A', 'B', 'C', 'D', 'E']), 'A, B, C and 2 more');
});
