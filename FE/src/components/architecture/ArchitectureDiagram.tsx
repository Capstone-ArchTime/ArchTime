import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import DiagramSvg from './DiagramSvg';
import type { DiagramSvgProps } from './DiagramSvg';
import Minimap from './Minimap';
import { boundsOf, centerOn, fitAll, frame, visibleRect, wheel, zoomAt } from '@/features/architecture/viewport';
import type { Size, Transform } from '@/features/architecture/viewport';

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** What the floating controls drawn over the artboard can read and do. */
export interface Viewport {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Whole diagram. */
  fit: () => void;
  /** The selection (focused node and what it highlights), or the whole diagram when nothing is selected. */
  frameSelection: () => void;
  /** Brings these nodes into view, zooming out if they do not fit. */
  reveal: (ids: string[]) => void;
  minimap: boolean;
  toggleMinimap: () => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  setZoom: (k: number) => void;
  /** Where popups go, so they stay visible in full screen. */
  container: () => HTMLElement;
}

/**
 * The artboard: the diagram on a dotted canvas that fills the space, with design-tool navigation. Scroll or two-finger
 * swipe pans, Ctrl/Cmd + scroll or pinch zooms at the cursor, dragging the background pans, and +, -, 0, F, M work from the
 * keyboard. Controls are drawn by the caller through `overlay`, on top of the canvas.
 */
export default function ArchitectureDiagram(props: Omit<DiagramSvgProps, 'interactive' | 'svgRef'> & {
  className?: string;
  gridColor?: string;
  overlay?: (viewport: Viewport) => ReactNode;
}) {
  const { className, gridColor = '#1e2732', overlay, ...svgProps } = props;
  const { layout, highlight, selectedNode, theme, scene } = svgProps;
  const shell = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [manual, setManual] = useState<(Transform & { key: string }) | null>(null);
  const [minimap, setMinimap] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // A manual pan/zoom belongs to the layout it was made for; another diagram (or the inner view) is fitted again.
  const key = `${layout.width}x${layout.height}:${layout.nodes.length}`;
  const t: Transform = manual && manual.key === key ? manual : fitAll(size, layout);
  const update = (next: Transform) => setManual({ ...next, key });

  const placed = (ids: Iterable<string>) => {
    const want = new Set(ids);
    return layout.nodes.filter(n => want.has(n.id));
  };

  const viewport: Viewport = {
    zoom: t.k,
    zoomIn: () => update(zoomAt(t, 1.25, size.w / 2, size.h / 2)),
    zoomOut: () => update(zoomAt(t, 0.8, size.w / 2, size.h / 2)),
    fit: () => setManual(null),
    frameSelection: () => {
      const ids = highlight?.nodes ? [...highlight.nodes] : selectedNode ? [selectedNode] : [];
      const rect = boundsOf(placed(ids));
      if (rect) update(frame(size, rect)); else setManual(null);
    },
    reveal: ids => {
      const nodes = placed(ids);
      const rect = boundsOf(nodes);
      if (!rect) return;
      const seen = visibleRect(t, size);
      const inside = rect.x >= seen.x && rect.y >= seen.y && rect.x + rect.width <= seen.x + seen.width && rect.y + rect.height <= seen.y + seen.height;
      if (inside) return;
      // Keep the zoom when the nodes fit at it; otherwise zoom out just enough.
      const fits = rect.width * t.k <= size.w - 48 && rect.height * t.k <= size.h - 144;
      update(fits ? centerOn(t, size, rect.x + rect.width / 2, rect.y + rect.height / 2) : frame(size, rect, { maxZoom: t.k }));
    },
    minimap,
    toggleMinimap: () => setMinimap(v => !v),
    fullscreen,
    toggleFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void shell.current?.requestFullscreen?.();
    },
    setZoom: k => update(zoomAt(t, k / t.k, size.w / 2, size.h / 2)),
    container: () => shell.current ?? document.body,
  };
  // Keyboard shortcuts read the latest viewport without re-binding the listener on every render.
  const vp = useRef(viewport);
  useEffect(() => { vp.current = viewport; });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault(); // the artboard owns the wheel; the page scrolls from outside it
      const rect = el.getBoundingClientRect();
      update(wheel(t, event, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const v = vp.current;
      if (event.key === '+' || event.key === '=') v.zoomIn();
      else if (event.key === '-' || event.key === '_') v.zoomOut();
      else if (event.key === '0') v.fit();
      else if (event.key.toLowerCase() === 'f') v.frameSelection();
      else if (event.key.toLowerCase() === 'm') v.toggleMinimap();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest('[data-node],[data-edge],[data-overlay]')) return;
    drag.current = { x: event.clientX, y: event.clientY, tx: t.tx, ty: t.ty };
    setDragging(true);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (d) update({ k: t.k, tx: d.tx + event.clientX - d.x, ty: d.ty + event.clientY - d.y });
  };
  const onPointerUp = () => { drag.current = null; setDragging(false); };

  const grid = 24 * t.k;
  return (
    <div ref={shell} className={`relative ${fullscreen ? 'h-screen w-screen' : className ?? ''}`} style={{ background: theme.background }}>
      <div ref={box} className="absolute inset-0 overflow-hidden touch-none select-none"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          backgroundImage: grid >= 6 ? `radial-gradient(circle, ${gridColor} ${Math.max(0.8, t.k)}px, transparent ${Math.max(0.8, t.k)}px)` : undefined,
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${t.tx}px ${t.ty}px`,
        }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        role="application" aria-label="Architecture diagram. Scroll to pan, Ctrl and scroll to zoom.">
        <div style={{ transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.k})`, transformOrigin: '0 0', width: layout.width, height: layout.height }}>
          <DiagramSvg {...svgProps} interactive />
        </div>
      </div>
      {minimap && size.w > 0 && (layout.width * t.k > size.w || layout.height * t.k > size.h) && (
        <Minimap scene={scene} layout={layout} theme={theme} highlight={highlight} view={visibleRect(t, size)}
          onMove={(x, y) => update(centerOn(t, size, x, y))} />
      )}
      <ConfigProvider getPopupContainer={viewport.container}>{overlay?.(viewport)}</ConfigProvider>
    </div>
  );
}
