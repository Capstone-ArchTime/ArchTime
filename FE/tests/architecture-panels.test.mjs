import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOTH_OPEN_FROM, DRAWER_BELOW, OPEN_LAYER_SELECTOR, PANEL_KEY, escapeAction, escapeTaken, isFocusKey, isFrameKey, loadPanelChoice, panelLayout, parsePanelChoice,
  resolvePanels, savePanelChoice, setPanel, syncFullscreen, togglePanels,
} from '../src/features/architecture/panels.ts';

const input = (over = {}) => ({ width: 1700, focus: false, saved: {}, drawers: {}, ...over });
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, data }; };

test('the layout depends on the width: drawers when narrow, one panel by default when compact, both when roomy', () => {
  assert.equal(panelLayout(DRAWER_BELOW - 1), 'drawer');
  assert.equal(panelLayout(DRAWER_BELOW), 'compact');
  assert.equal(panelLayout(BOTH_OPEN_FROM - 1), 'compact');
  assert.equal(panelLayout(BOTH_OPEN_FROM), 'roomy');
  assert.deepEqual(resolvePanels(input({ width: 1700 })), { layout: 'roomy', overlay: false, left: true, right: true });
  assert.deepEqual(resolvePanels(input({ width: 1500 })), { layout: 'compact', overlay: false, left: false, right: true });
  assert.deepEqual(resolvePanels(input({ width: 900 })), { layout: 'drawer', overlay: true, left: false, right: false });
});

test('a remembered choice beats the default beside the artboard, but not over it', () => {
  assert.equal(resolvePanels(input({ width: 1500, saved: { left: true } })).left, true);
  assert.equal(resolvePanels(input({ width: 1700, saved: { right: false } })).right, false);
  // A narrow screen ignores the remembered choice: panels there are drawers, closed until asked for.
  assert.deepEqual(resolvePanels(input({ width: 900, saved: { left: true, right: true } })), { layout: 'drawer', overlay: true, left: false, right: false });
});

test('full screen hides both panels whatever the width or the remembered choice', () => {
  for (const width of [800, 1300, 1700]) {
    const view = resolvePanels(input({ width, focus: true, saved: { left: true, right: true } }));
    assert.equal(view.left, false); assert.equal(view.right, false); assert.equal(view.overlay, true);
  }
  // A panel can still be opened from there, as a drawer over the artboard.
  const next = setPanel(input({ width: 1700, focus: true }), 'right', true);
  assert.deepEqual(resolvePanels(input({ width: 1700, focus: true, ...next })), { layout: 'roomy', overlay: true, left: false, right: true });
});

test('toggling a panel beside the artboard is remembered; a drawer is not, and opening one closes the other', () => {
  const beside = setPanel(input({ width: 1700 }), 'left', false);
  assert.deepEqual(beside.saved, { left: false });
  assert.deepEqual(beside.drawers, {});
  const first = setPanel(input({ width: 900 }), 'left', true);
  assert.deepEqual(first, { saved: {}, drawers: { left: true } });
  const second = setPanel(input({ width: 900, ...first }), 'right', true);
  assert.deepEqual(second.drawers, { right: true }, 'the left drawer closes');
  assert.deepEqual(second.saved, {});
  assert.deepEqual(setPanel(input({ width: 900, ...second }), 'right', false).drawers, { right: false });
});

test('Ctrl + backslash hides what is open and shows the panels when none is', () => {
  assert.deepEqual(togglePanels(input({ width: 1700 })).saved, { left: false, right: false });
  assert.deepEqual(togglePanels(input({ width: 1700, saved: { left: false, right: false } })).saved, { left: true, right: true });
  assert.deepEqual(togglePanels(input({ width: 1500 })).saved, { left: false, right: false }, 'the right panel was open');
  assert.deepEqual(togglePanels(input({ width: 900 })).drawers, { right: true });
  assert.deepEqual(togglePanels(input({ width: 900, drawers: { left: true } })).drawers, {});
  assert.deepEqual(togglePanels(input({ width: 1700, focus: true })).drawers, { right: true });
});

