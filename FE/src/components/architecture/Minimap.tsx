import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GraphLayout } from '@/features/architecture/layout';
import type { Scene } from '@/features/architecture/scene';
import type { Highlight } from '@/features/architecture/highlight';
import type { DiagramTheme } from '@/features/architecture/theme';
import type { Rect } from '@/features/architecture/viewport';

const WIDTH = 200;
const MAX_HEIGHT = 140;

/** The whole diagram in small, with the part on screen outlined. Click or drag in it to move there. */
export default function Minimap({ scene, layout, theme, highlight, view, onMove }: {
  scene: Scene; layout: GraphLayout; theme: DiagramTheme; highlight?: Highlight; view: Rect; onMove: (x: number, y: number) => void;
}) {
  const s = Math.min(WIDTH / layout.width, MAX_HEIGHT / layout.height);
  const w = layout.width * s, h = layout.height * s;
  const role = new Map(scene.nodes.map(n => [n.id, n.role]));
  const dragging = useRef(false);
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    onMove((event.clientX - r.left) / s, (event.clientY - r.top) / s);
  };
  return (
    <div data-overlay className="absolute bottom-20 right-3 rounded-md border p-1.5 shadow-lg backdrop-blur" style={{ background: `${theme.card}e6`, borderColor: theme.cardStroke }}>
      <svg width={w} height={h} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Minimap: click or drag to move around the diagram" style={{ cursor: 'pointer', display: 'block' }}
        onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
        onPointerMove={event => { if (dragging.current) move(event); }}
        onPointerUp={() => { dragging.current = false; }}>
        {layout.edges.map(e => <path key={e.id} d={e.path} fill="none" stroke={theme.edgeDim} strokeWidth={2 / s / 4} />)}
        {layout.nodes.map(n => {
          const r = role.get(n.id);
          const dim = !!highlight?.nodes && !highlight.nodes.has(n.id);
          return <rect key={n.id} x={n.x} y={n.y} width={n.width} height={n.height} rx={6} fill={r ? theme.role[r] : theme.muted} opacity={dim ? 0.25 : 0.85} />;
        })}
        <rect x={view.x} y={view.y} width={view.width} height={view.height} fill={`${theme.focus}1f`} stroke={theme.focus} strokeWidth={1.5 / s} rx={4 / s} />
      </svg>
    </div>
  );
}
