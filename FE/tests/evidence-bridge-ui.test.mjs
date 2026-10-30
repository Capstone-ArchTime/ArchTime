import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { componentScene, classScene } from '../src/features/architecture/scene.ts';
import { THEMES } from '../src/features/architecture/theme.ts';
import { NO_HIGHLIGHT } from '../src/features/architecture/highlight.ts';
import { getFixture } from '../src/features/architecture/fixtures.ts';
const { default: Inspector, ChangedInCommits } = await import('../src/components/architecture/Inspector.tsx');
const { useCommitImpacts } = await import('../src/features/useCommitImpacts.ts');

const A = 'src/ui/a.ts', B = 'src/api/b.ts';
const comp = (id, name, role, memberIds) => ({ id, name, role, label: 'INFERENCE', description: `${name} description`, memberIds });
const fileView = {
  schemaVersion: 1, projectId: 'p1', snapshotId: 's5', title: 't', generator: 'cluster-only', unit: 'file',
  components: [comp('ui', 'UI', 'controller', [A]), comp('api', 'API', 'service', [B])],
  classes: [{ id: A, name: 'a.ts', componentId: 'ui', path: A }, { id: B, name: 'b.ts', componentId: 'api', path: B }],
  classEdges: [],
  edges: [{ id: 'ui->api', source: 'ui', target: 'api', weight: 1, kinds: { imports: 1 }, evidence: [{ fromClass: A, toClass: B, kind: 'imports', path: A }] }],
};
const dottedView = { ...fileView, unit: 'class', edges: [{ ...fileView.edges[0], evidence: [{ fromClass: 'com.shop.OrderController', toClass: 'com.shop.OrderService', kind: 'injects', path: 'src/OrderController.java', line: 12 }] }] };

const props = (view, extra = {}) => ({
  view, scene: componentScene(view), theme: THEMES.dark, highlight: NO_HIGHLIGHT, onSelectNode() {}, onSelectEdge() {}, onOpen() {}, ...extra,
});
const render = element => renderToStaticMarkup(createElement(MemoryRouter, null, element));
const inspect = (view, extra) => render(createElement(Inspector, props(view, extra)));

const touching = (n, components, edges = []) => ({ commit: `abc123${n}`, title: `change ${n}`, date: `2024-01-0${n}T10:00:00.000Z`, evidenceId: `e${n}`, comparable: true, components, componentEdges: edges, unmappedCount: 0 });
const done = (commits, extra = {}) => ({ status: 'done', impacts: { label: 'INFERENCE', note: '', snapshot: { id: 's5', hash: 'h5', title: '', date: '' }, limit: 20, grouped: true, mapping: { generator: 'x', createdAt: '' }, commits, skipped: 0, ...extra } });
const section = (state, id = 'api') => render(createElement(ChangedInCommits, { projectId: 'p1', componentId: id, state, onRetry() {} }));

// ---- the "Changed in commits" section ----------------------------------------------------------------------------------------

test('a selected component lists its recent commits: hash chip linking to the evidence, title, date and the INFERENCE note', () => {
  const html = section(done([touching(4, ['api'], [{ id: 'ui->api', kind: 'cross', source: 'ui', target: 'api', added: 2, removed: 1 }]), touching(3, ['ui'])]));
  assert.match(html, /aria-label="Changed in commits"/);
  assert.match(html, /href="\/evidence\?projectId=p1&amp;commit=abc1234"/);
  assert.match(html, />abc1234</);
  assert.match(html, /change 4/);
  assert.match(html, /2024-01-04 · \+2 \/ -1 dependencies/);
  assert.doesNotMatch(html, /change 3/, 'a commit that touched another component is not listed');
  assert.match(html, /INFERENCE: computed by comparing mined snapshots/);
});

test('at most five commits are shown, with how many more there are', () => {
  const html = section(done(Array.from({ length: 8 }, (_, i) => touching(i + 1, ['api']))));
  assert.equal(html.match(/<li /g).length, 5);
  assert.match(html, /and 3 more among the recent commits/);
});

