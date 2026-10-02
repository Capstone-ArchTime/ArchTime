import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule } from '../src/features/evaluate-rule.ts';
const diagram = { components: [{ id: 'ui' }, { id: 'api' }], dependencies: [{ source: 'ui', target: 'api' }] };
const rule = { source: 'ui', target: 'api', enabled: true, constraint: 'required' };
test('rule results respect direction and required/forbidden constraints', () => {
  assert.equal(evaluateRule(diagram, rule).label, 'Satisfied');
  assert.equal(evaluateRule(diagram, { ...rule, constraint: 'forbidden' }).label, 'Violation');
  assert.equal(evaluateRule(diagram, { ...rule, source: 'api', target: 'ui' }).label, 'Violation');
});
test('removed components require review and disabled rules do not report violations', () => {
  assert.equal(evaluateRule(diagram, { ...rule, target: 'removed' }).label, 'Needs review');
  assert.equal(evaluateRule(diagram, { ...rule, enabled: false }).label, 'Disabled');
});
