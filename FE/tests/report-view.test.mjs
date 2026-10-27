import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackReportFileName, parseReport, parseReportList } from '../src/features/report-view.ts';

// The shape GenerateProjectReportUseCase stores (BE), so the page shows what the server sent and nothing it did not.
const stored = {
  id: 'r1', projectId: 'p1', title: 'Shop architecture report', type: 'architecture_summary', status: 'ready', summary: 'Two components.',
  createdAt: '2026-10-27T08:00:00.000Z',
  data: {
    project: { name: 'Cửa hàng', repoUrl: 'https://github.com/x/shop.git', status: 'COMPLETED' },
    architecture: { revision: 4, componentCount: 2, dependencyCount: 1, components: [{ id: 'b', name: 'Billing', kind: 'Service', description: 'Invoices' }, { id: 'o', name: '', kind: 'Service' }], dependencies: [{ source: 'o', target: 'Billing', label: 'REST' }] },
    rules: { total: 1, active: 0, items: [{ name: 'No UI to DB', source: 'UI', target: 'DB', constraint: 'forbidden', severity: 'error', enabled: false }] },
    decisions: { total: 1, accepted: 1, items: [{ number: 1, title: 'Queue', status: 'Accepted' }] },
    snapshots: { total: 12, first: { hash: 'a1b2c3d', title: 'Init', date: '2026-01-01T00:00:00Z' }, latest: null },
  },
};

test('a stored report is read as the server sent it', () => {
  const r = parseReport(stored);
  assert.equal(r.status, 'ready');
  assert.equal(r.project.name, 'Cửa hàng');
  assert.deepEqual(r.figures, { components: 2, dependencies: 1, rules: 1, activeRules: 0, decisions: 1, acceptedDecisions: 1, minedCommits: 12, mapRevision: 4 });
  assert.deepEqual(r.components.map(c => c.name), ['Billing', 'o'], 'a component without a name shows its id');
  assert.deepEqual(r.history, { first: { hash: 'a1b2c3d', title: 'Init', date: '2026-01-01T00:00:00Z' }, latest: null });
  assert.equal(r.rules[0].enabled, false);
  assert.equal(r.decisions[0].title, 'Queue');
});

test('older reports, without the lists, say the lists were not stored instead of showing empty ones', () => {
  const r = parseReport({ id: 'r0', status: 'ready', data: { architecture: { componentCount: 3, components: [{ id: 'a', name: 'A', kind: 'x' }] }, rules: { total: 2 }, decisions: { total: 0 }, snapshots: { total: 5 } } });
  assert.equal(r.dependencies, null);
  assert.equal(r.rules, null);
  assert.equal(r.decisions, null);
  assert.equal(r.figures.rules, 2);
  assert.equal(r.title, 'Architecture report');
});

test('anything that is not a report is left out, and a broken list is an error', () => {
  assert.equal(parseReport(null), null);
  assert.equal(parseReport({ title: 'no id' }), null);
  assert.deepEqual(parseReportList({ data: { reports: [stored, 'x', {}] } }).map(r => r.id), ['r1']);
  assert.throws(() => parseReportList({ data: {} }), /invalid list/);
  assert.equal(parseReport({ ...stored, status: 'completed' }).status, 'ready', 'unknown statuses read as ready');
});

test('a fallback file name is plain letters plus the date', () => {
  assert.equal(fallbackReportFileName(parseReport(stored)), 'cua-hang-architecture-report-2026-10-27.pdf');
  assert.equal(fallbackReportFileName({ project: { name: '' }, createdAt: null }), 'workspace-architecture-report-undated.pdf');
});