test('the remembered choice survives a round trip and ignores garbage', () => {
  const store = memory();
  assert.equal(savePanelChoice({ left: false, right: true }, store), true);
  assert.deepEqual(JSON.parse(store.data.get(PANEL_KEY)), { left: false, right: true });
  assert.deepEqual(loadPanelChoice(store), { left: false, right: true });
  assert.deepEqual(parsePanelChoice('{"left":"yes","right":false,"other":1}'), { right: false });
  for (const bad of [null, undefined, '', 'nope', '[1]', '42', 'null']) assert.deepEqual(parsePanelChoice(bad), {});
});

test('missing or throwing storage never breaks the page', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadPanelChoice(throwing), {});
  assert.equal(savePanelChoice({ left: true }, throwing), false);
  assert.deepEqual(loadPanelChoice(null), {});
  assert.equal(savePanelChoice({ left: true }, null), false);
  // Without a browser (as in these tests) the default storage is simply absent.
  assert.deepEqual(loadPanelChoice(), {});
  assert.equal(savePanelChoice({ left: true }), false);
});

test('browser full screen and the in-page mode stay in step', () => {
  // Entering the browser's full screen turns the mode on; leaving it with Esc turns it off.
  const entered = syncFullscreen({ focus: false, withBrowser: false }, true);
  assert.deepEqual(entered, { focus: true, withBrowser: true });
  assert.deepEqual(syncFullscreen(entered, false), { focus: false, withBrowser: false });
  // The mode started by the in-page button alone (browser refused) is not ended by a stray fullscreenchange.
  const pageOnly = { focus: true, withBrowser: false };
  assert.deepEqual(syncFullscreen(pageOnly, false), pageOnly);
  assert.deepEqual(syncFullscreen({ focus: false, withBrowser: false }, false), { focus: false, withBrowser: false });
});

test('Shift + F is full screen and plain F stays zoom-to-selection', () => {
  assert.equal(isFocusKey({ key: 'F', shiftKey: true }), true);
  assert.equal(isFocusKey({ key: 'f', shiftKey: true }), true, 'caps lock with shift');
  assert.equal(isFocusKey({ key: 'f', shiftKey: false }), false);
  assert.equal(isFocusKey({ key: 'F', shiftKey: true, ctrlKey: true }), false);
  assert.equal(isFrameKey({ key: 'f' }), true);
  assert.equal(isFrameKey({ key: 'F', shiftKey: false }), true, 'caps lock alone');
  assert.equal(isFrameKey({ key: 'F', shiftKey: true }), false, 'the two keys never both fire');
  assert.equal(isFrameKey({ key: 'f', ctrlKey: true }), false);
});

test('Esc peels one layer per press: selection, inner view, then full screen', () => {
  assert.equal(escapeAction({ selection: true, detail: true, focus: true }), 'clear-selection');
  assert.equal(escapeAction({ selection: false, detail: true, focus: true }), 'close-detail');
  assert.equal(escapeAction({ selection: false, detail: false, focus: true }), 'exit-focus');
  assert.equal(escapeAction({ selection: false, detail: false, focus: false }), 'none');
});

test('Esc is left to an open menu or dialog, and to anyone who already handled it', () => {
  const shown = { getClientRects: () => [{}] };
  const hidden = { getClientRects: () => [] };
  const doc = (...els) => ({ querySelectorAll: () => els });
  assert.equal(escapeTaken({ defaultPrevented: false }, doc()), false);
  assert.equal(escapeTaken({ defaultPrevented: false }, doc(hidden, hidden)), false, 'closed popups stay in the DOM without a box');
  assert.equal(escapeTaken({ defaultPrevented: false }, doc(hidden, shown)), true);
  assert.equal(escapeTaken({ defaultPrevented: true }, doc()), true);
  assert.match(OPEN_LAYER_SELECTOR, /\.ant-dropdown/);
  assert.match(OPEN_LAYER_SELECTOR, /\.ant-modal-wrap/);
});
