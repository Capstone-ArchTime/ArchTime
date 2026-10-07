// Pan and zoom of the artboard, as plain functions of the box size and the drawing. A transform maps a diagram point
// (x, y) to the screen point (x * k + tx, y * k + ty).

export type Transform = { k: number; tx: number; ty: number };
export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; width: number; height: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;
export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** Shows `rect` (in diagram coordinates) as large as fits, centred, never above `maxZoom`. `pad` keeps it off the edges and toolbars. */
export function frame(box: Size, rect: Rect, { pad = { top: 56, right: 24, bottom: 88, left: 24 }, maxZoom = 1.15 } = {}): Transform {
  if (!box.w || !box.h || rect.width <= 0 || rect.height <= 0) return { k: 1, tx: 0, ty: 0 };
  const room = { w: Math.max(40, box.w - pad.left - pad.right), h: Math.max(40, box.h - pad.top - pad.bottom) };
  const k = clampZoom(Math.min(room.w / rect.width, room.h / rect.height, maxZoom));
  return {
    k,
    tx: pad.left + (room.w - rect.width * k) / 2 - rect.x * k,
    ty: pad.top + (room.h - rect.height * k) / 2 - rect.y * k,
  };
}

/** The whole drawing. */
export const fitAll = (box: Size, content: { width: number; height: number }) => frame(box, { x: 0, y: 0, width: content.width, height: content.height });

/** Zooms by `factor` keeping the screen point (cx, cy) still, so the zoom follows the cursor or the pinch. */
export function zoomAt(t: Transform, factor: number, cx: number, cy: number): Transform {
  const k = clampZoom(t.k * factor);
  return { k, tx: cx - ((cx - t.tx) / t.k) * k, ty: cy - ((cy - t.ty) / t.k) * k };
}

/** Moves the view so the diagram point (x, y) sits in the middle of the box, keeping the zoom. */
export function centerOn(t: Transform, box: Size, x: number, y: number): Transform {
  return { k: t.k, tx: box.w / 2 - x * t.k, ty: box.h / 2 - y * t.k };
}

/** Bounding box of some nodes, grown by `margin` (diagram units). Null when none of them is placed. */
export function boundsOf(nodes: { x: number; y: number; width: number; height: number }[], margin = 40): Rect | null {
  if (!nodes.length) return null;
  const x0 = Math.min(...nodes.map(n => n.x)), y0 = Math.min(...nodes.map(n => n.y));
  const x1 = Math.max(...nodes.map(n => n.x + n.width)), y1 = Math.max(...nodes.map(n => n.y + n.height));
  return { x: x0 - margin, y: y0 - margin, width: x1 - x0 + 2 * margin, height: y1 - y0 + 2 * margin };
}

/** The part of the diagram on screen, in diagram coordinates (for the minimap's viewport rectangle). */
export function visibleRect(t: Transform, box: Size): Rect {
  return { x: -t.tx / t.k, y: -t.ty / t.k, width: box.w / t.k, height: box.h / t.k };
}

/**
 * Wheel and trackpad, as in design tools: scrolling pans, Ctrl/Cmd + wheel and trackpad pinch (reported as Ctrl + wheel)
 * zoom at the cursor. Line- and page-based wheels are converted to pixels.
 */
export function wheel(t: Transform, event: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, cursor: { x: number; y: number }): Transform {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  const dx = event.deltaX * unit, dy = event.deltaY * unit;
  if (event.ctrlKey || event.metaKey) return zoomAt(t, Math.exp(-dy * 0.0025), cursor.x, cursor.y);
  // Shift + wheel scrolls sideways on mice that only have a vertical wheel.
  return event.shiftKey && !dx ? { ...t, tx: t.tx - dy } : { ...t, tx: t.tx - dx, ty: t.ty - dy };
}
