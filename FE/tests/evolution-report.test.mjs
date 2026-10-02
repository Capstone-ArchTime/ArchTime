import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvolutionReport, reportHtml } from '../src/features/evolution-report.ts';
test('reports preserve edge direction and escape all repository-controlled text', () => {
  const base = { hash: 'a', nodes: [{ id: 'a', name: 'Old', type: 'service' }], edges: [{ source: 'a', target: 'b', type: 'call' }] };
  const target = { hash: 'b', nodes: [{ id: 'b', name: '<script>alert(1)</script>', type: 'service' }], edges: [{ source: 'b', target: 'a', type: 'call' }] };
  const report = createEvolutionReport('<img onerror=alert(1)>', base, target);
  assert.equal(report.nodesAdded.length, 1); assert.equal(report.nodesRemoved.length, 1);
  assert.equal(report.edgesAdded.length, 1); assert.equal(report.edgesRemoved.length, 1);
  const html = reportHtml(report); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;script&gt;'));
});
