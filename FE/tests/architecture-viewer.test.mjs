import './register-tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getFixture } from '../src/features/architecture/fixtures.ts';
import { PANEL_KEY } from '../src/features/architecture/panels.ts';
const { default: ArchitectureViewer } = await import('../src/components/architecture/ArchitectureViewer.tsx');

// The first render reads the window width and the remembered panel choice; there is no browser here, so both are faked.
const stored = new Map();
const setWindow = (innerWidth, remembered) => {
  stored.clear();
  if (remembered) stored.set(PANEL_KEY, JSON.stringify(remembered));
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { innerWidth, localStorage: { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) } } });
};
const shop = getFixture('shophub').view;
const render = (props = {}) => renderToStaticMarkup(createElement(ArchitectureViewer, {
  view: shop, base: { view: 'shophub' }, hash: '', commit() {}, focusMode: false, onFocusMode() {}, ...props,
}));

test('a wide window opens both panels; the issues are the first thing in the right one', () => {
  setWindow(1700);
  const html = render();
  assert.match(html, /aria-label="Layers"/);
  assert.match(html, /aria-label="Properties"/);
  assert.ok(html.indexOf('id="architecture-issues"') > html.indexOf('aria-label="Properties"'), 'the issues are inside the right panel');
  assert.ok(html.indexOf('id="architecture-issues"') < html.indexOf('aria-label="Diagram summary"'), 'and above the overview');
  assert.match(html, /3 issues/, 'the shophub sample has three dependency loops');
  assert.match(html, /Circular dependency between/);
});

test('between 1100 and 1600 only the right panel starts open, so the artboard is wider', () => {
  setWindow(1500);
  const html = render();
  assert.doesNotMatch(html, /aria-label="Layers"/);
  assert.match(html, /aria-label="Properties"/);
  assert.match(html, /w-64/);
});

test('a remembered choice is honoured', () => {
  setWindow(1500, { left: true, right: false });
  const html = render();
  assert.match(html, /aria-label="Layers"/);
  assert.doesNotMatch(html, /aria-label="Properties"/);
});

test('full screen leaves the artboard, the toolbar, the issues chip and a way back, and no panel', () => {
  setWindow(1700, { left: true, right: true });
  const html = render({ focusMode: true });
  assert.doesNotMatch(html, /aria-label="Layers"/);
  assert.doesNotMatch(html, /aria-label="Properties"/);
  assert.match(html, /Exit full screen/);
  assert.match(html, /role="toolbar"/);
  assert.match(html, /3 issues/);
  assert.doesNotMatch(render({ focusMode: false }), /Exit full screen<\/span>/);
});

test('a narrow window shows buttons to open the panels instead of squeezing the artboard', () => {
  setWindow(900);
  const html = render();
  assert.doesNotMatch(html, /aria-label="Properties"/);
  assert.match(html, /Issues · 3/);
  assert.match(html, />Layers</);
});

test('a healthy sample shows a green "No issues" chip', () => {
  setWindow(1700);
  const html = render({ view: getFixture('ledger').view, base: { view: 'ledger' } });
  assert.match(html, /No issues/);
  assert.match(html, /Nothing wrong was found/);
});

test('the quality context feeds the list: a stale mapping and a deviation from the reference', () => {
  setWindow(1700);
  const quality = { grounding: { score: 1, ungrounded: [] }, acyclicity: { score: 1, cycles: [] }, layering: { score: 1, violations: [] }, balance: 1, components: 8, agreement: { score: 0.2, common: 30 } };
  const html = render({ view: getFixture('ledger').view, base: { view: 'ledger' }, issueContext: { quality, stale: true, canEdit: true }, onIssueAction() {} });
  assert.match(html, /Differs from the intended architecture/);
  assert.match(html, /The components are out of date/);
  assert.match(html, /Regenerate components/);
});

test('the inner view keeps the same issue count and says the list is for the whole map', () => {
  setWindow(1700);
  const outer = render();
  const inner = render({ hash: 'detail=order' });
  assert.match(inner, /Issues for the whole map/);
  assert.doesNotMatch(outer, /Issues for the whole map/);
  assert.match(inner, /3 issues/);
  assert.match(inner, /Circular dependency between/);
});

test('full screen and the narrow layout leave room for the top-right button so the left group wraps instead of sliding under it', () => {
  setWindow(1700);
  assert.match(render({ focusMode: true }), /max-w-\[calc\(100%-9\.5rem\)\]/);
  assert.doesNotMatch(render(), /max-w-\[calc\(100%-9\.5rem\)\]/, 'with a panel beside the artboard there is no such button');
  setWindow(900);
  assert.match(render(), /max-w-\[calc\(100%-9\.5rem\)\]/);
});
