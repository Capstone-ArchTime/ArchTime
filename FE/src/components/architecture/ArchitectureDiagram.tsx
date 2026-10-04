import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import DiagramSvg from './DiagramSvg';
import type { DiagramSvgProps } from './DiagramSvg';

type Transform = { k: number; tx: number; ty: number };
const MIN_K = 0.25;
const MAX_K = 2.5;
const clamp = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

function fit(box: { w: number; h: number }, content: { width: number; height: number }): Transform {
  if (!box.w || !box.h) return { k: 1, tx: 0, ty: 0 };
  const k = clamp(Math.min((box.w - 24) / content.width, (box.h - 24) / content.height, 1.15));
  return { k, tx: (box.w - content.width * k) / 2, ty: Math.max(12, (box.h - content.height * k) / 2) };
}

/** Pannable, zoomable viewer around DiagramSvg. Drag to pan, Ctrl/Cmd + wheel (or the buttons) to zoom. */
export default function ArchitectureDiagram(props: Omit<DiagramSvgProps, 'interactive' | 'svgRef'> & { className?: string }) {
  const { className, ...svgProps } = props;
  const { layout } = svgProps;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [manual, setManual] = useState<(Transform & { key: string }) | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A manual pan/zoom only applies to the layout it was made for; a different diagram is fitted again.
  const key = `${layout.width}x${layout.height}:${layout.nodes.length}`;
  const t: Transform = manual && manual.key === key ? manual : fit(size, layout);
  const update = (next: Transform) => setManual({ ...next, key });
  const [dragging, setDragging] = useState(false);

  const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2) => {
    const k = clamp(t.k * factor);
    update({ k, tx: cx - ((cx - t.tx) / t.k) * k, ty: cy - ((cy - t.ty) / t.k) * k });
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return; // plain scrolling keeps scrolling the page
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (event: ReactPointerEvent) => {
    if ((event.target as Element).closest('[data-node],[data-edge],button')) return;
    drag.current = { x: event.clientX, y: event.clientY, tx: t.tx, ty: t.ty, moved: false };
    setDragging(true);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    update({ k: t.k, tx: d.tx + dx, ty: d.ty + dy });
  };
  const onPointerUp = () => { drag.current = null; setDragging(false); };

  const fitNow = () => setManual(null);
  return (
    <div className={`relative overflow-hidden border border-[#222c37] bg-[#080b0e] touch-none ${className ?? ''}`} ref={box} style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div style={{ transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.k})`, transformOrigin: '0 0', width: layout.width, height: layout.height }}>
        <DiagramSvg {...svgProps} interactive />
      </div>
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        {[
          { label: 'Zoom in', icon: <Plus size={14} />, run: () => zoomAt(1.25) },
          { label: 'Zoom out', icon: <Minus size={14} />, run: () => zoomAt(0.8) },
          { label: 'Fit diagram to view', icon: <Maximize2 size={14} />, run: fitNow },
        ].map(b => (
          <button key={b.label} type="button" aria-label={b.label} title={b.label} onClick={b.run}
            className="h-8 w-8 flex items-center justify-center bg-[#161d24] border border-[#2a3441] text-[#cbd5e1] hover:border-[#38bdf8] hover:text-white">{b.icon}</button>
        ))}
      </div>
      <p className="absolute bottom-3 left-3 text-[10px] text-[#64748b] pointer-events-none">{Math.round(t.k * 100)}% · drag to pan · Ctrl + scroll to zoom</p>
    </div>
  );
}
