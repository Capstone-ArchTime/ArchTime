import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsOf, centerOn, clampZoom, fitAll, frame, MAX_ZOOM, MIN_ZOOM, visibleRect, wheel, zoomAt } from '../src/features/architecture/viewport.ts';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const screen = (t, x, y) => ({ x: x * t.k + t.tx, y: y * t.k + t.ty });
const NO_PAD = { pad: { top: 0, right: 0, bottom: 0, left: 0 } };

test('framing fits a rectangle in the box, centred, and never zooms past the limit', () => {
  const t = frame({ w: 1000, h: 500 }, { x: 0, y: 0, width: 2000, height: 500 }, NO_PAD);
  close(t.k, 0.5);
  const tl = screen(t, 0, 0), br = screen(t, 2000, 500);
  close(tl.x, 0); close(br.x, 1000);
  close((tl.y + br.y) / 2, 250, 1e-6);
  const small = frame({ w: 1000, h: 500 }, { x: 10, y: 10, width: 20, height: 20 }, NO_PAD);
  assert.equal(small.k, 1.15, 'a tiny selection is not blown up');
  const centre = screen(small, 20, 20);
  close(centre.x, 500); close(centre.y, 250);
  // The default padding keeps the drawing clear of the floating toolbars.
  const padded = fitAll({ w: 1000, h: 600 }, { width: 1000, height: 600 });
  assert.ok(screen(padded, 0, 600).y <= 600 - 88 + 1e-6);
  assert.deepEqual(frame({ w: 0, h: 0 }, { x: 0, y: 0, width: 10, height: 10 }), { k: 1, tx: 0, ty: 0 });
});

test('a huge diagram is fitted at the minimum zoom, not smaller', () => {
  const t = fitAll({ w: 800, h: 600 }, { width: 100_000, height: 100_000 });
  assert.equal(t.k, MIN_ZOOM);
  assert.equal(clampZoom(99), MAX_ZOOM);
});

test('zooming keeps the point under the cursor still', () => {
  const t = { k: 1, tx: 30, ty: -20 };
  const before = { x: (400 - t.tx) / t.k, y: (300 - t.ty) / t.k };
  const z = zoomAt(t, 2, 400, 300);
  assert.equal(z.k, 2);
  const after = screen(z, before.x, before.y);
  close(after.x, 400); close(after.y, 300);
});

test('wheel pans, Ctrl or Cmd + wheel (and trackpad pinch) zooms at the cursor', () => {
  const t = { k: 1, tx: 0, ty: 0 };
  const plain = { deltaX: 10, deltaY: 40, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false };
  assert.deepEqual(wheel(t, plain, { x: 0, y: 0 }), { k: 1, tx: -10, ty: -40 });
  assert.deepEqual(wheel(t, { ...plain, deltaMode: 1, deltaX: 0, deltaY: 3 }, { x: 0, y: 0 }), { k: 1, tx: 0, ty: -48 }, 'lines become pixels');
  assert.deepEqual(wheel(t, { ...plain, deltaX: 0, shiftKey: true }, { x: 0, y: 0 }), { k: 1, tx: -40, ty: 0 }, 'shift + wheel scrolls sideways');
  const zoomIn = wheel(t, { ...plain, ctrlKey: true, deltaY: -100 }, { x: 200, y: 100 });
  assert.ok(zoomIn.k > 1);
  const zoomOut = wheel(t, { ...plain, metaKey: true, deltaY: 100 }, { x: 200, y: 100 });
  assert.ok(zoomOut.k < 1);
});

test('centring, bounds and the visible part of the diagram', () => {
  const c = centerOn({ k: 2, tx: 0, ty: 0 }, { w: 800, h: 600 }, 100, 50);
  const p = screen(c, 100, 50);
  close(p.x, 400); close(p.y, 300);
  assert.deepEqual(boundsOf([{ x: 10, y: 20, width: 100, height: 50 }, { x: 300, y: 0, width: 20, height: 20 }], 0), { x: 10, y: 0, width: 310, height: 70 });
  assert.equal(boundsOf([]), null);
  assert.deepEqual(visibleRect({ k: 2, tx: -100, ty: -50 }, { w: 800, h: 600 }), { x: 50, y: 25, width: 400, height: 300 });
});