test('loading, error and not-grouped states are each said in words, and the error offers a retry', () => {
  assert.match(section({ status: 'loading' }), /role="status"[^>]*>Looking through the recent commits/);
  assert.match(section({ status: 'idle' }), /Looking through the recent commits/);
  const error = section({ status: 'error', message: 'Cannot reach the server.' });
  assert.match(error, /Could not load the commits \(Cannot reach the server\.\)/);
  assert.match(error, /Try again/);
  assert.match(section({ status: 'done', impacts: { ...done([]).impacts, grouped: false, commits: [] } }), /not grouped into components yet/);
});

test('a component nobody changed says so, with the number of commits that were checked', () => {
  const html = section(done([touching(4, ['ui']), touching(3, ['ui'])]));
  assert.match(html, /No recorded changes to this component in the 2 most recent commits/);
  assert.doesNotMatch(html, /<ul/);
});

test('commits without a mined snapshot are mentioned, not hidden', () => {
  assert.match(section(done([touching(4, ['api'])], { skipped: 2 })), /2 recent commits have no mined snapshot/);
  assert.match(section(done([touching(4, ['api'])], { skipped: 1 })), /1 recent commit has no mined snapshot/);
});

test('hashes and titles from the server are escaped, never injected', () => {
  const html = section(done([{ ...touching(4, ['api']), commit: 'a<b>c"d', title: '<img src=x onerror=1>' }]));
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;img/);
});

// ---- in the inspector --------------------------------------------------------------------------------------------------------

test('the section sits in the component panel of a workspace, and never appears without one (samples)', () => {
  const view = fileView;
  const withCommits = inspect(view, { selectedNode: 'api', commits: { projectId: 'p1', state: done([touching(4, ['api'])]), onRetry() {} } });
  assert.match(withCommits, /aria-label="Component details"/);
  assert.match(withCommits, /Changed in commits/);
  const sample = getFixture('shophub').view;
  const html = inspect(sample, { selectedNode: sample.components[0].id });
  assert.match(html, /aria-label="Component details"/);
  assert.doesNotMatch(html, /Changed in commits/);
});

test('the rest of the component panel works while the commits load or fail', () => {
  for (const state of [{ status: 'loading' }, { status: 'error', message: 'boom' }]) {
    const html = inspect(fileView, { selectedNode: 'api', commits: { projectId: 'p1', state, onRetry() {} } });
    assert.match(html, /Depends on \(0\)/);
    assert.match(html, /Used by \(1\)/);
    assert.match(html, /SHOW 1 FILE/);
  }
});

// ---- the dependency (edge) panel ---------------------------------------------------------------------------------------------

test('a file-level dependency lists full relative paths, not the extension', () => {
  const html = inspect(fileView, { selectedEdge: 'ui->api' });
  assert.match(html, /src\/ui\/a\.ts → src\/api\/b\.ts/);
  assert.doesNotMatch(html, />ts → ts</);
  assert.match(html, /imports · src\/ui\/a\.ts/);
});

test('without a line the panel says the analysis is static and file level', () => {
  assert.match(inspect(fileView, { selectedEdge: 'ui->api' }), /Static import analysis, file level \(the line is not recorded\)\./);
  const noLine = inspect({ ...dottedView, edges: [{ ...dottedView.edges[0], evidence: [{ ...dottedView.edges[0].evidence[0], line: undefined }] }] }, { selectedEdge: 'ui->api' });
  assert.match(noLine, /Static import analysis \(the line is not recorded\)\./);
});

test('with a line there is no such hint, and the line is shown', () => {
  const html = inspect(dottedView, { selectedEdge: 'ui->api' });
  assert.match(html, /src\/OrderController\.java:12/);
  assert.doesNotMatch(html, /the line is not recorded/);
});

