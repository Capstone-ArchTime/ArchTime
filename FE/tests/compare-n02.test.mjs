import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// N-02 / F-04 (T10): the Compare page's revision pickers must ask for snapshot summaries. Loading every dependency graph
// of a 1,000-snapshot workspace took ~1-4 s and ~25-36 MB (BE tests/wf02-architecture-evolution.test.mjs, WF02-08).
test('Compare lists revisions with summary=1, never every snapshot graph', () => {
  const source = fs.readFileSync(new URL('../src/pages/developer-analyst/Compare.tsx', import.meta.url), 'utf8');
  const lists = [...source.matchAll(/\/projects\/\$\{[^}]+\}\/snapshots([^`'"]*)/g)].map(m => m[1]).filter(rest => !rest.startsWith('/compare'));
  assert.ok(lists.length >= 1, 'the page lists snapshots');
  assert.ok(lists.every(rest => rest.includes('summary=1')), `every snapshot list asks for summaries: ${lists.join(', ')}`);
});
