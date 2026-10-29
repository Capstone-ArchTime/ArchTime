import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { issuesFor, summarize } from '../src/features/architecture/issues.ts';
const { default: IssuesPanel, IssuesChip } = await import('../src/components/architecture/IssuesPanel.tsx');

const comp = (id, name, role) => ({ id, name, role, label: 'FACT', description: '', memberIds: [`src/${id}/a.ts`, `src/${id}/b.ts`] });
const view = { components: [comp('web', 'Web API', 'controller'), comp('orders', 'Orders', 'service'), comp('store', 'Store', 'repository')], edges: [
  { id: 'orders->web', source: 'orders', target: 'web', weight: 2, kinds: {}, evidence: [] }, { id: 'web->orders', source: 'web', target: 'orders', weight: 5, kinds: {}, evidence: [] }] };
const quality = {
  grounding: { score: 1, ungrounded: [] }, acyclicity: { score: 0.33, cycles: [['orders', 'web']] }, layering: { score: 0.4, violations: [{ source: 'store', target: 'web', weight: 3 }] },
  balance: 1, components: 3, agreement: { score: 0.3, common: 20 },
};
const render = (issues, extra = {}) => renderToStaticMarkup(createElement(IssuesPanel, { issues, summary: summarize(issues), verified: '3 components · 2 dependencies', onShow() {}, onAction() {}, ...extra }));

test('each issue is a card with its severity, what it means and what to do, worst first', () => {
  const issues = issuesFor({ view, quality, canEdit: true });
  const html = render(issues);
  const order = [...html.matchAll(/data-severity="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['high', 'high', 'high']);
  assert.match(html, /Circular dependency between Orders and Web API/);
  assert.match(html, /Differs from the intended architecture/);
  assert.match(html, /What to do: /);
  assert.match(html, /Break the loop by moving the shared part/);
  assert.match(html, /3 issues · 3 high/);
});

test('"Show in diagram" appears only when the issue points at something, and the reference action only for editors', () => {
  const issues = issuesFor({ view, quality, canEdit: true });
  const cards = render(issues).split('<li data-issue=').slice(1);
  const by = type => cards.find(c => c.includes(type));
  assert.match(by('Circular'), /Show in diagram/);
  assert.doesNotMatch(by('Differs'), /Show in diagram/, 'a finding about the whole grouping has nothing to highlight');
  assert.match(by('Differs'), /Review reference/);
  const reader = render(issuesFor({ view, quality, canEdit: false }), { onAction: undefined });
  assert.doesNotMatch(reader, /Review reference/);
});

test('a clean view says so and keeps the verified fact; hints sit under their own heading', () => {
  const clean = render([]);
  assert.match(clean, /Nothing wrong was found\. Verified: 3 components · 2 dependencies\./);
  assert.match(clean, /No issues/);
  const hint = issuesFor({ view: { components: view.components, edges: [] }, quality: { ...quality, acyclicity: { score: 1, cycles: [] }, layering: { score: 1, violations: [] }, agreement: undefined }, canEdit: true });
  const html = render(hint);
  assert.match(html, /Suggestions/);
  assert.match(html, /Set reference architecture/);
  assert.match(html, /Nothing wrong was found/, 'a hint is not an issue');
});

test('the chip shows the count in the worst colour, or a green "No issues"', () => {
  const chip = summary => renderToStaticMarkup(createElement(IssuesChip, { summary, verified: '3 components', onClick() {} }));
  const bad = chip(summarize(issuesFor({ view, quality, canEdit: true })));
  assert.match(bad, />3 issues</);
  assert.match(bad, /text-\[#fca5a5\]/);
  const fine = chip(summarize([]));
  assert.match(fine, />No issues</);
  assert.match(fine, /text-\[#86efac\]/);
  assert.doesNotMatch(fine, /fca5a5/);
});