test('class-level names keep the last part of the dotted name', () => {
  assert.match(inspect(dottedView, { selectedEdge: 'ui->api' }), /OrderController → OrderService/);
  const noUnit = { ...dottedView, unit: undefined };
  assert.match(inspect(noUnit, { selectedEdge: 'ui->api' }), /OrderController → OrderService/, 'the default unit is the class');
});

test('the inner file view also shows full paths for its dependencies', () => {
  const view = { ...fileView, classEdges: [{ source: A, target: B, kind: 'imports', path: A }] };
  const scene = classScene({ ...view, edges: view.edges }, 'ui');
  const edge = scene.edges[0];
  assert.ok(edge, 'the inner view draws the file dependency');
  assert.match(render(createElement(Inspector, { ...props(view), scene, selectedEdge: edge.id })), /src\/ui\/a\.ts → src\/api\/b\.ts/);
});

// ---- wording -----------------------------------------------------------------------------------------------------------------

test('provenance texts say how a role was decided, not that anything was confirmed', () => {
  const html = inspect(fileView, { selectedNode: 'api' });
  assert.match(html, /decided from folder names that matched a known pattern, or by an AI model reading file paths/);
  assert.doesNotMatch(html, /[Cc]onfirmed/);
  const overview = inspect(fileView);
  assert.match(overview, /Consistent with the import graph/);
  assert.doesNotMatch(overview, /Verified/);
  assert.match(overview, /how a component&#x27;s role was decided/);
  assert.match(overview, /grouping into components is computed from import dependencies, so it is an inference/);
  assert.doesNotMatch(overview, /how well the evidence supports/);
});

// ---- the lazy fetch hook ---------------------------------------------------------------------------------------------------

function Probe({ projectId, snapshotId, wanted, version }) {
  const { status } = useCommitImpacts(projectId, snapshotId, wanted, version);
  return createElement('span', null, status);
}
const probe = props => renderToStaticMarkup(createElement(Probe, props));

test('nothing is asked for until a component is selected, and never without a workspace', () => {
  assert.match(probe({ projectId: 'p1', snapshotId: 's1', wanted: false }), />idle</);
  assert.match(probe({ projectId: 'p1', snapshotId: 's1', wanted: true }), />loading</);
  assert.match(probe({ projectId: undefined, snapshotId: 's1', wanted: true }), />idle</, 'a sample has no workspace');
  assert.match(probe({ projectId: 'p1', snapshotId: undefined, wanted: true }), />idle</);
});

// ---- through the viewer ----------------------------------------------------------------------------------------------------

const { default: ArchitectureViewer } = await import('../src/components/architecture/ArchitectureViewer.tsx');
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { innerWidth: 1700, localStorage: { getItem: () => null, setItem() {} } } });
const shop = getFixture('shophub').view;
const viewer = extra => renderToStaticMarkup(createElement(ArchitectureViewer, { view: shop, base: { view: 'shophub' }, hash: `#view=shophub&focus=${shop.components[0].id}`, commit() {}, focusMode: false, onFocusMode() {}, ...extra }));

test('the viewer asks for the commits of a workspace component, and a sample never does', () => {
  const html = viewer({ projectId: 'p1', snapshotId: 's5' });
  assert.match(html, /aria-label="Component details"/);
  assert.match(html, /Changed in commits/);
  assert.match(html, /Looking through the recent commits/);
  assert.doesNotMatch(viewer({}), /Changed in commits/, 'no workspace, no commits');
});

test('the Evidence page loads enough rows for every commit the Inspector can link to', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/pages/developer-analyst/Evidence.tsx', import.meta.url), 'utf8');
  const limit = Number(/\/evidences\?limit=(\d+)/.exec(source)?.[1]);
  assert.ok(limit >= 20, 'the Inspector lists commits from the 20 most recent; the default page of 10 would leave dead chips');
});

test('nothing is asked while no component is selected', () => {
  assert.doesNotMatch(viewer({ projectId: 'p1', snapshotId: 's5', hash: '#view=shophub' }), /Changed in commits/);
});
