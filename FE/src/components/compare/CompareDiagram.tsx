import type { CompareGraph, CompareGroup, CompareLink } from '@/features/compare-graph';
import { shortLabel } from '@/features/compare-graph';
import type { GraphLayout } from '@/features/architecture/layout';

export const GROUP_WIDTH = 200;
export const GROUP_HEIGHT = 62;

// Colours come from the theme variables, so the drawing follows the page's look (style, not SVG attributes, reads them).
const COLOUR = { added: '#4ade80', removed: '#f87171', changed: 'var(--at-warn)', line: 'var(--at-muted)', text: 'var(--at-text)', muted: 'var(--at-muted)', box: 'var(--at-panel-2)' };

type Side = 'base' | 'target';
const filesOn = (g: CompareGroup, side: Side) => (side === 'base' ? g.inBase : g.inTarget);
const countOn = (l: CompareLink, side: Side) => (side === 'base' ? l.base : l.target2);

/** How a folder is drawn on one side: what happened to it, seen from that revision. */
type Tone = 'added' | 'removed' | 'changed' | 'line';
const TONES: Tone[] = ['added', 'removed', 'changed', 'line'];
function groupTone(g: CompareGroup, side: Side): Tone {
  if (filesOn(g, side) === 0) return 'line';
  if (side === 'target' && g.status === 'added') return 'added';
  if (side === 'base' && g.status === 'removed') return 'removed';
  return g.status === 'changed' ? 'changed' : 'line';
}
function linkTone(l: CompareLink, side: Side): Tone {
  if (side === 'target' && l.status === 'added') return 'added';
  if (side === 'base' && l.status === 'removed') return 'removed';
  return l.status === 'changed' ? 'changed' : 'line';
}

/**
 * One revision of the comparison: folders as boxes, imports between them as arrows (thicker for more imports). Folders
 * that exist only in the other revision stay as dashed outlines, so both drawings line up box for box.
 */
export default function CompareDiagram({ graph, layout, side, label }: { graph: CompareGraph; layout: GraphLayout; side: Side; label: string }) {
  const byId = new Map(graph.groups.map(g => [g.id, g]));
  const links = new Map(graph.links.map(l => [l.id, l]));
  const max = Math.max(1, ...graph.links.map(l => countOn(l, side)));
  const present = graph.groups.filter(g => filesOn(g, side) > 0).length;
  const arrow = (tone: Tone) => `compare-arrow-${side}-${tone}`;
  return <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img"
    aria-label={`${label}: ${present} folders, ${graph.links.filter(l => countOn(l, side) > 0).length} folder dependencies`}>
    <defs>
      {TONES.map(tone => <marker key={tone} id={arrow(tone)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" style={{ fill: COLOUR[tone] }} />
      </marker>)}
    </defs>
    <g fill="none">
      {layout.edges.map(e => {
        const link = links.get(e.id);
        if (!link) return null;
        const n = countOn(link, side);
        // A dependency missing on this side is only hinted at, as the folder outlines are.
        if (!n) return <path key={e.id} d={e.path} strokeDasharray="3 5" strokeWidth={1} style={{ stroke: COLOUR.line, opacity: 0.18 }} />;
        const width = 1.2 + (2.8 * n) / max;
        const tone = linkTone(link, side);
        return <g key={e.id}>
          <path d={e.path} strokeWidth={width} markerEnd={`url(#${arrow(tone)})`} style={{ stroke: COLOUR[tone], opacity: link.status === 'same' ? 0.5 : 0.95 }} />
          {n > 1 && <text x={e.labelAt.x} y={e.labelAt.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" style={{ fill: COLOUR.muted, paintOrder: 'stroke', stroke: 'rgba(10,14,18,0.85)', strokeWidth: 3 }}>{n}</text>}
        </g>;
      })}
    </g>
    {layout.nodes.map(node => {
      const g = byId.get(node.id);
      if (!g) return null;
      const files = filesOn(g, side);
      const tone = groupTone(g, side);
      const delta = side === 'target' && files > 0 && (g.added || g.removed) ? ` · +${g.added} −${g.removed}` : '';
      return <g key={node.id} transform={`translate(${node.x}, ${node.y})`} opacity={files ? 1 : 0.4}>
        <title>{`${g.label}: ${files ? `${files} files` : `not in this revision`}${delta}`}</title>
        <rect width={node.width} height={node.height} rx="12" strokeWidth={files && tone !== 'line' ? 2 : 1} strokeDasharray={files ? undefined : '5 4'}
          style={{ fill: files ? COLOUR.box : 'transparent', stroke: COLOUR[tone] }} />
        <circle cx="17" cy={node.height / 2} r="4" style={{ fill: COLOUR[tone] }} />
        <text x="30" y="26" fontSize="14" fontWeight="600" style={{ fill: COLOUR.text }}>{shortLabel(g.label, 22)}</text>
        <text x="30" y="46" fontSize="12" style={{ fill: COLOUR.muted }}>{files ? `${files} file${files === 1 ? '' : 's'}${delta}` : 'not in this revision'}</text>
      </g>;
    })}
  </svg>;
}
